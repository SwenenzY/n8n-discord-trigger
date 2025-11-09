import {
    type INodeType,
    type INodeTypeDescription,
    type ITriggerFunctions,
    type ITriggerResponse,
    type INodePropertyOptions,
    NodeOperationError,
} from 'n8n-workflow';
import { options } from './DiscordVoiceTrigger.node.options';
import bot from '../bot';
import ipc from 'node-ipc';
import {
    connection,
    ICredentials,
    getRoles as getRolesHelper,
    getGuilds as getGuildsHelper,
    getVoiceChannels as getVoiceChannelsHelper,
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

// Start bot if needed
if (!(global as any).__discordBotStarted) {
    if (!process.send || process.platform !== 'win32') {
        console.log('Starting Discord bot IPC server for voice...');
        bot().catch(err => console.error('Error starting Discord bot:', err));
        (global as any).__discordBotStarted = true;
    }
}

export class DiscordVoiceTrigger implements INodeType {
    description: INodeTypeDescription = {
        displayName: 'Discord Voice Trigger',
        name: 'discordVoiceTrigger',
        group: ['trigger'],
        version: 1,
        description: 'Trigger workflows from Discord voice channels',
        defaults: {
            name: 'Discord Voice Trigger',
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
            async getVoiceChannels(): Promise<INodePropertyOptions[]> {
                // @ts-ignore
                const selectedGuilds = this.getNodeParameter('guildIds', []);
                if (!selectedGuilds.length) {
                    // @ts-ignore
                    throw new NodeOperationError('Please select at least one server before choosing voice channels.');
                }

                return await getVoiceChannelsHelper(this, selectedGuilds).catch((e) => e) as { name: string; value: string }[];
            },
            async getRoles(): Promise<INodePropertyOptions[]> {
                // @ts-ignore
                const selectedGuilds = this.getNodeParameter('guildIds', []);
                if (!selectedGuilds.length) {
                    // @ts-ignore
                    throw new NodeOperationError('Please select at least one server before choosing roles.');
                }

                return await getRolesHelper(this, selectedGuilds).catch((e) => e) as { name: string; value: string }[];
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
            console.log('Connected to IPC server for voice trigger');

            const parameters: any = {};
            Object.keys(this.getNode().parameters).forEach((key) => {
                parameters[key] = this.getNodeParameter(key, '') as any;
            });

            // Register voice trigger node
            ipc.of.bot.emit('voiceTriggerNodeRegistered', {
                parameters,
                active: this.getWorkflow().active,
                credentials,
                token: credentials.token,
                nodeId: this.getNode().id,
            });

            // Handle voice state updates (join/leave)
            ipc.of.bot.on('voiceStateUpdate', ({ oldState, newState, member, guild, nodeId }: any) => {
                if (this.getNode().id === nodeId) {
                    console.log('Received voiceStateUpdate event');

                    const voiceStateData: any = {
                        userId: member.id,
                        userName: member.user.username,
                        userDiscriminator: member.user.discriminator,
                        guildId: guild.id,
                        guildName: guild.name,
                        channelId: newState?.channelId || oldState?.channelId,
                        channelName: newState?.channel?.name || oldState?.channel?.name,
                        action: !oldState?.channelId && newState?.channelId ? 'joined' :
                               oldState?.channelId && !newState?.channelId ? 'left' :
                               'moved',
                        timestamp: Date.now(),
                        selfMuted: newState?.selfMute,
                        selfDeaf: newState?.selfDeaf,
                        serverMuted: newState?.serverMute,
                        serverDeaf: newState?.serverDeaf,
                        streaming: newState?.streaming,
                        video: newState?.selfVideo,
                    };

                    this.emit([
                        this.helpers.returnJsonArray(voiceStateData),
                    ]);
                }
            });

            // Handle voice recordings
            ipc.of.bot.on('voiceRecording', ({ recording, user, channel, guild, nodeId, transcription }: any) => {
                if (this.getNode().id === nodeId) {
                    console.log('Received voice recording');

                    const recordingData: any = {
                        userId: user.id,
                        userName: user.username,
                        userDiscriminator: user.discriminator,
                        guildId: guild.id,
                        guildName: guild.name,
                        channelId: channel.id,
                        channelName: channel.name,
                        timestamp: Date.now(),
                        duration: recording.duration,
                        format: recording.format,
                    };

                    // Add audio data
                    if (recording.buffer) {
                        recordingData.audioData = recording.buffer.toString('base64');
                        recordingData.audioSize = recording.buffer.length;
                    }

                    // Add file path if saved
                    if (recording.filePath) {
                        recordingData.filePath = recording.filePath;
                    }

                    // Add transcription if available
                    if (transcription) {
                        recordingData.transcription = transcription.text;
                        recordingData.transcriptionConfidence = transcription.confidence;
                        recordingData.transcriptionLanguage = transcription.language;
                    }

                    this.emit([
                        this.helpers.returnJsonArray(recordingData),
                    ]);
                }
            });

            // Handle voice activity (speaking start/stop)
            ipc.of.bot.on('voiceActivity', ({ user, channel, guild, nodeId, speaking, timestamp }: any) => {
                if (this.getNode().id === nodeId) {
                    console.log('Received voice activity event');

                    const activityData: any = {
                        userId: user.id,
                        userName: user.username,
                        userDiscriminator: user.discriminator,
                        guildId: guild.id,
                        guildName: guild.name,
                        channelId: channel.id,
                        channelName: channel.name,
                        speaking: speaking,
                        timestamp: timestamp || Date.now(),
                        action: speaking ? 'started_speaking' : 'stopped_speaking',
                    };

                    this.emit([
                        this.helpers.returnJsonArray(activityData),
                    ]);
                }
            });

            // Handle errors
            ipc.of.bot.on('voiceError', ({ error, nodeId }: any) => {
                if (this.getNode().id === nodeId) {
                    console.error('Voice trigger error:', error);
                    throw new NodeOperationError(this.getNode(), error.message || 'Voice trigger error occurred');
                }
            });
        });

        ipc.of.bot.on('disconnect', () => {
            console.error('Disconnected from IPC server');
        });

        // Return the cleanup function
        return {
            closeFunction: async () => {
                console.log("Removing voice trigger node");

                delete settings.voiceTriggerNodes[this.getNode().id];

                // Send message to bot process to deregister this node
                configureIpc();
                ipc.connectTo('bot', () => {
                    ipc.of.bot.emit('voiceTriggerNodeRemoved', { nodeId: this.getNode().id });
                });

                console.log('Voice trigger node removed, keeping bot IPC server running');
            },
        };
    }
}