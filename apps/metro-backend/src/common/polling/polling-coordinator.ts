import { EventEmitter } from 'events';
import { Logger } from '@nestjs/common';

/**
 * Reusable polling coordinator that ensures a single polling loop is active,
 * triggers an immediate poll on startup, and exposes poll completion events.
 */
export class PollingCoordinator {
  private readonly eventEmitter = new EventEmitter();
  private pollingInterval: NodeJS.Timeout | null = null;
  private activePoll: Promise<void> | null = null;
  private stopped = true;

  constructor(
    private readonly logger: Logger,
    private readonly pollFn: () => Promise<void>,
    private readonly pollIntervalMs: number,
  ) {}

  /**
   * Ensure the polling loop is running. Triggers an immediate poll if needed.
   */
  ensurePolling(): void {
    if (this.pollingInterval) {
      return;
    }

    this.logger.debug(
      `Starting polling loop (every ${this.pollIntervalMs / 1000} seconds)`,
    );
    this.stopped = false;

    // Kick off the recurring interval
    this.pollingInterval = setInterval(() => {
      void this.executePoll();
    }, this.pollIntervalMs);

    // Trigger an immediate poll on start
    void this.executePoll();
  }

  /**
   * Stop polling loop and clear any scheduled intervals.
   */
  stopPolling(): void {
    this.stopped = true;
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
      this.logger.debug('Stopped polling loop');
    }
  }

  async stopAndDrain(): Promise<void> {
    this.stopPolling();
    await this.activePoll;
  }

  /**
   * Trigger an immediate poll outside of the regular schedule.
   */
  async triggerImmediatePoll(): Promise<void> {
    this.logger.debug('Immediate poll requested');
    this.stopped = false;
    await this.executePoll();
  }

  /**
   * Subscribe to poll completion events.
   */
  onPollComplete(listener: () => void): void {
    this.eventEmitter.on('pollComplete', listener);
  }

  /**
   * Remove poll completion listener.
   */
  offPollComplete(listener: () => void): void {
    this.eventEmitter.off('pollComplete', listener);
  }

  private async executePoll(): Promise<void> {
    if (this.activePoll) {
      this.logger.debug('Joining the poll already in progress');
      return this.activePoll;
    }

    this.activePoll = this.runPoll();
    return this.activePoll;
  }

  private async runPoll(): Promise<void> {
    try {
      await this.pollFn();
      if (!this.stopped) {
        this.eventEmitter.emit('pollComplete');
      }
    } catch (error) {
      const trace =
        error instanceof Error ? error.stack : JSON.stringify(error);
      this.logger.error('Error during polling cycle', trace);
    } finally {
      this.activePoll = null;
    }
  }
}
