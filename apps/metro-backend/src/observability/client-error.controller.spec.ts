import { ClientErrorController } from './client-error.controller';

describe('ClientErrorController', () => {
  it('recursively redacts and bounds client-controlled context before logging', () => {
    const controller = new ClientErrorController();
    const logger = (
      controller as unknown as { logger: { error: jest.Mock; warn: jest.Mock } }
    ).logger;
    jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
    jest.spyOn(logger, 'error').mockImplementation(() => undefined);
    const context: Record<string, unknown> = {
      safe: { nested: 'visible' },
      credentials: { bearerToken: 'nested-secret-canary' },
      values: Array.from({ length: 100 }, () => 'large-value'.repeat(100)),
    };
    Object.defineProperty(context, 'getter', {
      enumerable: true,
      get: () => 'getter-secret-canary',
    });

    controller.capture({
      eventId: '00000000-0000-0000-0000-000000000001',
      sessionId: '00000000-0000-0000-0000-000000000002',
      severity: 'warning',
      message: 'client warning',
      route: '/map',
      timestamp: '2026-09-04T12:00:00.000Z',
      context: context as never,
    });

    const logged = logger.warn.mock.calls.flat().join(' ');
    expect(logged).not.toContain('nested-secret-canary');
    expect(logged).not.toContain('getter-secret-canary');
    expect(Buffer.byteLength(logged)).toBeLessThan(10_000);
    expect(logged).toContain('[REDACTED]');
  });
});
