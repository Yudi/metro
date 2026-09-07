import { TestBed } from '@angular/core/testing';
import { LoggerService } from '@metro/shared/api';
import { io } from 'socket.io-client';
import { RealtimeWebsocketService } from './realtime-websocket.service';

jest.mock('socket.io-client', () => ({ io: jest.fn() }));

describe('RealtimeWebsocketService', () => {
  const listeners = new Map<string, (...args: unknown[]) => void>();
  const socket = {
    connected: true,
    on: jest.fn((event: string, handler: (...args: unknown[]) => void) => {
      listeners.set(event, handler);
      return socket;
    }),
    off: jest.fn(),
    emit: jest.fn(),
    disconnect: jest.fn(),
  };

  beforeEach(() => {
    listeners.clear();
    jest.clearAllMocks();
    (io as jest.Mock).mockReturnValue(socket);
    TestBed.configureTestingModule({
      providers: [
        RealtimeWebsocketService,
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
    TestBed.inject(RealtimeWebsocketService).ngOnDestroy();
  });

  it('keeps a shared stop subscription until its final owner releases it', () => {
    const service = TestBed.inject(RealtimeWebsocketService);
    const firstRelease = service.subscribeToStop('1234');
    const secondRelease = service.subscribeToStop('1234');

    expect(socket.emit).toHaveBeenCalledTimes(1);
    expect(socket.emit).toHaveBeenCalledWith('subscribe_stop', {
      stopCode: '1234',
    });

    firstRelease();
    expect(socket.emit).not.toHaveBeenCalledWith('unsubscribe_stop', {
      stopCode: '1234',
    });

    secondRelease();
    expect(socket.emit).toHaveBeenCalledWith('unsubscribe_stop', {
      stopCode: '1234',
    });
  });

  it('does not regress a stop cache or global timestamp from an older update', () => {
    const service = TestBed.inject(RealtimeWebsocketService);
    service.subscribeToStop('1234');
    const arrivalListener = listeners.get('arrival_predictions');

    arrivalListener?.({
      data: {
        stopCode: '1234',
        hr: '12:00',
        p: null,
        cacheTimestamp: 200,
      },
    });
    arrivalListener?.({
      data: {
        stopCode: '1234',
        hr: '11:59',
        p: null,
        cacheTimestamp: 100,
      },
    });

    expect(service.getArrivalPredictionsForStop('1234')).toEqual(
      expect.objectContaining({ cacheTimestamp: 200 }),
    );
    expect(service.lastUpdateTimestamp()).toBe(200);
  });

  it('re-subscribes each active key after reconnecting', () => {
    const service = TestBed.inject(RealtimeWebsocketService);
    service.subscribeToRoute('100');
    socket.emit.mockClear();

    listeners.get('disconnect')?.();
    listeners.get('connect')?.();

    expect(socket.emit).toHaveBeenCalledWith('subscribe_route', {
      routeShortName: '100',
    });
  });
});
