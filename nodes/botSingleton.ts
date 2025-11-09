import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as lockfile from 'proper-lockfile';
import { execSync } from 'child_process';

// Platform-specific lock directory
const getLockDirectory = () => {
    if (process.platform === 'win32') {
        // Windows: Use temp directory
        return path.join(os.tmpdir(), 'n8n-discord-bot-locks');
    } else {
        // Unix-like systems: Use /tmp (more reliable across distributions)
        return path.join('/tmp', 'n8n-discord-bot-locks');
    }
};

// Ensure lock directory exists
const ensureLockDirectory = () => {
    const lockDir = getLockDirectory();
    if (!fs.existsSync(lockDir)) {
        try {
            fs.mkdirSync(lockDir, { recursive: true });
        } catch (e) {
            console.warn(`Could not create lock directory: ${lockDir}`, e);
        }
    }
    return lockDir;
};

class BotSingleton {
    private static instance: BotSingleton;
    private lockFile: string;
    private isLocked: boolean = false;
    private lockRelease: (() => void) | null = null;
    private processLockFile: string;
    private clientInstances: Map<string, any> = new Map();
    private eventListeners: Map<string, Set<Function>> = new Map();

    private constructor() {
        const lockDir = ensureLockDirectory();
        this.lockFile = path.join(lockDir, 'discord-bot.lock');
        this.processLockFile = path.join(lockDir, `discord-bot-${process.pid}.lock`);

        // Setup cleanup handlers
        this.setupCleanupHandlers();
    }

    public static getInstance(): BotSingleton {
        if (!BotSingleton.instance) {
            BotSingleton.instance = new BotSingleton();
        }
        return BotSingleton.instance;
    }

    private setupCleanupHandlers() {
        const cleanup = () => {
            try {
                this.release();
                // Clean up process-specific lock
                if (fs.existsSync(this.processLockFile)) {
                    fs.unlinkSync(this.processLockFile);
                }
                // Clear all event listeners
                this.clearAllEventListeners();
            } catch (e) {
                console.error('Error during cleanup:', e);
            }
        };

        // Handle various exit scenarios
        process.on('exit', cleanup);
        process.on('SIGINT', cleanup);
        process.on('SIGTERM', cleanup);
        process.on('uncaughtException', (err) => {
            console.error('Uncaught exception:', err);
            cleanup();
            process.exit(1);
        });
        process.on('unhandledRejection', (reason, promise) => {
            console.error('Unhandled Rejection at:', promise, 'reason:', reason);
        });
    }

    public async acquireLock(): Promise<boolean> {
        try {
            // Create lock file if it doesn't exist
            if (!fs.existsSync(this.lockFile)) {
                fs.writeFileSync(this.lockFile, JSON.stringify({
                    pid: process.pid,
                    timestamp: Date.now(),
                    platform: process.platform
                }));
            }

            // Check if another process has the lock
            if (await this.isLockedByAnotherProcess()) {
                console.log('Discord bot is already running in another process');
                return false;
            }

            // Try to acquire lock
            this.lockRelease = await lockfile.lock(this.lockFile, {
                stale: 10000, // Consider lock stale after 10 seconds
                retries: {
                    retries: 3,
                    minTimeout: 100,
                    maxTimeout: 500
                },
                realpath: false
            });

            this.isLocked = true;

            // Write process info
            fs.writeFileSync(this.lockFile, JSON.stringify({
                pid: process.pid,
                timestamp: Date.now(),
                platform: process.platform
            }));

            // Create process-specific lock
            fs.writeFileSync(this.processLockFile, JSON.stringify({
                pid: process.pid,
                timestamp: Date.now()
            }));

            console.log(`Discord bot lock acquired by process ${process.pid}`);
            return true;

        } catch (e: any) {
            if (e.code === 'ELOCKED') {
                console.log('Discord bot is already running');
                return false;
            }
            console.error('Error acquiring lock:', e);
            return false;
        }
    }

    private async isLockedByAnotherProcess(): Promise<boolean> {
        try {
            // Check if lock file exists and read it
            if (fs.existsSync(this.lockFile)) {
                const lockInfo = JSON.parse(fs.readFileSync(this.lockFile, 'utf-8'));

                // Check if the process that created the lock is still running
                if (lockInfo.pid && lockInfo.pid !== process.pid) {
                    if (this.isProcessRunning(lockInfo.pid)) {
                        return true;
                    } else {
                        // Process is dead, clean up stale lock
                        console.log(`Cleaning up stale lock from dead process ${lockInfo.pid}`);
                        try {
                            await lockfile.unlock(this.lockFile);
                        } catch (e) {
                            // Ignore unlock errors for stale locks
                        }
                        return false;
                    }
                }
            }
        } catch (e) {
            console.error('Error checking lock status:', e);
        }
        return false;
    }

    private isProcessRunning(pid: number): boolean {
        try {
            if (process.platform === 'win32') {
                // Windows: Use tasklist
                const result = execSync(`tasklist /FI "PID eq ${pid}"`, { encoding: 'utf-8' });
                return result.includes(pid.toString());
            } else {
                // Unix-like: Send signal 0 to check if process exists
                process.kill(pid, 0);
                return true;
            }
        } catch (e) {
            return false;
        }
    }

    public release(): void {
        try {
            if (this.lockRelease) {
                this.lockRelease();
                this.lockRelease = null;
                this.isLocked = false;
                console.log(`Discord bot lock released by process ${process.pid}`);
            }

            // Clean up process-specific lock
            if (fs.existsSync(this.processLockFile)) {
                fs.unlinkSync(this.processLockFile);
            }
        } catch (e) {
            console.error('Error releasing lock:', e);
        }
    }

    public hasLock(): boolean {
        return this.isLocked;
    }

    // Manage client instances to prevent duplicates
    public setClient(token: string, client: any): void {
        if (this.clientInstances.has(token)) {
            console.warn(`Client for token already exists, replacing...`);
            // Disconnect old client
            const oldClient = this.clientInstances.get(token);
            if (oldClient && oldClient.destroy) {
                oldClient.destroy();
            }
        }
        this.clientInstances.set(token, client);
    }

    public getClient(token: string): any {
        return this.clientInstances.get(token);
    }

    public hasClient(token: string): boolean {
        return this.clientInstances.has(token);
    }

    public removeClient(token: string): void {
        const client = this.clientInstances.get(token);
        if (client) {
            if (client.destroy) {
                client.destroy();
            }
            this.clientInstances.delete(token);
        }
    }

    // Manage event listeners to prevent duplicates
    public addEventListener(eventKey: string, listener: Function): void {
        if (!this.eventListeners.has(eventKey)) {
            this.eventListeners.set(eventKey, new Set());
        }
        this.eventListeners.get(eventKey)!.add(listener);
    }

    public removeEventListener(eventKey: string, listener: Function): void {
        const listeners = this.eventListeners.get(eventKey);
        if (listeners) {
            listeners.delete(listener);
            if (listeners.size === 0) {
                this.eventListeners.delete(eventKey);
            }
        }
    }

    public hasEventListener(eventKey: string, listener: Function): boolean {
        const listeners = this.eventListeners.get(eventKey);
        return listeners ? listeners.has(listener) : false;
    }

    public clearEventListeners(eventKey: string): void {
        this.eventListeners.delete(eventKey);
    }

    public clearAllEventListeners(): void {
        this.eventListeners.clear();
    }

    // Get singleton status
    public getStatus(): any {
        const lockDir = getLockDirectory();
        const processLocks = fs.readdirSync(lockDir).filter(f => f.startsWith('discord-bot-') && f.endsWith('.lock'));

        return {
            hasLock: this.isLocked,
            currentPid: process.pid,
            lockFile: this.lockFile,
            processLockFile: this.processLockFile,
            activeClients: this.clientInstances.size,
            eventListeners: Array.from(this.eventListeners.keys()),
            otherProcesses: processLocks.map(f => {
                try {
                    const content = fs.readFileSync(path.join(lockDir, f), 'utf-8');
                    return JSON.parse(content);
                } catch (e) {
                    return { file: f, error: 'Could not read' };
                }
            })
        };
    }
}

export default BotSingleton;