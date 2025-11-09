import {
    type INodeType,
    type INodeTypeDescription,
    type ITriggerFunctions,
    type ITriggerResponse,
    type INodePropertyOptions,
    NodeOperationError,
} from 'n8n-workflow';
import { options } from './DiscordTrigger.node.options';
import bot from '../bot';
import ipc from 'node-ipc';
import {
    connection,
    ICredentials,
    getChannels as getChannelsHelper,
    getRoles as getRolesHelper,
    getGuilds as getGuildsHelper,
    getCategories as getCategoriesHelper,
} from '../helper';
import settings from '../settings';

// Configure IPC for cross-platform compatibility
function configureIpc() {
    if (process.platform === 'win32') {
        ipc.config.socketRoot = '\\\\.\\pipe\\';
        ipc.config.appspace = '';
    } else {
        // Unix-like systems (Linux, macOS)
        ipc.config.socketRoot = '/tmp/';
        ipc.config.appspace = 'app.';
    }
}

// we start the bot if we are in the main process or if we're running on a Unix system
// Use a global flag to ensure we only start the bot once
if (!(global as any).__discordBotStarted) {
    if (!process.send || process.platform !== 'win32') {
        console.log('Starting Discord bot IPC server...');
        bot().catch(err => console.error('Error starting Discord bot:', err));
        (global as any).__discordBotStarted = true;
    }
}

export class DiscordTrigger implements INodeType {
    description: INodeTypeDescription = {
        displayName: 'Discord Trigger',
        name: 'discordTrigger',
        group: ['trigger'],
        version: 1,
        description: 'Discord Trigger on message',
        defaults: {
            name: 'Discord Trigger',
        },
        icon: 'file:discord-logo.svg',
        inputs: [],
        outputs: ['main'],
        credentials: [
            {
                name: 'discordBotTriggerApi',
                required: true,
            },
        ],
        properties: options,
    };

    methods = {
        loadOptions: {
            async getGuilds(): Promise<INodePropertyOptions[]> {
                return await getGuildsHelper(this).catch((e) => e) as { name: string; value: string }[];
            },
            async getChannels(): Promise<INodePropertyOptions[]> {
                // @ts-ignore
                const selectedGuilds = this.getNodeParameter('guildIds', []);
                if (!selectedGuilds.length) {
                    // @ts-ignore
                    throw new NodeOperationError('Please select at least one server before choosing channels.');
                }

                return await getChannelsHelper(this, selectedGuilds).catch((e) => e) as { name: string; value: string }[];
            },
            async getRoles(): Promise<INodePropertyOptions[]> {
                // @ts-ignore
                const selectedGuilds = this.getNodeParameter('guildIds', []);
                if (!selectedGuilds.length) {
                    // @ts-ignore
                    throw new NodeOperationError('Please select at least one server before choosing channels.');
                }


                return await getRolesHelper(this, selectedGuilds).catch((e) => e) as { name: string; value: string }[];
            },
            async getCategories(): Promise<INodePropertyOptions[]> {
                // @ts-ignore
                const selectedGuilds = this.getNodeParameter('guildIds', []);
                if (!selectedGuilds.length) {
                    // @ts-ignore
                    throw new NodeOperationError('Please select at least one server before choosing categories.');
                }

                return await getCategoriesHelper(this, selectedGuilds).catch((e) => e) as { name: string; value: string }[];
            },
        },
    };

    async trigger(this: ITriggerFunctions): Promise<ITriggerResponse> {

        const credentials = (await this.getCredentials('discordBotTriggerApi').catch((e) => e)) as any as ICredentials;

        if (!credentials?.token) {
            console.log("No token given.");

            return {};
        }

        await connection(credentials).catch((e) => e);

        configureIpc();
        ipc.connectTo('bot', () => {
            console.log('Connected to IPC server');

            const parameters: any = {};
            Object.keys(this.getNode().parameters).forEach((key) => {
                parameters[key] = this.getNodeParameter(key, '') as any;
            });

            ipc.of.bot.emit('triggerNodeRegistered', {
                parameters,
                active: this.getWorkflow().active,
                credentials,
                token: credentials.token,
                nodeId: this.getNode().id, // Unique to each node
            });

            ipc.of.bot.on('messageCreate', ({ message, author, guild, nodeId, messageReference, attachments, referenceAuthor, memberRoles }: any) => {
                if( this.getNode().id === nodeId) {
                    console.log("received messageCreate event", message.id);

                    const messageCreateOptions : any = {
                        id: message.id,
                        content: message.content,
                        guildId: guild?.id,
                        channelId: message.channelId,
                        authorId: author.id,
                        authorName: author.username,
                        timestamp: message.createdTimestamp,
                        listenValue: this.getNodeParameter('value', ''),
                        authorIsBot: author.bot || author.system,
                        memberRoles: memberRoles || [],
                        referenceId: null,
                        referenceContent: null,
                        referenceAuthorId: null,
                        referenceAuthorName: null,
                        referenceTimestamp: null,
                    }

                    if(messageReference) {
                        messageCreateOptions.referenceId = messageReference.id;
                        messageCreateOptions.referenceContent = messageReference.content;
                        messageCreateOptions.referenceAuthorId = referenceAuthor.id;
                        messageCreateOptions.referenceAuthorName = referenceAuthor.username;
                        messageCreateOptions.referenceTimestamp = messageReference.createdTimestamp;
                    }

                    if (attachments) {
                        messageCreateOptions.attachments = attachments;
                    }

                    this.emit([
                        this.helpers.returnJsonArray(messageCreateOptions),
                    ]);
                }
            });

            ipc.of.bot.on('guildMemberAdd', ({guildMember, guild, user, nodeId}) => {
                if( this.getNode().id === nodeId) {
                    this.emit([
                        this.helpers.returnJsonArray(guildMember),
                    ]);
                }
            });

            ipc.of.bot.on('guildMemberRemove', ({guildMember, guild, user, nodeId}) => {
                if( this.getNode().id === nodeId) {
                    this.emit([
                        this.helpers.returnJsonArray(guildMember),
                    ]);
                }
            });

            ipc.of.bot.on('guildMemberUpdate', ({oldMember, newMember, guild, nodeId}) => {
                if( this.getNode().id === nodeId) {

                    const addPrefix = (obj: any, prefix: string) =>
                        Object.fromEntries(Object.entries(obj).map(([key, value]) => [`${prefix}${key.charAt(0).toUpperCase()}${key.slice(1)}`, value]));

                    const mergedGuildMemberUpdateOptions: any = {
                        ...addPrefix(oldMember, "old"),
                        ...addPrefix(newMember, "new"),
                        ...addPrefix(guild, "guild"),
                    };

                    this.emit([
                        this.helpers.returnJsonArray(mergedGuildMemberUpdateOptions),
                    ]);
                }
            });

            ipc.of.bot.on('messageReactionAdd', ({messageReaction, message, user, guild, nodeId}) => {
                if( this.getNode().id === nodeId) {
                    this.emit([
                        this.helpers.returnJsonArray({...messageReaction, ...user, channelId: message.channelId, guildId: guild.id}),
                    ]);
                }
            });

            ipc.of.bot.on('messageReactionRemove', ({messageReaction, message, user, guild, nodeId}) => {
                if(this.getNode().id === nodeId) {
                    this.emit([
                        this.helpers.returnJsonArray({...messageReaction, ...user, channelId: message.channelId, guildId: guild.id}),
                    ]);
                }
            });

            ipc.of.bot.on('roleCreate', ({role, guild, nodeId}) => {
                if( this.getNode().id === nodeId) {
                    this.emit([
                        this.helpers.returnJsonArray(role),
                    ]);
                }
            });

            ipc.of.bot.on('roleDelete', ({role, guild, nodeId}) => {
                if( this.getNode().id === nodeId) {
                    this.emit([
                        this.helpers.returnJsonArray(role),
                    ]);
                }
            });

            ipc.of.bot.on('roleUpdate', ({oldRole, newRole, guild, nodeId}) => {
                if( this.getNode().id === nodeId) {

                    const addPrefix = (obj: any, prefix: string) =>
                        Object.fromEntries(Object.entries(obj).map(([key, value]) => [`${prefix}${key.charAt(0).toUpperCase()}${key.slice(1)}`, value]));

                    const mergedRoleOptions: any = {
                        ...addPrefix(oldRole, "old"),
                        ...addPrefix(newRole, "new")
                    };

                    this.emit([
                        this.helpers.returnJsonArray(mergedRoleOptions),
                    ]);
                }
            });
        });

        ipc.of.bot.on('disconnect', () => {
            console.error('Disconnected from IPC server');
        });

        // Return the cleanup function
        return {
            closeFunction: async () => {
                // remove the node from being executed
                console.log("removing trigger node");

                delete settings.triggerNodes[this.getNode().id];

                // Send message to bot process to deregister this node
                configureIpc();
                ipc.connectTo('bot', () => {
                    ipc.of.bot.emit('triggerNodeRemoved', { nodeId: this.getNode().id });
                });

                // Note: We do NOT disconnect from IPC here because:
                // 1. Other action nodes might still need the bot IPC server
                // 2. The bot process should keep running for action nodes
                // 3. IPC disconnect would break any in-flight action requests
                console.log('Trigger node removed, keeping bot IPC server running for action nodes');
            },
        };
    }
}
