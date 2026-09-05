import { Logger } from '@nestjs/common';
import { PollingCoordinator } from './polling-coordinator';

describe('PollingCoordinator', () => {
  it('lets an immediate caller join the poll already in progress', async () => {
    let finishPoll: (() => void) | undefined;
    const poll = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          finishPoll = resolve;
        }),
    );
    const coordinator = new PollingCoordinator(
      new Logger('PollingCoordinatorTest'),
      poll,
      60_000,
    );
    const completed = jest.fn();
    coordinator.onPollComplete(completed);

    const first = coordinator.triggerImmediatePoll();
    const second = coordinator.triggerImmediatePoll();

    expect(poll).toHaveBeenCalledTimes(1);
    expect(completed).not.toHaveBeenCalled();
    finishPoll?.();
    await Promise.all([first, second]);

    expect(completed).toHaveBeenCalledTimes(1);
  });

  it('waits for an active poll during shutdown and suppresses completion', async () => {
    let finishPoll: (() => void) | undefined;
    const poll = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          finishPoll = resolve;
        }),
    );
    const coordinator = new PollingCoordinator(
      new Logger('PollingCoordinatorTest'),
      poll,
      60_000,
    );
    const completed = jest.fn();
    coordinator.onPollComplete(completed);
    coordinator.ensurePolling();

    const drain = coordinator.stopAndDrain();
    let drained = false;
    void drain.then(() => {
      drained = true;
    });
    await Promise.resolve();
    expect(drained).toBe(false);

    finishPoll?.();
    await drain;
    expect(completed).not.toHaveBeenCalled();
  });
});
