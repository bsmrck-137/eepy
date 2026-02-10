import { pauseMedia, suspendSystem } from "./platform";

export interface TimerState {
    isRunning: boolean;
    remainingSeconds: number;
    totalSeconds: number;
    startedAt: number | null;
}

type TimerCallback = () => void;

class SleepTimer {
    private state: TimerState = {
        isRunning: false,
        remainingSeconds: 0,
        totalSeconds: 0,
        startedAt: null,
    };

    private intervalId: ReturnType<typeof setInterval> | null = null;
    private onExpireCallbacks: TimerCallback[] = [];

    /**
     * Start a countdown timer
     * @param minutes Duration in minutes
     */
    start(minutes: number): TimerState {
        if (this.intervalId) {
            clearInterval(this.intervalId);
        }

        const totalSeconds = Math.floor(minutes * 60);
        this.state = {
            isRunning: true,
            remainingSeconds: totalSeconds,
            totalSeconds: totalSeconds,
            startedAt: Date.now(),
        };

        this.intervalId = setInterval(() => this.tick(), 1000);

        console.log(`[Timer] Started: ${minutes} minutes (${totalSeconds} seconds)`);
        return this.getState();
    }

    /**
     * Cancel the active timer
     */
    cancel(): TimerState {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }

        this.state = {
            isRunning: false,
            remainingSeconds: 0,
            totalSeconds: 0,
            startedAt: null,
        };

        console.log("[Timer] Cancelled");
        return this.getState();
    }

    /**
     * Get current timer state
     */
    getState(): TimerState {
        return { ...this.state };
    }

    /**
     * Register a callback for when timer expires
     */
    onExpire(callback: TimerCallback): void {
        this.onExpireCallbacks.push(callback);
    }

    private tick(): void {
        if (!this.state.isRunning) return;

        this.state.remainingSeconds--;

        if (this.state.remainingSeconds <= 0) {
            this.expire();
        }
    }

    private async expire(): Promise<void> {
        console.log("[Timer] Expired! Pausing media and suspending...");

        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }

        this.state.isRunning = false;
        this.state.remainingSeconds = 0;

        // Execute callbacks
        for (const callback of this.onExpireCallbacks) {
            try {
                callback();
            } catch (e) {
                console.error("[Timer] Callback error:", e);
            }
        }

        // Pause media first
        const pauseResult = await pauseMedia();
        console.log("[Timer] Pause media:", pauseResult.message);

        // Give a moment for the pause to take effect
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Then suspend the system
        const suspendResult = await suspendSystem();
        console.log("[Timer] Suspend:", suspendResult.message);
    }
}

// Singleton instance
export const timer = new SleepTimer();
