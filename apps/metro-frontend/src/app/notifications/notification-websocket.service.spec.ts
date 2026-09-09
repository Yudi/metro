import { TestBed } from '@angular/core/testing';
import { LoggerService } from '@metro/shared/api';
import { io } from 'socket.io-client';
import { NotificationWebsocketService } from './notification-websocket.service';

jest.mock('socket.io-client', () => ({ io: jest.fn() }));

describe('NotificationWebsocketService', () => {
  const listeners = new Map<string, (...args: unknown[]) => void>();
  const socket = {
    connected: true,
    on: jest.fn((event: string, handler: (...args: unknown[]) => void) => {
      listeners.set(event, handler);
      return socket;
    }),
    emit: jest.fn(),
    disconnect: jest.fn(),
    removeAllListeners: jest.fn(),
  };

  beforeEach(() => {
    listeners.clear();
    jest.clearAllMocks();
    (io as jest.Mock).mockReturnValue(socket);
    TestBed.configureTestingModule({
      providers: [
        NotificationWebsocketService,
        {
          provide: LoggerService,
          useValue: {
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
          },
        },
      ],
    });
  });

  afterEach(() => {
    TestBed.inject(NotificationWebsocketService).ngOnDestroy();
  });

  it('authenticates the namespace with the current account token', () => {
    const service = TestBed.inject(NotificationWebsocketService);
    service.connect('account-a', 'token-a');

    expect(io).toHaveBeenCalledWith(
      expect.stringContaining('/notifications'),
      expect.objectContaining({ auth: { token: 'token-a' } }),
    );
  });

  it('forwards valid snapshots and deltas while ignoring malformed payloads', () => {
    const service = TestBed.inject(NotificationWebsocketService);
    const received: unknown[] = [];
    service.events$.subscribe((event) => received.push(event));
    service.connect('account-a', 'token-a');

    listeners.get('notification_configuration_snapshot')?.({
      type: 'snapshot',
      configuration: {
        revision: 4,
        available: true,
        publicKey: null,
        triggers: [],
        devices: [],
      },
    });
    listeners.get('notification_configuration_delta')?.({
      type: 'delta',
      delta: { type: 'device_remove', deviceId: 'device-a', revision: 5 },
    });
    listeners.get('notification_configuration_delta')?.({
      type: 'delta',
      delta: { type: 'device_remove', deviceId: 'device-a', revision: 0 },
    });

    expect(received).toHaveLength(2);
    expect((received[0] as { type: string }).type).toBe('snapshot');
    expect((received[1] as { type: string }).type).toBe('delta');
  });

  it('requests an account snapshot over the authenticated socket', () => {
    const service = TestBed.inject(NotificationWebsocketService);
    service.connect('account-a', 'token-a');
    service.requestResync();

    expect(socket.emit).toHaveBeenCalledWith(
      'notification_configuration_resync',
      {},
    );
  });

  it('disconnects the previous account before connecting with a new token', () => {
    const service = TestBed.inject(NotificationWebsocketService);
    service.connect('account-a', 'token-a');
    service.connect('account-b', 'token-b');

    expect(socket.disconnect).toHaveBeenCalledTimes(1);
    expect(io).toHaveBeenCalledTimes(2);
  });
});
