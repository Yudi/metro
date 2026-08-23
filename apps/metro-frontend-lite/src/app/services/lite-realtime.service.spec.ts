import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { API_BASE_URL } from '@metro/shared/api';
import { io } from 'socket.io-client';
import { LiteRealtimeService } from './lite-realtime.service';

jest.mock('socket.io-client', () => ({ io: jest.fn() }));

describe('LiteRealtimeService', () => {
  const listeners = new Map<string, (...args: unknown[]) => void>();
  const socket = {
    on: jest.fn((event: string, handler: (...args: unknown[]) => void) => {
      listeners.set(event, handler);
    }),
    off: jest.fn(),
    emit: jest.fn(),
    disconnect: jest.fn(),
  };

  beforeEach(() => {
    jest.useFakeTimers();
    listeners.clear();
    jest.clearAllMocks();
    (io as jest.Mock).mockReturnValue(socket);
    TestBed.configureTestingModule({
      providers: [
        LiteRealtimeService,
        { provide: API_BASE_URL, useValue: 'https://metro.example/api' },
        { provide: PLATFORM_ID, useValue: 'browser' },
      ],
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('settles and cleans up one-shot requests during destruction', async () => {
    const service = TestBed.inject(LiteRealtimeService);
    const result = service.fetchStopArrivalOnce('1234');

    service.ngOnDestroy();

    await expect(result).resolves.toBeNull();
    expect(socket.off).toHaveBeenCalledWith(
      'arrival_predictions',
      expect.any(Function),
    );
    expect(socket.disconnect).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(10_000);
    expect(socket.emit).toHaveBeenCalledWith('unsubscribe_stop', {
      stopCode: '1234',
    });
  });

  it('ignores malformed realtime payload entries without breaking later updates', () => {
    const service = TestBed.inject(LiteRealtimeService);
    service.subscribeToStop('1234');
    const arrivalListener = listeners.get('arrival_predictions');

    expect(() => arrivalListener?.(null)).not.toThrow();
    expect(() =>
      arrivalListener?.({
        data: {
          stopCode: '1234',
          p: {
            l: [
              null,
              { c: '100', lt0: 'Centro', vs: [null, { p: '42', t: '12:00' }] },
            ],
          },
        },
      }),
    ).not.toThrow();

    expect(service.stopArrivals().get('1234')?.p?.l).toEqual([
      expect.objectContaining({
        c: '100',
        vs: [expect.objectContaining({ p: 42, t: '12:00' })],
      }),
    ]);
  });
});
