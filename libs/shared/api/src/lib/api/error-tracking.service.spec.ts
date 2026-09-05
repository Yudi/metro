import { ErrorTrackingService } from './error-tracking.service';

describe('ErrorTrackingService', () => {
  it('redacts sensitive error and context data before transport', () => {
    const service = new ErrorTrackingService();
    service.trackError(
      'Request failed',
      new Error('failed https://example.test/path?token=secret-value'),
      {
        component: 'Map',
        authorization: 'Bearer secret-token',
        latitude: -23.55,
      },
    );

    const log = service.getRecentErrors(1)[0];
    const event = (
      service as unknown as {
        toClientEvent(value: typeof log): {
          context: Record<string, unknown>;
          stack?: string;
        };
      }
    ).toClientEvent(log);

    expect(event.context).toEqual(
      expect.objectContaining({ component: 'Map' }),
    );
    expect(event.context).not.toHaveProperty('authorization');
    expect(event.context).not.toHaveProperty('latitude');
    expect(event.stack).not.toContain('secret-value');
    expect(event.stack).toContain('[REDACTED]');
    service.ngOnDestroy();
  });

  it('removes the online listener when the service is destroyed', () => {
    const addEventListener = jest.spyOn(window, 'addEventListener');
    const removeEventListener = jest.spyOn(window, 'removeEventListener');
    const service = new ErrorTrackingService();

    service.initialize();
    service.ngOnDestroy();

    const onlineListener = addEventListener.mock.calls.find(
      ([event]) => event === 'online',
    )?.[1];
    expect(onlineListener).toEqual(expect.any(Function));
    expect(removeEventListener).toHaveBeenCalledWith(
      'online',
      onlineListener,
    );

    addEventListener.mockRestore();
    removeEventListener.mockRestore();
  });
});
