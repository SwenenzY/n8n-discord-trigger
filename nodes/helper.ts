import ipc from 'node-ipc';
import { INodePropertyOptions } from 'n8n-workflow';
import axios from "axios";

export interface ICredentials {
    clientId: string;
    token: string;
    apiKey: string;
    baseUrl: string;
}

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

export const connection = (credentials: ICredentials): Promise<string> => {
    return new Promise((resolve, reject) => {
        if (!credentials || !credentials.token || !credentials.clientId) {
            reject('credentials missing');
            return;
        }

        const timeout = setTimeout(() => reject('timeout'), 15000);

        ipc.config.retry = 1500;
        configureIpc();

        ipc.connectTo('bot', () => {
            ipc.of.bot.emit('credentials', credentials);

            ipc.of.bot.on('credentials', (data: string) => {
                clearTimeout(timeout);
                if (data === 'error') reject('Invalid credentials');
                else if (data === 'missing') reject('Token or clientId missing');
                else if (data === 'login') reject('Already logging in');
                else if (data === 'different') resolve('Already logging in with different credentials');
                else resolve(data); // ready / already
            });
        });
    });
};


export const getChannels = async (that: any, guildIds: string[]): Promise<INodePropertyOptions[]> => {
    const endMessage = ' - Close and reopen this node modal once you have made changes.';

    const credentials = await that.getCredentials('discordBotTriggerApi').catch((e: any) => e);
    const res = await connection(credentials).catch((e) => e);
    if (!['ready', 'already'].includes(res)) {
        return [
            {
                name: res + endMessage,
                value: 'false',
            },
        ];
    }

    const channelsRequest = () =>
        new Promise((resolve) => {
            const timeout = setTimeout(() => resolve(''), 15000);

            ipc.config.retry = 1500;
            configureIpc();

            ipc.connectTo('bot', () => {
                ipc.of.bot.emit('list:channels', {guildIds: guildIds, token: credentials.token});

                ipc.of.bot.on('list:channels', (data: { name: string; value: string }[]) => {
                    clearTimeout(timeout);
                    resolve(data);
                });
            });
        });

    const channels = await channelsRequest().catch((e) => e);

    let message = 'Unexpected error';

    if (channels) {
        if (Array.isArray(channels) && channels.length) return channels;
        else
            message =
                'Your Discord server has no text channels, please add at least one text channel' +
                endMessage;
    }

    return [
        {
            name: message,
            value: 'false',
        },
    ];
};


export const getGuilds = async (that: any): Promise<INodePropertyOptions[]> => {
    const endMessage = ' - Close and reopen this node modal once you have made changes.';

    const credentials = await that.getCredentials('discordBotTriggerApi').catch((e: any) => e);
    const res = await connection(credentials).catch((e) => e);
    if (!['ready', 'already'].includes(res)) {
        return [
            {
                name: res + endMessage,
                value: 'false',
            },
        ];
    }

    const guildsRequest = () =>
        new Promise((resolve) => {
            const timeout = setTimeout(() => resolve(''), 15000);

            ipc.config.retry = 1500;
            configureIpc();

            ipc.connectTo('bot', () => {
                ipc.of.bot.emit('list:guilds', { token: credentials.token });

                ipc.of.bot.on('list:guilds', (data: { name: string; value: string }[]) => {
                    clearTimeout(timeout);
                    resolve(data);
                });
            });
        });

    const guilds = await guildsRequest().catch((e) => e);

    let message = 'Unexpected error';

    if (guilds) {
        if (Array.isArray(guilds) && guilds.length) return guilds;
        else
            message =
                'Your bot is not part of any guilds. Please add the bot to at least one guild.' +
                endMessage;
    }

    return [
        {
            name: message,
            value: 'false',
        },
    ];
};

export interface IRole {
    name: string;
    id: string;
}

export const getCategories = async (that: any, selectedGuildIds: string[]): Promise<INodePropertyOptions[]> => {
    const endMessage = ' - Close and reopen this node modal once you have made changes.';

    const credentials = await that.getCredentials('discordBotTriggerApi').catch((e: any) => e);
    const res = await connection(credentials).catch((e) => e);
    if (!['ready', 'already'].includes(res)) {
        return [
            {
                name: res + endMessage,
                value: 'false',
            },
        ];
    }

    const categoriesRequest = () =>
        new Promise((resolve) => {
            const timeout = setTimeout(() => resolve(''), 15000);

            ipc.config.retry = 1500;
            configureIpc();

            ipc.connectTo('bot', () => {
                ipc.of.bot.emit('list:categories', { guildIds: selectedGuildIds, token: credentials.token });

                ipc.of.bot.on('list:categories', (data: { name: string; value: string }[]) => {
                    clearTimeout(timeout);
                    resolve(data);
                });
            });
        });

    const categories = await categoriesRequest().catch((e) => e);

    let message = 'Unexpected error';

    if (categories) {
        if (Array.isArray(categories) && categories.length) return categories;
        else
            message =
                'Your Discord server has no categories, please add at least one category' +
                endMessage;
    }

    return [
        {
            name: message,
            value: 'false',
        },
    ];
};

export const getRoles = async (that: any, selectedGuildIds: string[]): Promise<INodePropertyOptions[]> => {
    const endMessage = ' - Close and reopen this node modal once you have made changes.';

    const credentials = await that.getCredentials('discordBotTriggerApi').catch((e: any) => e);
    const res = await connection(credentials).catch((e) => e);
    if (!['ready', 'already'].includes(res)) {
        return [
            {
                name: res + endMessage,
                value: 'false',
            },
        ];
    }

    const rolesRequest = () =>
        new Promise((resolve) => {
            const timeout = setTimeout(() => resolve(''), 15000);

            ipc.config.retry = 1500;
            configureIpc();

            ipc.connectTo('bot', () => {
                ipc.of.bot.emit('list:roles', { guildIds: selectedGuildIds, token: credentials.token });

                ipc.of.bot.on('list:roles', (data: any) => {
                    clearTimeout(timeout);
                    resolve(data);
                });
            });
        });

    const roles = await rolesRequest().catch((e) => e);

    let message = 'Unexpected error';

    if (roles) {
        if (Array.isArray(roles)) {
            const filtered = roles.filter((r: any) => r.name !== '@everyone');
            if (filtered.length) return filtered;
            else
                message =
                    'Your Discord server has no roles, please add at least one if you want to restrict the trigger to specific users' +
                    endMessage;
        } else message = 'Something went wrong' + endMessage;
    }

    return [
        {
            name: message,
            value: 'false',
        },
    ];
};


export const checkWorkflowStatus = async (n8nApiUrl: String, apiToken: String, workflowId: String): Promise<boolean> => {
    const apiUrl = `${removeTrailingSlash(n8nApiUrl)}/workflows/${workflowId}`;
    return new Promise((resolve, reject) => {
        axios.get(apiUrl, {
            headers: {
                'X-N8N-API-KEY': `${apiToken}`,
            },
        }).then(response => {
            // return if workflow is active or not
            resolve(response.data.active);
        }).catch(e => {
            console.error('Error checking workflow status:', e.message);
            reject(e);
        });
    });
}


// Support ticket: Toggle channel enable/disable
export const toggleChannelStatus = (channelId: string, action: 'close' | 'open'): Promise<any> => {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject('timeout'), 15000);

        ipc.config.retry = 1500;
        configureIpc();

        ipc.connectTo('bot', () => {
            ipc.of.bot.emit('support:toggle-channel', { channelId, action });

            ipc.of.bot.on('callback:support:toggle-channel', (data: any) => {
                clearTimeout(timeout);
                resolve(data);
            });
        });
    });
};

// Support ticket: Check channel status
export const checkChannelStatus = (channelId: string): Promise<{ isDisabled: boolean; isEnabled: boolean }> => {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject('timeout'), 15000);

        ipc.config.retry = 1500;
        configureIpc();

        ipc.connectTo('bot', () => {
            ipc.of.bot.emit('support:check-channel-status', { channelId });

            ipc.of.bot.on('callback:support:check-channel-status', (data: any) => {
                clearTimeout(timeout);
                if (data.error) reject('error');
                else resolve(data);
            });
        });
    });
};


export const ipcRequest = (type: string, parameters: any): Promise<any> => {
    return new Promise((resolve) => {
        ipc.config.retry = 1500;
        configureIpc();

        ipc.connectTo('bot', () => {
            ipc.of.bot.on(`callback:${type}`, (data: any) => {
                console.log("response fired", data);
                resolve(data);
            });

            // send event to bot
            ipc.of.bot.emit(type, parameters);
        });
    });
};


function removeTrailingSlash(url: String) {
    if (url.endsWith('/')) {
        return url.slice(0, -1);
    }
    return url;
}
