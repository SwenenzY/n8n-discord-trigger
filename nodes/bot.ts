import {
    Client, GatewayIntentBits, ChannelType, Guild,
    EmbedBuilder,
    ColorResolvable,
    AttachmentBuilder,
    TextChannel,
    Message,
    ActionRowBuilder,
    ButtonBuilder,
    Partials,
    MessageComponentInteraction,
    ButtonStyle,
    VoiceChannel,
    VoiceState,
} from 'discord.js';
import {
    joinVoiceChannel,
    EndBehaviorType,
    VoiceConnectionStatus,
} from '@discordjs/voice';
import * as fs from 'fs';
import * as path from 'path';


import ipc from 'node-ipc';
import {
    ICredentials,
} from './helper';
import settings, { saveDisabledChannels } from './settings';
import { IDiscordInteractionMessageParameters, IDiscordNodeActionParameters } from './DiscordInteraction/DiscordInteraction.node';
import BotSingleton from './botSingleton';

export default async function () {
    const botSingleton = BotSingleton.getInstance();

    // Try to acquire lock
    const hasLock = await botSingleton.acquireLock();

    if (!hasLock) {
        console.log('Discord bot is already running in another process, connecting to existing IPC server...');
        return;
    }

    console.log('Starting Discord bot with exclusive lock...');

    ipc.config.id = 'bot';
    ipc.config.retry = 1500;
    ipc.config.silent = true;

    // Configure socket path based on platform
    if ( process.platform === 'win32' ) {
        ipc.config.socketRoot = '\\\\.\\pipe\\';
        ipc.config.appspace = '';
    } else {
        // Unix-like systems (Linux, macOS)
        ipc.config.socketRoot = '/tmp/';
        ipc.config.appspace = 'app.';
    }

    function spawnClient ( token: string, clientId: string ): Client {
        const botSingleton = BotSingleton.getInstance();

        // Check if client already exists
        const existingClient = botSingleton.getClient(token);
        if (existingClient) {
            console.log(`Reusing existing Discord client for token ${token.substring(0, 10)}...`);
            return existingClient;
        }

        console.log(`Creating new Discord client for token ${token.substring(0, 10)}...`);

        const client = new Client( {
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.GuildMembers,
                GatewayIntentBits.GuildPresences,
                GatewayIntentBits.GuildModeration,
                GatewayIntentBits.GuildMessageReactions,
                GatewayIntentBits.GuildMessageTyping,
                GatewayIntentBits.DirectMessages,
                GatewayIntentBits.DirectMessageReactions,
                GatewayIntentBits.MessageContent,
                GatewayIntentBits.GuildVoiceStates, // Add voice states for voice channel support
            ],
            allowedMentions: {
                parse: [ 'roles', 'users', 'everyone' ],
            },
            partials: [ Partials.Message, Partials.Channel, Partials.Reaction, Partials.User ],
        } );

        client.on( 'guildMemberAdd', ( guildMember ) => {
            const triggerMap = settings.triggerNodes[ token ];
            for ( const [ nodeId, parameters ] of Object.entries( triggerMap ) as [ string, any ] ) {
                try {
                    if ( 'user-join' !== parameters.type )
                        continue;

                    if ( parameters.guildIds && parameters.guildIds.length && !parameters.guildIds.includes( guildMember.guild.id ) )
                        continue;

                    ipc.server.emit( parameters.socket, 'guildMemberAdd', {
                        guildMember: guildMember,
                        guild: guildMember.guild,
                        user: guildMember.user,
                        nodeId: nodeId
                    } );

                } catch ( e ) {
                    console.log( e );
                }
            }
        } );

        client.on( 'guildMemberRemove', ( guildMember ) => {
            const triggerMap = settings.triggerNodes[ token ];
            for ( const [ nodeId, parameters ] of Object.entries( triggerMap ) as [ string, any ] ) {
                try {
                    if ( 'user-leave' !== parameters.type )
                        continue;

                    if ( parameters.guildIds && parameters.guildIds.length && !parameters.guildIds.includes( guildMember.guild.id ) )
                        continue;

                    ipc.server.emit( parameters.socket, 'guildMemberRemove', {
                        guildMember: guildMember,
                        guild: guildMember.guild,
                        user: guildMember.user,
                        nodeId: nodeId
                    } );

                } catch ( e ) {
                    console.log( e );
                }
            }
        } );

        client.on( 'guildMemberUpdate', ( oldMember, newMember ) => {
            const triggerMap = settings.triggerNodes[ token ];
            for ( const [ nodeId, parameters ] of Object.entries( triggerMap ) as [ string, any ] ) {
                try {
                    if ( 'user-update' !== parameters.type )
                        continue;

                    if ( parameters.guildIds && parameters.guildIds.length && !parameters.guildIds.includes( oldMember.guild.id ) )
                        continue;

                    ipc.server.emit( parameters.socket, 'guildMemberUpdate', {
                        oldMember: oldMember,
                        newMember: newMember,
                        guild: oldMember.guild,
                        nodeId: nodeId
                    } );

                } catch ( e ) {
                    console.log( e );
                }
            }
        } );

        client.on( 'messageReactionAdd', async ( messageReaction, user ) => {
            let message: any = null;
            const triggerMap = settings.triggerNodes[ token ];
            for ( const [ nodeId, parameters ] of Object.entries( triggerMap ) as [ string, any ] ) {
                try {
                    if ( 'message-reaction-add' !== parameters.type )
                        continue;

                    if ( !message ) {
                        // If the message this reaction belongs to was removed, the fetching might result in an API error which should be handled
                        try {
                            await messageReaction.fetch();
                            message = messageReaction.message;
                        } catch ( error ) {
                            console.error( 'Something went wrong when fetching the message:', error );
                            continue;
                        }
                    }

                    // ignore messageReactions of other bots
                    const triggerOnExternalBot = parameters.additionalFields?.externalBotTrigger || false;
                    if ( !triggerOnExternalBot ) {
                        if ( user.bot || user.system ) continue;
                    }
                    else if ( user.id === message.client.user.id ) continue;

                    if ( parameters.guildIds && parameters.guildIds.length && message.guild && !parameters.guildIds.includes( message.guild.id ) )
                        continue;

                    if ( parameters.messageIds.length && !parameters.messageIds.includes( message.id ) )
                        continue;

                    // check if executed by the proper category
                    if ( parameters.categoryIds && parameters.categoryIds.length ) {
                        const channel = message.channel as any;
                        const parentId = channel.parentId;
                        if ( !parentId || !parameters.categoryIds.includes( parentId ) ) continue;
                    }

                    // check if executed by the proper channel
                    if ( parameters.channelIds && parameters.channelIds.length ) {
                        const isInChannel = parameters.channelIds.some( ( channelId: any ) => message.channel.id?.includes( channelId ) );
                        if ( !isInChannel ) continue;
                    }

                    // check if executed by the proper role
                    const userRoles = message.member?.roles.cache.map( ( role: any ) => role.id );
                    if ( parameters.roleIds && parameters.roleIds.length ) {
                        const hasRole = parameters.roleIds.some( ( role: any ) => userRoles?.includes( role ) );
                        if ( !hasRole ) continue;
                    }

                    ipc.server.emit( parameters.socket, 'messageReactionAdd', {
                        messageReaction: messageReaction,
                        message: message,
                        user: user,
                        guild: message.guild,
                        nodeId: nodeId
                    } );

                } catch ( e ) {
                    console.log( e );
                }
            }
        } );

        client.on( 'messageReactionRemove', async ( messageReaction, user ) => {
            let message: any = null;
            const triggerMap = settings.triggerNodes[ token ];
            for ( const [ nodeId, parameters ] of Object.entries( triggerMap ) as [ string, any ] ) {
                try {
                    if ( 'message-reaction-remove' !== parameters.type )
                        continue;

                    if ( !message ) {
                        try {
                            await messageReaction.fetch();
                            message = messageReaction.message;
                        } catch ( error ) {
                            console.error( 'Something went wrong when fetching the message:', error );
                            continue;
                        }
                    }

                    // ignore messageReactions of other bots
                    const triggerOnExternalBot = parameters.additionalFields?.externalBotTrigger || false;
                    if ( !triggerOnExternalBot ) {
                        if ( user.bot || user.system ) continue;
                    }
                    else if ( user.id === message.client.user.id ) continue;

                    if ( parameters.guildIds && parameters.guildIds.length && message.guild && !parameters.guildIds.includes( message.guild.id ) )
                        continue;

                    if ( parameters.messageIds.length && !parameters.messageIds.includes( message.id ) )
                        continue;

                    // check if executed by the proper category
                    if ( parameters.categoryIds && parameters.categoryIds.length ) {
                        const channel = message.channel as any;
                        const parentId = channel.parentId;
                        if ( !parentId || !parameters.categoryIds.includes( parentId ) ) continue;
                    }

                    // check if executed by the proper channel
                    if ( parameters.channelIds && parameters.channelIds.length ) {
                        const isInChannel = parameters.channelIds.some( ( channelId: any ) => message.channel.id?.includes( channelId ) );
                        if ( !isInChannel ) continue;
                    }

                    // check if executed by the proper role
                    const userRoles = message.member?.roles.cache.map( ( role: any ) => role.id );
                    if ( parameters.roleIds && parameters.roleIds.length ) {
                        const hasRole = parameters.roleIds.some( ( role: any ) => userRoles?.includes( role ) );
                        if ( !hasRole ) continue;
                    }
                    ipc.server.emit( parameters.socket, 'messageReactionRemove', {
                        messageReaction: messageReaction,
                        message: message,
                        user: user,
                        guild: message.guild,
                        nodeId: nodeId
                    } );

                } catch ( e ) {
                    console.log( e );
                }
            }
        } );

        client.on( 'roleCreate', ( role ) => {
            const triggerMap = settings.triggerNodes[ token ];
            for ( const [ nodeId, parameters ] of Object.entries( triggerMap ) as [ string, any ] ) {
                try {
                    if ( 'role-create' !== parameters.type )
                        continue;

                    if ( parameters.guildIds && parameters.guildIds.length && !parameters.guildIds.includes( role.guild.id ) )
                        continue;

                    ipc.server.emit( parameters.socket, 'roleCreate', {
                        role: role,
                        guild: role.guild,
                        nodeId: nodeId
                    } );

                } catch ( e ) {
                    console.log( e );
                }
            }
        } );

        client.on( 'roleDelete', ( role ) => {
            const triggerMap = settings.triggerNodes[ token ];
            for ( const [ nodeId, parameters ] of Object.entries( triggerMap ) as [ string, any ] ) {
                try {
                    if ( 'role-delete' !== parameters.type )
                        continue;

                    if ( parameters.guildIds && parameters.guildIds.length && !parameters.guildIds.includes( role.guild.id ) )
                        continue;

                    ipc.server.emit( parameters.socket, 'roleDelete', {
                        role: role,
                        guild: role.guild,
                        nodeId: nodeId
                    } );

                } catch ( e ) {
                    console.log( e );
                }
            }
        } );

        client.on( 'roleUpdate', ( oldRole, newRole ) => {
            if (
                oldRole.name === newRole.name &&
                oldRole.color === newRole.color &&
                oldRole.hoist === newRole.hoist &&
                oldRole.permissions.bitfield === newRole.permissions.bitfield &&
                oldRole.mentionable === newRole.mentionable &&
                oldRole.icon === newRole.icon &&
                oldRole.unicodeEmoji === newRole.unicodeEmoji
            ) {
                return; // Skip processing if no meaningful changes were made
            }

            const triggerMap = settings.triggerNodes[ token ];
            for ( const [ nodeId, parameters ] of Object.entries( triggerMap ) as [ string, any ] ) {
                try {
                    if ( 'role-update' !== parameters.type )
                        continue;

                    if ( parameters.guildIds && parameters.guildIds.length && !parameters.guildIds.includes( oldRole.guild.id ) )
                        continue;

                    ipc.server.emit( parameters.socket, 'roleUpdate', {
                        oldRole,
                        newRole,
                        guild: oldRole.guild,
                        nodeId: nodeId
                    } );

                } catch ( e ) {
                    console.log( e );
                }
            }
        } );

        // whenever a message is created this listener is called
        const onMessageCreate = async ( message: Message ) => {

            console.log( "message created", message.id, message.content );

            // Handle support commands (/support-close, /support-open) - Bot-only, no n8n trigger
            if ( message.content === '/support-close' || message.content === '/support-open' ) {
                try {
                    // Only works in guild channels (not DMs)
                    if ( !message.guild || !message.member ) {
                        await message.reply( 'This command can only be used in server channels.' );
                        return;
                    }

                    // Permission check: User must have MANAGE_CHANNELS permission
                    if ( !message.member.permissions.has( 'ManageChannels' ) ) {
                        await message.reply( 'You do not have permission to use this command. Required permission: Manage Channels' );
                        return;
                    }

                    const channelId = message.channel.id;
                    const action = message.content === '/support-close' ? 'close' : 'open';

                    // Toggle channel status
                    if ( action === 'close' ) {
                        settings.disabledChannels.add( channelId );
                        saveDisabledChannels( settings.disabledChannels );
                        await message.reply( '✅ Ticket closed. This channel will no longer trigger workflows.' );
                        console.log( `Channel ${channelId} disabled by ${message.author.tag}` );
                    } else {
                        settings.disabledChannels.delete( channelId );
                        saveDisabledChannels( settings.disabledChannels );
                        await message.reply( '✅ Ticket opened. This channel will now trigger workflows.' );
                        console.log( `Channel ${channelId} enabled by ${message.author.tag}` );
                    }
                } catch ( e ) {
                    console.error( 'Error handling support command:', e );
                    await message.reply( '❌ An error occurred while processing the command.' ).catch( () => {} );
                }
                return; // Don't process as regular message
            }

            // resolve the message reference if it exists
            let messageReference: Message | null = null;
            let messageRerenceFetched = !( message.reference );

            // iterate through all nodes and see if we need to trigger some
            for ( const [ nodeId, parameters ] of Object.entries( settings.triggerNodes[ token ] ) as [ string, any ] ) {
                try {
                    // Check if this is a direct message or a regular message type
                    const isDirectMessage = message.channel.type === ChannelType.DM;

                    // Check if this channel is disabled (for support tickets)
                    if ( !isDirectMessage && settings.disabledChannels.has( message.channel.id ) ) {
                        continue; // Skip disabled channels
                    }

                    // Skip if this node doesn't match the message type
                    if ( parameters.type === 'direct-message' && !isDirectMessage ) continue;
                    if ( parameters.type === 'message' && isDirectMessage ) continue;
                    if ( parameters.type !== 'message' && parameters.type !== 'direct-message' ) continue;

                    const pattern = parameters.pattern;

                    const triggerOnExternalBot = parameters.additionalFields?.externalBotTrigger || false;
                    const onlyWithAttachments = parameters.additionalFields?.attachmentsRequired || false;

                    // ignore messages of other bots
                    if ( !triggerOnExternalBot ) {
                        if ( message.author.bot || message.author.system ) continue;
                    }
                    else if ( message.author.id === message.client.user.id ) continue;

                    // For guild messages, check guild ID filter (skip for direct messages)
                    if ( !isDirectMessage && parameters.guildIds && parameters.guildIds.length && message.guild && !parameters.guildIds.includes( message.guild.id ) )
                        continue;

                    // check if executed by the proper role (skip for direct messages)
                    const userRoles = !isDirectMessage ? message.member?.roles.cache.map( ( role: any ) => role.id ) : [];
                    if ( !isDirectMessage && parameters.roleIds && parameters.roleIds.length ) {
                        const hasRole = parameters.roleIds.some( ( role: any ) => userRoles?.includes( role ) );
                        if ( !hasRole ) continue;
                    }

                    // check if executed by the proper category (skip for direct messages)
                    if ( !isDirectMessage && parameters.categoryIds && parameters.categoryIds.length ) {
                        const channel = message.channel as any;
                        const parentId = channel.parentId;
                        if ( !parentId || !parameters.categoryIds.includes( parentId ) ) continue;
                    }

                    // check if executed by the proper channel (skip for direct messages)
                    if ( !isDirectMessage && parameters.channelIds && parameters.channelIds.length ) {
                        const isInChannel = parameters.channelIds.some( ( channelId: any ) => message.channel.id?.includes( channelId ) );
                        if ( !isInChannel ) continue;
                    }

                    // check if the message has to have a message that was responded to
                    if ( parameters.messageReferenceRequired && !message.reference ) {
                        continue;
                    }

                    // fetch the message reference only once and only if needed, even if multiple triggers are installed
                    if ( !messageRerenceFetched ) {
                        messageReference = await message.fetchReference();
                        messageRerenceFetched = true;
                    }


                    // escape the special chars to properly trigger the message
                    const escapedTriggerValue = String( parameters.value )
                        .replace( /[|\\{}()[\]^$+*?.]/g, '\\$&' )
                        .replace( /-/g, '\\x2d' );

                    const clientId = client.user?.id;
                    const botMention = message.mentions.users.some( ( user: any ) => user.id === clientId );

                    let regStr = `^${ escapedTriggerValue }$`;

                    // return if we expect a bot mention, but bot is not mentioned
                    if ( pattern === "botMention" && !botMention )
                        continue;

                    else if ( pattern === "start" && message.content )
                        regStr = `^${ escapedTriggerValue }`;
                    else if ( pattern === 'end' )
                        regStr = `${ escapedTriggerValue }$`;
                    else if ( pattern === 'contain' )
                        regStr = `${ escapedTriggerValue }`;
                    else if ( pattern === 'regex' )
                        regStr = `${ parameters.value }`;
                    else if ( pattern === 'every' )
                        regStr = `(.*)`;

                    const reg = new RegExp( regStr, parameters.caseSensitive ? '' : 'i' );

                    if ( ( pattern === "botMention" && botMention ) || reg.test( message.content ) ) {
                        // message create Options
                        const messageCreateOptions: any = {
                            message,
                            messageReference,
                            guild: message?.guild,
                            referenceAuthor: messageReference?.author,
                            author: message.author,
                            nodeId: nodeId,
                            memberRoles: message.member ? Array.from( message.member.roles.cache.values() ).map( ( r: any ) => ( {
                                id: r.id,
                                name: r.name,
                            } ) ) : [],
                        }

                        // check attachments
                        if ( onlyWithAttachments && !message.attachments ) continue;
                        messageCreateOptions.attachments = message.attachments;

                        // Get debounce and cooldown settings from additionalFields
                        const debounceSeconds = parameters.additionalFields?.debounceSeconds || 0;
                        const cooldownSeconds = parameters.additionalFields?.cooldownSeconds || 0;
                        const debounceKey = `${message.channel.id}:${message.author.id}:${nodeId}`;

                        // Helper: Check if cooldown allows emission
                        const canEmit = ( key: string ): { canEmit: boolean; remainingSeconds: number } => {
                            if ( cooldownSeconds === 0 ) return { canEmit: true, remainingSeconds: 0 };

                            const lastEmit = settings.lastEmitTime.get( key );
                            if ( !lastEmit ) return { canEmit: true, remainingSeconds: 0 };

                            const elapsedSeconds = ( Date.now() - lastEmit ) / 1000;
                            const remainingSeconds = Math.max( 0, cooldownSeconds - elapsedSeconds );

                            return {
                                canEmit: remainingSeconds === 0,
                                remainingSeconds: Math.ceil( remainingSeconds ),
                            };
                        };

                        // Helper: Emit with cooldown tracking
                        const emitMessage = ( socket: any, data: any ) => {
                            console.log( `Emitting message from ${message.author.username}` );
                            ipc.server.emit( socket, 'messageCreate', data );
                            settings.lastEmitTime.set( debounceKey, Date.now() );
                        };

                        // Helper: Setup timer with cooldown check
                        const setupTimer = ( delaySeconds: number ) => {
                            const timer = setTimeout( () => {
                                const data = settings.userLastMessages.get( debounceKey );
                                if ( data ) {
                                    const cooldownCheck = canEmit( debounceKey );

                                    if ( cooldownCheck.canEmit ) {
                                        // Cooldown passed, emit message
                                        emitMessage( data.socket, data.messageCreateOptions );

                                        // Cleanup
                                        settings.userMessageTimers.delete( debounceKey );
                                        settings.userLastMessages.delete( debounceKey );
                                    } else {
                                        // Still in cooldown, retry after remaining time
                                        console.log( `Cooldown active for ${message.author.username}, retrying in ${cooldownCheck.remainingSeconds}s` );
                                        setupTimer( cooldownCheck.remainingSeconds );
                                    }
                                }
                            }, delaySeconds * 1000 );

                            settings.userMessageTimers.set( debounceKey, timer );
                        };

                        if ( debounceSeconds > 0 ) {
                            // Debounce enabled: wait X seconds after last message before emitting
                            // Clear existing timer if user sends another message
                            if ( settings.userMessageTimers.has( debounceKey ) ) {
                                clearTimeout( settings.userMessageTimers.get( debounceKey ) );
                                console.log( `Debounce: Clearing previous timer for ${message.author.username}` );
                            }

                            // Store the latest message data
                            settings.userLastMessages.set( debounceKey, {
                                messageCreateOptions,
                                socket: parameters.socket,
                            } );

                            // Set new timer (will check cooldown when it expires)
                            setupTimer( debounceSeconds );
                        } else {
                            // No debounce: check cooldown and emit immediately
                            const cooldownCheck = canEmit( debounceKey );

                            if ( cooldownCheck.canEmit ) {
                                // Cooldown passed or disabled, emit immediately
                                console.log( "about to emit messageCreate", message.id );
                                emitMessage( parameters.socket, messageCreateOptions );
                            } else {
                                // In cooldown, queue message with timer
                                console.log( `Cooldown active for ${message.author.username}, queuing message for ${cooldownCheck.remainingSeconds}s` );

                                // Clear existing timer if any
                                if ( settings.userMessageTimers.has( debounceKey ) ) {
                                    clearTimeout( settings.userMessageTimers.get( debounceKey ) );
                                }

                                // Store message and setup timer
                                settings.userLastMessages.set( debounceKey, {
                                    messageCreateOptions,
                                    socket: parameters.socket,
                                } );

                                setupTimer( cooldownCheck.remainingSeconds );
                            }
                        }
                    }

                } catch ( e ) {
                    console.log( e );
                }
            }
        };

        // Voice state update handler
        const voiceStateUpdateHandler = async ( oldState: VoiceState, newState: VoiceState ) => {
            try {
                // Check if voiceTriggerNodes exists and has entries
                if (!settings.voiceTriggerNodes || Object.keys(settings.voiceTriggerNodes).length === 0) {
                    return;
                }

                // Check for voice trigger nodes
                for ( const [ nodeId, parameters ] of Object.entries( settings.voiceTriggerNodes ) as [ string, any ] ) {
                    // Skip if parameters is undefined or null
                    if (!parameters) {
                        console.warn(`Voice trigger node ${nodeId} has no parameters`);
                        continue;
                    }
                    // Check if this is the correct guild
                    if ( parameters.guildIds && parameters.guildIds.length && !parameters.guildIds.includes( newState.guild.id ) )
                        continue;

                    // Check if this is the correct voice channel
                    if ( parameters.voiceChannelIds && parameters.voiceChannelIds.length ) {
                        const channelId = newState.channelId || oldState.channelId;
                        if ( !channelId || !parameters.voiceChannelIds.includes( channelId ) )
                            continue;
                    }

                    // Filter bots if needed
                    if ( parameters.userFilters?.ignoreBots && newState.member?.user.bot )
                        continue;

                    // Check specific user IDs if configured
                    if ( parameters.userFilters?.userIds ) {
                        const userIds = parameters.userFilters.userIds.split( ',' ).map( ( id: string ) => id.trim() );
                        if ( userIds.length && !userIds.includes( newState.member?.user.id ) )
                            continue;
                    }

                    // Check roles if configured
                    if ( parameters.userFilters?.roleIds && parameters.userFilters.roleIds.length ) {
                        const memberRoles = newState.member?.roles.cache.map( ( role: any ) => role.id );
                        const hasRole = parameters.userFilters.roleIds.some( ( role: any ) => memberRoles?.includes( role ) );
                        if ( !hasRole )
                            continue;
                    }

                    const voiceMode = parameters.voiceMode || 'voice-recording';

                    // Handle different voice modes
                    if ( voiceMode === 'voice-state' ) {
                        // Send voice state update event
                        if ( parameters.socket ) {
                            ipc.server.emit( parameters.socket, 'voiceStateUpdate', {
                                oldState: {
                                    channelId: oldState.channelId,
                                    selfMute: oldState.selfMute,
                                    selfDeaf: oldState.selfDeaf,
                                    serverMute: oldState.serverMute,
                                    serverDeaf: oldState.serverDeaf,
                                    streaming: oldState.streaming,
                                    selfVideo: oldState.selfVideo,
                                },
                                newState: {
                                    channelId: newState.channelId,
                                    selfMute: newState.selfMute,
                                    selfDeaf: newState.selfDeaf,
                                    serverMute: newState.serverMute,
                                    serverDeaf: newState.serverDeaf,
                                    streaming: newState.streaming,
                                    selfVideo: newState.selfVideo,
                                    channel: newState.channel ? {
                                        id: newState.channel.id,
                                        name: newState.channel.name,
                                    } : null,
                                },
                                member: {
                                    id: newState.member?.id,
                                    user: {
                                        id: newState.member?.user.id,
                                        username: newState.member?.user.username,
                                        discriminator: newState.member?.user.discriminator,
                                    }
                                },
                                guild: {
                                    id: newState.guild.id,
                                    name: newState.guild.name,
                                },
                                nodeId: nodeId
                            } );
                        }
                    } else if ( voiceMode === 'voice-recording' && newState.channelId && !oldState.channelId ) {
                        // User joined a voice channel - start recording if configured
                        console.log(`User ${newState.member?.user.username} joined voice channel ${newState.channel?.name}`);
                        const autoJoin = parameters.additionalOptions?.autoJoin !== false;
                        console.log(`Auto-join is ${autoJoin ? 'enabled' : 'disabled'}`);
                        if ( autoJoin && newState.channel ) {
                            console.log(`Attempting to join voice channel and start recording...`);
                            await handleVoiceRecording( newState, nodeId, parameters );
                        } else if (!autoJoin) {
                            console.log(`Auto-join disabled, not joining voice channel`);
                        } else if (!newState.channel) {
                            console.log(`No voice channel found in newState`);
                        }
                    } else if ( voiceMode === 'voice-activity' ) {
                        // Handle voice activity detection
                        // This will be implemented with speaking events
                    }
                }
            } catch ( e ) {
                console.error( 'Error in voiceStateUpdate:', e );
            }
        };

        // Function to handle voice recording
        async function handleVoiceRecording( voiceState: VoiceState, nodeId: string, parameters: any ) {
            try {
                const channel = voiceState.channel as VoiceChannel;
                if ( !channel ) {
                    console.error('No voice channel found in voice state');
                    return;
                }

                console.log(`handleVoiceRecording: Channel ${channel.name} (${channel.id}), Guild ${channel.guild.name} (${channel.guild.id})`);

                const connectionKey = `${ voiceState.guild.id }:${ channel.id }`;

                // Check if already connected
                let connection = settings.voiceConnections.get( connectionKey );

                if ( !connection ) {
                    console.log(`Creating new voice connection for ${connectionKey}`);
                    // Join the voice channel
                    connection = joinVoiceChannel( {
                        channelId: channel.id,
                        guildId: channel.guild.id,
                        adapterCreator: channel.guild.voiceAdapterCreator as any,
                    } );

                    settings.voiceConnections.set( connectionKey, connection );
                    console.log(`Voice connection created and stored`);

                    // Handle connection state
                    connection.on( VoiceConnectionStatus.Ready, () => {
                        console.log( `Connected to voice channel: ${ channel.name }` );

                        // Start recording
                        const receiver = connection.receiver;
                        const audioFormat = parameters.recordingOptions?.audioFormat || 'ogg';
                        const maxDuration = ( parameters.recordingOptions?.maxDuration || 60 ) * 1000;
                        const silenceTimeout = ( parameters.recordingOptions?.silenceTimeout || 2 ) * 1000;

                        // Listen for speaking events
                        receiver.speaking.on( 'start', ( userId: string ) => {
                            const member = channel.guild.members.cache.get( userId );
                            if ( !member ) return;

                            console.log( `${ member.user.username } started speaking` );

                            // Create audio stream for user
                            const audioStream = receiver.subscribe( userId, {
                                end: {
                                    behavior: EndBehaviorType.AfterSilence,
                                    duration: silenceTimeout,
                                },
                            } );

                            const recordingKey = `${ userId }:${ channel.id }`;
                            const chunks: Buffer[] = [];
                            let recordingStartTime = Date.now();

                            audioStream.on( 'data', ( chunk: Buffer ) => {
                                // Check max duration
                                if ( Date.now() - recordingStartTime < maxDuration ) {
                                    chunks.push( chunk );
                                }
                            } );

                            audioStream.on( 'end', async () => {
                                console.log( `${ member.user.username } stopped speaking` );

                                // Combine chunks
                                const buffer = Buffer.concat( chunks );
                                const duration = ( Date.now() - recordingStartTime ) / 1000;

                                // Check minimum speaking duration
                                const minDuration = ( parameters.recordingOptions?.minSpeakingDuration || 100 ) / 1000;
                                if ( duration < minDuration ) return;

                                // Process recording
                                const recordingData = {
                                    buffer: buffer,
                                    duration: duration,
                                    format: audioFormat,
                                };

                                // Save to file if configured
                                if ( parameters.additionalOptions?.saveToFile ) {
                                    const filePath = parameters.additionalOptions.filePath || './recordings';
                                    const fileName = `${ userId }_${ Date.now() }.${ audioFormat }`;
                                    const fullPath = path.join( filePath, fileName );

                                    // Ensure directory exists
                                    if ( !fs.existsSync( filePath ) ) {
                                        fs.mkdirSync( filePath, { recursive: true } );
                                    }

                                    fs.writeFileSync( fullPath, buffer );
                                    ( recordingData as any ).filePath = fullPath;
                                }

                                // Handle transcription if enabled
                                let transcription = null;
                                if ( parameters.transcription?.enabled ) {
                                    // Transcription would be handled here
                                    // This would integrate with external services
                                    console.log( 'Transcription requested but not implemented yet' );
                                }

                                // Emit recording event
                                if ( parameters.socket ) {
                                    ipc.server.emit( parameters.socket, 'voiceRecording', {
                                        recording: recordingData,
                                        user: {
                                            id: member.user.id,
                                            username: member.user.username,
                                            discriminator: member.user.discriminator,
                                        },
                                        channel: {
                                            id: channel.id,
                                            name: channel.name,
                                        },
                                        guild: {
                                            id: channel.guild.id,
                                            name: channel.guild.name,
                                        },
                                        nodeId: nodeId,
                                        transcription: transcription,
                                    } );
                                }

                                // Clear recording data
                                settings.voiceRecordings.delete( recordingKey );
                            } );

                            // Store recording info
                            settings.voiceRecordings.set( recordingKey, {
                                stream: audioStream,
                                startTime: recordingStartTime,
                                userId: userId,
                            } );
                        } );
                    } );

                    connection.on( VoiceConnectionStatus.Signalling, () => {
                        console.log( `Voice connection signalling for channel: ${ channel.name }` );
                    } );

                    connection.on( VoiceConnectionStatus.Connecting, () => {
                        console.log( `Voice connection connecting to channel: ${ channel.name }` );
                    } );

                    connection.on( VoiceConnectionStatus.Disconnected, async () => {
                        console.log( `Disconnected from voice channel: ${ channel.name }` );
                        settings.voiceConnections.delete( connectionKey );
                    } );

                    connection.on( VoiceConnectionStatus.Destroyed, () => {
                        console.log( `Voice connection destroyed for channel: ${ channel.name }` );
                        settings.voiceConnections.delete( connectionKey );
                    } );

                    connection.on( 'error', ( error: Error ) => {
                        console.error( 'Voice connection error:', error );
                        console.error( 'Error stack:', error.stack );
                        if ( parameters.socket ) {
                            ipc.server.emit( parameters.socket, 'voiceError', {
                                error: { message: error.message },
                                nodeId: nodeId,
                            } );
                        }
                    } );
                }

                // Handle auto-leave
                if ( parameters.additionalOptions?.autoLeave !== false ) {
                    // Check if channel is empty
                    setTimeout( () => {
                        const members = channel.members.filter( m => !m.user.bot );
                        if ( members.size === 0 && connection ) {
                            connection.destroy();
                            settings.voiceConnections.delete( connectionKey );
                            console.log( `Left empty voice channel: ${ channel.name }` );
                        }
                    }, 5000 );
                }

            } catch ( e ) {
                console.error( 'Error handling voice recording:', e );
                if ( parameters.socket ) {
                    ipc.server.emit( parameters.socket, 'voiceError', {
                        error: { message: ( e as Error ).message },
                        nodeId: nodeId,
                    } );
                }
            }
        }

        client.once( 'ready', () => {
            const botSingleton = BotSingleton.getInstance();

            // Check if we already have event listeners to prevent duplicates
            const messageListenerKey = `${token}-messageCreate`;
            if (!botSingleton.hasEventListener(messageListenerKey, onMessageCreate)) {
                client.on( 'messageCreate', onMessageCreate );
                botSingleton.addEventListener(messageListenerKey, onMessageCreate);
                console.log(`Added messageCreate listener for token ${token.substring(0, 10)}...`);
            } else {
                console.log(`MessageCreate listener already exists for token ${token.substring(0, 10)}...`);
            }

            // Add voice state update listener
            const voiceListenerKey = `${token}-voiceStateUpdate`;
            if (!botSingleton.hasEventListener(voiceListenerKey, voiceStateUpdateHandler)) {
                client.on( 'voiceStateUpdate', voiceStateUpdateHandler );
                botSingleton.addEventListener(voiceListenerKey, voiceStateUpdateHandler);
                console.log(`Added voiceStateUpdate listener for token ${token.substring(0, 10)}...`);
            } else {
                console.log(`VoiceStateUpdate listener already exists for token ${token.substring(0, 10)}...`);
            }

            if ( client.user ) {
                console.log( `Discord bot (${ client.user.id }) is ready and listening for messages and voice` );
                // Store client in singleton
                botSingleton.setClient(token, client);
            }
        } );

        client.login( token ).catch( console.error );

        return client;
    }

    // nodes are executed in a child process, the Discord bot is executed in the main process
    // so it's not stopped when a node execution end
    // we use ipc to communicate between the node execution process and the bot
    // ipc is serving in the main process & childs connect to it using the ipc client
    ipc.serve( function () {
        console.log( `ipc bot server started` );

        ipc.server.on( 'triggerNodeRegistered', ( data: any, socket: any ) => {
            // set the specific node parameters for a later iteration when we get messages
            if ( !settings.triggerNodes[ data.token ] ) settings.triggerNodes[ data.token ] = {};
            settings.triggerNodes[ data.token ][ data.nodeId ] = {
                ...data.parameters, // deconscruct and add socket for later
                socket: socket,
            };
        } );

        ipc.server.on( 'triggerNodeRemoved', ( data: { nodeId: string }, socket: any ) => {
            // remove the specific node parameters because the node was removed
            console.log( `Removing trigger node: ${ data.nodeId }` );
            for ( const token in settings.triggerNodes ) {
                delete settings.triggerNodes[ token ][ data.nodeId ];
            }
        } );

        // Voice trigger node registration
        ipc.server.on( 'voiceTriggerNodeRegistered', ( data: any, socket: any ) => {
            console.log( `Voice trigger node registered: ${ data.nodeId }` );
            settings.voiceTriggerNodes[ data.nodeId ] = {
                ...data.parameters,
                socket: socket,
                token: data.token,
            };
        } );

        ipc.server.on( 'voiceTriggerNodeRemoved', ( data: { nodeId: string }, socket: any ) => {
            console.log( `Removing voice trigger node: ${ data.nodeId }` );
            delete settings.voiceTriggerNodes[ data.nodeId ];

            // Clean up any active voice connections for this node
            for ( const [ key, connection ] of settings.voiceConnections.entries() ) {
                // Destroy connection if no other nodes are using it
                let connectionInUse = false;
                for ( const nodeParams of Object.values( settings.voiceTriggerNodes ) ) {
                    if ( ( nodeParams as any ).voiceChannelIds?.some( ( id: string ) => key.includes( id ) ) ) {
                        connectionInUse = true;
                        break;
                    }
                }
                if ( !connectionInUse ) {
                    ( connection as any ).destroy();
                    settings.voiceConnections.delete( key );
                }
            }
        } );


        ipc.server.on( 'list:roles', ( data: { guildIds: string[], token: string }, socket: any ) => {
            try {
                const client = settings.clientMap[ data.token ];
                if ( !client || !settings.readyClients[ data.token ] ) return;

                const guilds = client.guilds.cache.filter( guild => data.guildIds.includes( `${ guild.id }` ) );
                const rolesList = [] as { name: string; value: string }[];

                for ( const guild of guilds.values() ) {
                    const roles = guild.roles.cache ?? ( [] );
                    for ( const role of roles.values() ) {
                        rolesList.push( {
                            name: role.name,
                            value: role.id,
                        } )
                    }
                }

                ipc.server.emit( socket, 'list:roles', rolesList );
            } catch ( e ) {
                console.log( `${ e }` );
            }
        } );



        ipc.server.on( 'list:guilds', ( data: { token: string }, socket: any ) => {
            try {
                const client = settings.clientMap[ data.token ];
                if ( !client || !settings.readyClients[ data.token ] ) return;

                const guilds = client.guilds.cache ?? ( [] as any );
                const guildsList = guilds.map( ( guild: Guild ) => {
                    return {
                        name: guild.name,
                        value: guild.id,
                    };
                } );

                ipc.server.emit( socket, 'list:guilds', guildsList );
            } catch ( e ) {
                console.log( `${ e }` );
            }
        } );



        ipc.server.on( 'list:channels', ( data: { guildIds: string[], token: string }, socket: any ) => {
            try {
                const client = settings.clientMap[ data.token ];
                if ( !client || !settings.readyClients[ data.token ] ) return;

                const guilds = client.guilds.cache.filter( guild => data.guildIds.includes( `${ guild.id }` ) );
                const channelsList = [] as { name: string; value: string }[];

                for ( const guild of guilds.values() ) {
                    const channels = guild.channels.cache.filter( ( channel: any ) => channel.type === ChannelType.GuildText ) ?? ( [] as any ) as any;
                    for ( const channel of channels.values() ) {
                        channelsList.push( {
                            name: channel.name,
                            value: channel.id,
                        } )
                    }
                }

                console.log( channelsList );

                ipc.server.emit( socket, 'list:channels', channelsList );
            } catch ( e ) {
                console.log( `${ e }` );
            }
        } );

        ipc.server.on( 'list:categories', ( data: { guildIds: string[], token: string }, socket: any ) => {
            try {
                const client = settings.clientMap[ data.token ];
                if ( !client || !settings.readyClients[ data.token ] ) return;

                const guilds = client.guilds.cache.filter( guild => data.guildIds.includes( `${ guild.id }` ) );
                const categoriesList = [] as { name: string; value: string }[];

                for ( const guild of guilds.values() ) {
                    const categories = guild.channels.cache.filter( ( channel: any ) => channel.type === ChannelType.GuildCategory ) ?? ( [] as any ) as any;
                    for ( const category of categories.values() ) {
                        categoriesList.push( {
                            name: category.name,
                            value: category.id,
                        } )
                    }
                }

                ipc.server.emit( socket, 'list:categories', categoriesList );
            } catch ( e ) {
                console.log( `${ e }` );
            }
        } );

        // List voice channels handler
        ipc.server.on( 'list:voiceChannels', ( data: { guildIds: string[], token: string }, socket: any ) => {
            try {
                const client = settings.clientMap[ data.token ];
                if ( !client || !settings.readyClients[ data.token ] ) return;

                const guilds = client.guilds.cache.filter( guild => data.guildIds.includes( `${ guild.id }` ) );
                const voiceChannelsList = [] as { name: string; value: string }[];

                for ( const guild of guilds.values() ) {
                    const voiceChannels = guild.channels.cache.filter( ( channel: any ) => channel.type === ChannelType.GuildVoice || channel.type === ChannelType.GuildStageVoice );
                    for ( const channel of voiceChannels.values() ) {
                        voiceChannelsList.push( {
                            name: `${guild.name} - ${channel.name}`,
                            value: channel.id,
                        } );
                    }
                }

                ipc.server.emit( socket, 'list:voiceChannels', voiceChannelsList );
            } catch ( e ) {
                console.log( `${ e }` );
            }
        } );


        ipc.server.on( 'credentials', ( data: ICredentials, socket: any ) => {
            const { token, clientId } = data;

            if ( !token || !clientId ) {
                ipc.server.emit( socket, 'credentials', 'missing' );
                return;
            }

            if ( settings.readyClients[ token ] ) {
                ipc.server.emit( socket, 'credentials', 'already' );
                return;
            }

            if ( settings.loginQueue[ token ] ) {
                ipc.server.emit( socket, 'credentials', 'login' );
                return;
            }

            // Cleanup existing client if any (prevents duplicate listeners on restart)
            if ( settings.clientMap[ token ] ) {
                console.log( `Destroying old client for token before creating new one` );
                try {
                    // Remove all event listeners before destroying
                    settings.clientMap[ token ].removeAllListeners();
                    settings.clientMap[ token ].destroy();
                } catch ( e ) {
                    console.error( `Error destroying old client:`, e );
                }
                delete settings.clientMap[ token ];
                delete settings.readyClients[ token ];
                delete settings.triggerNodes[ token ];
                settings.loginQueue[ token ] = false;
            }

            settings.loginQueue[ token ] = true;
            try {
                const client = spawnClient( token, clientId );
                settings.clientMap[ token ] = client;
                settings.triggerNodes[ token ] = {};
                settings.credentials[ token ] = { token, clientId };

                client.once( 'ready', () => {
                    settings.readyClients[ token ] = true;
                    settings.loginQueue[ token ] = false;

                    // Optional: set REST token if needed
                    client.rest.setToken( token );

                    console.log( `Logged in as ${ client.user?.tag } (${ clientId })` );
                    ipc.server.emit( socket, 'credentials', 'ready' );
                } );

                client.on( 'error', ( err ) => {
                    console.error( `Client error for ${ token }`, err );
                    settings.loginQueue[ token ] = false;
                    ipc.server.emit( socket, 'credentials', 'error' );
                } );

            } catch ( err ) {
                settings.loginQueue[ token ] = false;
                console.error( `Failed to login client for ${ token }`, err );
                ipc.server.emit( socket, 'credentials', 'error' );
            }
        } );

        ipc.server.on( 'send:message', async ( data: { token: string, nodeParameters: IDiscordInteractionMessageParameters }, socket: any ) => {
            try {

                console.log( `send message for ${ data.token }` );

                const client = settings.clientMap[ data.token ];

                const nodeParameters = data.nodeParameters;
                if ( !client || !settings.readyClients[ data.token ] ) return;
                console.log( "client ready", client.user?.tag );


                // fetch channel
                const channel = <TextChannel> client.channels.cache.get( nodeParameters.channelId );
                if ( !channel || !channel.isTextBased() ) return;

                const preparedMessage = prepareMessage( nodeParameters );

                // finally send the message and report back to the listener
                const message = await channel.send( preparedMessage );
                ipc.server.emit( socket, 'callback:send:message', {
                    channelId: channel.id,
                    messageId: message.id
                } );
            } catch ( e ) {
                console.log( `${ e }` );
                ipc.server.emit( socket, 'callback:send:message', false );
            }
        } );


        ipc.server.on( 'send:action', async ( data: { token: string, nodeParameters: IDiscordNodeActionParameters }, socket: any ) => {
            try {
                console.log( 'Received send:action:', data.nodeParameters.actionType );
                const client = settings.clientMap[ data.token ];
                const nodeParameters = data.nodeParameters;
                if ( !client || !settings.readyClients[ data.token ] ) {
                    console.log( 'Client not ready or not found' );
                    return;
                }

                const performAction = async (): Promise<string | void> => {
                    // get messages from channel
                    if ( nodeParameters.actionType === 'getMessages' ) {
                        console.log( 'Processing getMessages action' );
                        const channel = <TextChannel> client.channels.cache.get( nodeParameters.channelId );
                        if ( !channel || !channel.isTextBased() ) {
                            console.log( 'Channel not found or not text-based' );
                            ipc.server.emit( socket, `callback:send:action`, false );
                            return 'handled';
                        }

                        const limit = ( nodeParameters as any ).getMessagesLimit || 10;
                        console.log( `Fetching ${limit} messages from channel ${nodeParameters.channelId}` );
                        const messages = await channel.messages.fetch( { limit } );

                        const messagesArray = Array.from( messages.values() ).map( ( msg: Message ) => ( {
                            id: msg.id,
                            content: msg.content,
                            author: {
                                id: msg.author.id,
                                username: msg.author.username,
                                bot: msg.author.bot,
                                discriminator: msg.author.discriminator,
                            },
                            channelId: msg.channelId,
                            guildId: msg.guildId,
                            createdTimestamp: msg.createdTimestamp,
                            editedTimestamp: msg.editedTimestamp,
                            attachments: Array.from( msg.attachments.values() ).map( att => ( {
                                id: att.id,
                                url: att.url,
                                name: att.name,
                                size: att.size,
                            } ) ),
                            embeds: msg.embeds.map( embed => ( {
                                title: embed.title,
                                description: embed.description,
                                url: embed.url,
                                color: embed.color,
                            } ) ),
                            mentions: {
                                users: Array.from( msg.mentions.users.values() ).map( u => ( {
                                    id: u.id,
                                    username: u.username,
                                } ) ),
                                roles: Array.from( msg.mentions.roles.values() ).map( r => ( {
                                    id: r.id,
                                    name: r.name,
                                } ) ),
                            },
                            memberRoles: msg.member ? Array.from( msg.member.roles.cache.values() ).map( r => ( {
                                id: r.id,
                                name: r.name,
                            } ) ) : [],
                        } ) );

                        console.log( `Emitting callback with ${messagesArray.length} messages` );
                        ipc.server.emit( socket, `callback:send:action`, {
                            action: 'getMessages',
                            messages: messagesArray,
                        } );
                        console.log( 'Callback emitted successfully' );
                        return 'handled';
                    }

                    // remove messages
                    else if ( nodeParameters.actionType === 'removeMessages' ) {
                        const channel = <TextChannel> client.channels.cache.get( nodeParameters.channelId );
                        if ( !channel || !channel.isTextBased() ) {
                            ipc.server.emit( socket, `callback:send:action`, false );;
                            return;
                        }

                        await channel.bulkDelete( nodeParameters.removeMessagesNumber ).catch( ( e: any ) => console.log( `${ e }`, client ) );
                    }

                    // add or remove roles
                    else if ( [ 'addRole', 'removeRole' ].includes( nodeParameters.actionType ) ) {
                        const guild = await client.guilds.cache.get( nodeParameters.guildId );
                        if ( !guild ) {
                            ipc.server.emit( socket, `callback:send:action`, false );
                            return;
                        }

                        const user = await client.users.fetch( nodeParameters.userId as string );
                        const guildMember = await guild.members.fetch( user );
                        const roles = guildMember.roles;

                        // Split the roles that are set in the parameters into individual ones or initialize as empty if no roles are set.
                        const roleUpdateIds = ( typeof nodeParameters.roleUpdateIds === 'string' ? nodeParameters.roleUpdateIds.split( ',' ) : nodeParameters.roleUpdateIds ) ?? [];
                        for ( const roleId of roleUpdateIds ) {
                            if ( !roles.cache.has( roleId ) && nodeParameters.actionType === 'addRole' )
                                roles.add( roleId );
                            else if ( roles.cache.has( roleId ) && nodeParameters.actionType === 'removeRole' )
                                roles.remove( roleId );
                        }
                    }
                };

                const actionResult = await performAction();

                // If action already sent response (like getMessages), don't send again
                if (actionResult === 'handled') {
                    return;
                }

                console.log( "action done" );

                ipc.server.emit( socket, `callback:send:action`, {
                    action: nodeParameters.actionType,
                } );

            } catch ( e ) {
                console.log( `${ e }` );
                ipc.server.emit( socket, `callback:send:action`, false );
            }
        } );


        ipc.server.on( 'send:confirmation', async ( data: { token: string, nodeParameters: any }, socket: any ) => {
            try {
                console.log( `send confirmation for ${ data.token }`, data.nodeParameters );

                const client = settings.clientMap[ data.token ];
                const nodeParameters = data.nodeParameters;
                if ( !client || !settings.readyClients[ data.token ] ) return;

                // fetch channel
                const channel = <TextChannel> client.channels.cache.get( nodeParameters.channelId );
                if ( !channel || !channel.isTextBased() ) return;

                let confirmationMessage: Message | null = null;

                let collectorTimeout = 60 * 1000; // 1 minute
                if ( nodeParameters.additionalConfirmationFields.timeout > 0 ) {
                    collectorTimeout = parseInt( nodeParameters.additionalConfirmationFields.timeout ) * 1000;
                }

                // prepare embed messages, if they are set by the client
                const confirmed = await new Promise<Boolean | null>( async resolve => {
                    const preparedMessage = prepareMessage( nodeParameters );
                    // @ts-ignore
                    prepareMessage.ephemeral = true;

                    const collector = channel.createMessageComponentCollector( {
                        max: 1, // The number of times a user can click on the button
                        time: collectorTimeout, // The amount of time the collector is valid for in milliseconds,
                    } );
                    let isResolved = false;
                    collector.on( "collect", ( interaction: MessageComponentInteraction ) => {

                        if ( interaction.customId === "yes" ) {
                            interaction.message.delete();
                            isResolved = true;
                            return resolve( true );
                        } else if ( interaction.customId === "no" ) {
                            interaction.message.delete();
                            isResolved = true;
                            return resolve( false );
                        }

                        interaction.message.delete();
                        isResolved = true;
                        resolve( null );
                    } );

                    collector.on( "end", ( collected ) => {
                        if ( !isResolved )
                            resolve( null );
                        confirmationMessage?.delete();
                        throw Error( "Confirmed message could not be resolved" );
                    } );

                    const yesLabel = nodeParameters.additionalConfirmationFields.yesLabel || 'Yes';
                    const noLabel = nodeParameters.additionalConfirmationFields.noLabel || 'No';
                    preparedMessage.components = [ new ActionRowBuilder().addComponents( [
                        new ButtonBuilder()
                            .setCustomId( `yes` )
                            .setLabel( yesLabel )
                            .setStyle( ButtonStyle.Success ),
                        new ButtonBuilder()
                            .setCustomId( 'no' )
                            .setLabel( noLabel )
                            .setStyle( ButtonStyle.Danger ),
                    ] ) ];

                    confirmationMessage = await channel.send( preparedMessage );
                } );

                console.log( "sending callback to node ", confirmed );
                ipc.server.emit( socket, 'callback:send:confirmation', { confirmed: confirmed, success: true } );
            } catch ( e ) {
                console.log( `${ e }` );
                ipc.server.emit( socket, 'callback:send:confirmation', { confirmed: null, success: true } );
            }
        } );

        // Support command: Enable/Disable channel for triggers
        ipc.server.on( 'support:toggle-channel', ( data: { channelId: string, action: 'close' | 'open' }, socket: any ) => {
            try {
                const { channelId, action } = data;

                if ( action === 'close' ) {
                    settings.disabledChannels.add( channelId );
                    saveDisabledChannels( settings.disabledChannels );
                    ipc.server.emit( socket, 'callback:support:toggle-channel', {
                        success: true,
                        action: 'close',
                        channelId: channelId
                    } );
                } else if ( action === 'open' ) {
                    settings.disabledChannels.delete( channelId );
                    saveDisabledChannels( settings.disabledChannels );
                    ipc.server.emit( socket, 'callback:support:toggle-channel', {
                        success: true,
                        action: 'open',
                        channelId: channelId
                    } );
                }
            } catch ( e ) {
                console.log( `${ e }` );
                ipc.server.emit( socket, 'callback:support:toggle-channel', { success: false } );
            }
        } );

        // Support command: Check if channel is disabled
        ipc.server.on( 'support:check-channel-status', ( data: { channelId: string }, socket: any ) => {
            try {
                const { channelId } = data;
                const isDisabled = settings.disabledChannels.has( channelId );

                ipc.server.emit( socket, 'callback:support:check-channel-status', {
                    channelId: channelId,
                    isDisabled: isDisabled,
                    isEnabled: !isDisabled
                } );
            } catch ( e ) {
                console.log( `${ e }` );
                ipc.server.emit( socket, 'callback:support:check-channel-status', { error: true } );
            }
        } );
    } );

    ipc.server.start();

    // Cleanup function to destroy all clients and timers
    const cleanup = () => {
        console.log( 'Cleaning up Discord clients and timers...' );
        const botSingleton = BotSingleton.getInstance();

        // Clear all debounce/cooldown timers
        for ( const timer of settings.userMessageTimers.values() ) {
            clearTimeout( timer );
        }
        settings.userMessageTimers.clear();
        settings.userLastMessages.clear();
        settings.lastEmitTime.clear();

        // Clear voice connections
        for ( const connection of settings.voiceConnections.values() ) {
            try {
                if ( connection && connection.destroy ) {
                    connection.destroy();
                }
            } catch ( e ) {
                console.error( 'Error destroying voice connection:', e );
            }
        }
        settings.voiceConnections.clear();
        settings.voiceRecordings.clear();

        // Destroy all Discord clients
        for ( const token in settings.clientMap ) {
            try {
                console.log( `Destroying client for token ${token}` );
                settings.clientMap[ token ].removeAllListeners();
                settings.clientMap[ token ].destroy();
            } catch ( e ) {
                console.error( `Error destroying client:`, e );
            }
        }
        settings.clientMap = {};
        settings.readyClients = {};
        settings.triggerNodes = {};
        settings.voiceTriggerNodes = {};

        // Clear singleton event listeners and release lock
        botSingleton.clearAllEventListeners();
        botSingleton.release();
        console.log( 'Bot singleton lock released and cleaned up' );
    };

    // Register cleanup handlers for process termination
    process.on( 'exit', cleanup );
    process.on( 'SIGINT', () => {
        cleanup();
        process.exit( 0 );
    } );
    process.on( 'SIGTERM', () => {
        cleanup();
        process.exit( 0 );
    } );
    process.on( 'uncaughtException', ( err ) => {
        console.error( 'Uncaught exception:', err );
        cleanup();
        process.exit( 1 );
    } );
}

function prepareMessage ( nodeParameters: any ): any {
    // prepare embed messages, if they are set by the client
    const embedFiles = [];
    let embed: EmbedBuilder | undefined;
    if ( nodeParameters.embed ) {
        embed = new EmbedBuilder();
        if ( nodeParameters.title ) embed.setTitle( nodeParameters.title );
        if ( nodeParameters.url ) embed.setURL( nodeParameters.url );
        if ( nodeParameters.description ) embed.setDescription( nodeParameters.description );
        if ( nodeParameters.color ) embed.setColor( nodeParameters.color as ColorResolvable );
        if ( nodeParameters.timestamp )
            embed.setTimestamp( Date.parse( nodeParameters.timestamp ) );
        if ( nodeParameters.footerText ) {
            let iconURL = nodeParameters.footerIconUrl;
            if ( iconURL && iconURL.match( /^data:/ ) ) {
                const buffer = Buffer.from( iconURL.split( ',' )[ 1 ], 'base64' );
                const reg = new RegExp( /data:image\/([a-z]+);base64/gi );
                let mime = reg.exec( nodeParameters.footerIconUrl ) ?? [];
                const file = new AttachmentBuilder( buffer, { name: `footer.${ mime[ 1 ] }` } );
                embedFiles.push( file );
                iconURL = `attachment://footer.${ mime[ 1 ] }`;
            }
            embed.setFooter( {
                text: nodeParameters.footerText,
                ...( iconURL ? { iconURL } : {} ),
            } );
        }
        if ( nodeParameters.imageUrl ) {
            if ( nodeParameters.imageUrl.match( /^data:/ ) ) {
                const buffer = Buffer.from( nodeParameters.imageUrl.split( ',' )[ 1 ], 'base64' );
                const reg = new RegExp( /data:image\/([a-z]+);base64/gi );
                let mime = reg.exec( nodeParameters.imageUrl ) ?? [];
                const file = new AttachmentBuilder( buffer, { name: `image.${ mime[ 1 ] }` } );
                embedFiles.push( file );
                embed.setImage( `attachment://image.${ mime[ 1 ] }` );
            } else embed.setImage( nodeParameters.imageUrl );
        }
        if ( nodeParameters.thumbnailUrl ) {
            if ( nodeParameters.thumbnailUrl.match( /^data:/ ) ) {
                const buffer = Buffer.from( nodeParameters.thumbnailUrl.split( ',' )[ 1 ], 'base64' );
                const reg = new RegExp( /data:image\/([a-z]+);base64/gi );
                let mime = reg.exec( nodeParameters.thumbnailUrl ) ?? [];
                const file = new AttachmentBuilder( buffer, { name: `thumbnail.${ mime[ 1 ] }` } );
                embedFiles.push( file );
                embed.setThumbnail( `attachment://thumbnail.${ mime[ 1 ] }` );
            } else embed.setThumbnail( nodeParameters.thumbnailUrl );
        }
        if ( nodeParameters.authorName ) {
            let iconURL = nodeParameters.authorIconUrl;
            if ( iconURL && iconURL.match( /^data:/ ) ) {
                const buffer = Buffer.from( iconURL.split( ',' )[ 1 ], 'base64' );
                const reg = new RegExp( /data:image\/([a-z]+);base64/gi );
                let mime = reg.exec( nodeParameters.authorIconUrl ) ?? [];
                const file = new AttachmentBuilder( buffer, { name: `author.${ mime[ 1 ] }` } );
                embedFiles.push( file );
                iconURL = `attachment://author.${ mime[ 1 ] }`;
            }
            embed.setAuthor( {
                name: nodeParameters.authorName,
                ...( iconURL ? { iconURL } : {} ),
                ...( nodeParameters.authorUrl ? { url: nodeParameters.authorUrl } : {} ),
            } );
        }
        if ( nodeParameters.fields?.field ) {
            nodeParameters.fields.field.forEach(
                ( field: { name?: string; value?: string; inline?: boolean } ) => {
                    if ( embed && field.name && field.value )
                        embed.addFields( {
                            name: field.name,
                            value: field.value,
                            inline: field.inline,
                        } );
                    else if ( embed ) embed.addFields( { name: '\u200B', value: '\u200B' } );
                },
            );
        }
    }

    // add all the mentions at the end of the message
    let mentions = '';
    nodeParameters.mentionRoles.forEach( ( role: string ) => {
        mentions += ` <@&${ role }>`;
    } );

    let content = '';
    if ( nodeParameters.content ) content += nodeParameters.content;
    if ( mentions ) content += mentions;

    // if there are files, add them aswell
    let files: any[] = [];
    if ( nodeParameters.files?.file ) {
        files = nodeParameters.files?.file.map( ( file: { url: string } ) => {
            if ( file.url.match( /^data:/ ) ) {
                return Buffer.from( file.url.split( ',' )[ 1 ], 'base64' );
            }
            return file.url;
        } );
    }
    if ( embedFiles.length ) files = files.concat( embedFiles );

    // prepare the message object how discord likes it
    const sendObject = {
        content: content ?? '',
        ...( embed ? { embeds: [ embed ] } : {} ),
        ...( files.length ? { files } : {} ),
    };

    return sendObject;
}
