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
});
