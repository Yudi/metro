import { TestBed } from '@angular/core/testing';
import { LoggerService } from '@metro/shared/api';
import { io } from 'socket.io-client';
import { NextTrainWebsocketService } from './next-train-websocket.service';

jest.mock('socket.io-client', () => ({ io: jest.fn() }));

describe('NextTrainWebsocketService', () => {
  const listeners = new Map<string, (...args: unknown[]) => void>();
  const socket = {
    connected: true,
    on: jest.fn((event: string, handler: (...args: unknown[]) => void) => {
      listeners.set(event, handler);
      return socket;
    }),
    emit: jest.fn(),
    disconnect: jest.fn(),
    connect: jest.fn(),
  };

  beforeEach(() => {
    listeners.clear();
    jest.clearAllMocks();
    (io as jest.Mock).mockReturnValue(socket);
    TestBed.configureTestingModule({
      providers: [
        NextTrainWebsocketService,
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
    TestBed.inject(NextTrainWebsocketService).ngOnDestroy();
  });

  it('keeps station data and the upstream subscription for remaining owners', () => {
    const service = TestBed.inject(NextTrainWebsocketService);
    const firstRelease = service.subscribe('L9', 'HBR');
    const secondRelease = service.subscribe('L9', 'HBR');

    expect(socket.emit).toHaveBeenCalledTimes(1);
    expect(socket.emit).toHaveBeenCalledWith('subscribe_station', {
      lineCode: 'L9',
      stationCode: 'HBR',
    });

    const updateListener = listeners.get('next_train_update');
    updateListener?.({
      type: 'full',
      lineCode: 'L9',
      stationCode: 'HBR',
      trains: [],
      timestamp: 200,
    });

    firstRelease();
    expect(service.getStationData('L9', 'HBR')).not.toBeNull();
    expect(socket.emit).not.toHaveBeenCalledWith('unsubscribe_station', {
      lineCode: 'L9',
      stationCode: 'HBR',
    });

    secondRelease();
    expect(service.getStationData('L9', 'HBR')).toBeNull();
    expect(socket.emit).toHaveBeenCalledWith('unsubscribe_station', {
      lineCode: 'L9',
      stationCode: 'HBR',
    });
  });

  it('ignores an older update for the same station key', () => {
    const service = TestBed.inject(NextTrainWebsocketService);
    service.subscribe('L9', 'HBR');
    const updateListener = listeners.get('next_train_update');

    updateListener?.({
      type: 'delta',
      lineCode: 'L9',
      stationCode: 'HBR',
      trains: [
        {
          destinationCode: 'VAG',
          destinationName: 'Varginha',
          trainCurrentStationName: 'Pinheiros',
          arrivalTime: '12:00',
          isAtPlatform: false,
          isTrainStopped: false,
        },
      ],
      timestamp: 200,
    });
    updateListener?.({
      type: 'delta',
      lineCode: 'L9',
      stationCode: 'HBR',
      trains: [],
      timestamp: 100,
    });

    expect(service.getStationData('L9', 'HBR')?.trains).toHaveLength(1);
    expect(service.lastUpdate()).toBe(200);
  });

  it('accepts the completed poll that began before its processing placeholder', () => {
    const service = TestBed.inject(NextTrainWebsocketService);
    service.subscribe('L9', 'HBR');
    const update = listeners.get('next_train_update');

    update?.({
      type: 'full', lineCode: 'L9', stationCode: 'HBR',
      trains: [], timestamp: 201, processing: true,
    });
    update?.({
      type: 'delta', lineCode: 'L9', stationCode: 'HBR',
      trains: [], timestamp: 200, processing: false,
    });

    expect(service.getStationData('L9', 'HBR')).toMatchObject({
      processing: false, dataReceived: true,
    });
  });
});
