import { Client } from 'discord.js';
import * as fs from 'fs';
import * as path from 'path';

const DISABLED_CHANNELS_FILE = path.join(__dirname, 'disabled-channels.json');

// Load disabled channels from file on startup
function loadDisabledChannels(): Set<string> {
    try {
        if (fs.existsSync(DISABLED_CHANNELS_FILE)) {
            const data = fs.readFileSync(DISABLED_CHANNELS_FILE, 'utf-8');
            const channels = JSON.parse(data);
            return new Set(channels);
        }
    } catch (error) {
        console.error('Error loading disabled channels:', error);
    }
    return new Set();
}

// Save disabled channels to file
export function saveDisabledChannels(disabledChannels: Set<string>): void {
    try {
        const data = JSON.stringify(Array.from(disabledChannels), null, 2);
        fs.writeFileSync(DISABLED_CHANNELS_FILE, data, 'utf-8');
    } catch (error) {
        console.error('Error saving disabled channels:', error);
    }
}

const settings: {
    ready: boolean;
    login: boolean;
    testMode: boolean;
    clientId: string;
    token: string;
    baseUrl: string;
    parameters: any;

    readyClients: { [token: string]: boolean };
    loginQueue: { [token: string]: boolean };
    clientMap: { [token: string]: Client };
    credentials: { [token: string]: { token: string; clientId: string } };

    triggerNodes: { [token: string]: { [nodeId: string]: any } };

    // Support ticket channel management
    disabledChannels: Set<string>;

    // Message debounce tracking (prevents spam from same user in same channel)
    userMessageTimers: Map<string, NodeJS.Timeout>; // key: "channelId:userId:nodeId" -> timer
    userLastMessages: Map<string, any>; // key: "channelId:userId:nodeId" -> last message data
    lastEmitTime: Map<string, number>; // key: "channelId:userId:nodeId" -> timestamp of last emit (for cooldown)
} = {
    ready: false,
    login: false,
    testMode: false,
    clientId: '',
    token: '',
    baseUrl: '',
    parameters: {},

    triggerNodes: {},

    readyClients: {},
    loginQueue: {},
    clientMap: {},
    credentials: {},

    disabledChannels: loadDisabledChannels(),
    userMessageTimers: new Map(),
    userLastMessages: new Map(),
    lastEmitTime: new Map(),
}

export default settings;