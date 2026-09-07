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
      type: 'full',
      lineCode: 'L9',
      stationCode: 'HBR',
      trains: [],
      timestamp: 201,
      processing: true,
    });
    update?.({
      type: 'delta',
      lineCode: 'L9',
      stationCode: 'HBR',
      trains: [],
      timestamp: 200,
      processing: false,
    });

    expect(service.getStationData('L9', 'HBR')).toMatchObject({
      processing: false,
      dataReceived: true,
    });
  });

  it('shares one generic vehicle stream owner for L8 estimates', () => {
    const service = TestBed.inject(NextTrainWebsocketService);
    const firstRelease = service.subscribeToCptmVehicles('L8');
    const secondRelease = service.subscribeToCptmVehicles('L8');

    expect(socket.emit).toHaveBeenCalledTimes(1);
    expect(socket.emit).toHaveBeenCalledWith('subscribe_cptm_vehicles', {
      lineCode: 'L8',
    });

    listeners.get('cptm_vehicle_update')?.({
      type: 'full',
      lineCode: 'L8',
      vehicles: [
        {
          id: 'estimate-uuid',
          prefix: 'legacy-prefix',
          lat: -23.53,
          lng: -46.78,
          bearing: 0,
          wheelchair: false,
          climatized: false,
          lastUpdate: Date.now(),
          averageSpeed: 0,
          stopSequence: 0,
          estimated: true,
          validUntil: Date.now() + 20_000,
        },
      ],
      timestamp: 200,
    });

    expect(service.getCptmVehicles('L8')).toHaveLength(1);
    firstRelease();
    expect(socket.emit).not.toHaveBeenCalledWith('unsubscribe_cptm_vehicles', {
      lineCode: 'L8',
    });

    secondRelease();
    expect(socket.emit).toHaveBeenCalledWith('unsubscribe_cptm_vehicles', {
      lineCode: 'L8',
    });
    expect(service.getCptmVehicles('L8')).toHaveLength(0);
  });

  it('clears estimated rows on disconnect and accepts the next snapshot', () => {
    const service = TestBed.inject(NextTrainWebsocketService);
    service.subscribeToCptmVehicles('L8');
    const estimate = {
      id: 'estimate-uuid',
      prefix: '',
      lat: -23.53,
      lng: -46.78,
      bearing: 0,
      wheelchair: false,
      climatized: false,
      lastUpdate: Date.now(),
      averageSpeed: 0,
      stopSequence: 0,
      estimated: true,
      validUntil: Date.now() + 20_000,
    };
    const actual = {
      ...estimate,
      id: 'actual-id',
      prefix: 'actual',
      estimated: false,
    };

    listeners.get('cptm_vehicle_update')?.({
      type: 'full',
      lineCode: 'L8',
      vehicles: [actual, estimate],
      timestamp: 200,
    });
    expect(service.getCptmVehicles('L8')).toHaveLength(2);

    listeners.get('disconnect')?.();
    expect(service.getCptmVehicles('L8')).toEqual([actual]);

    listeners.get('connect')?.();
    listeners.get('cptm_vehicle_update')?.({
      type: 'full',
      lineCode: 'L8',
      vehicles: [],
      timestamp: 100,
    });
    expect(service.getCptmVehicles('L8')).toEqual([]);
  });

  it('keeps an empty snapshot over an older vehicle update', () => {
    const service = TestBed.inject(NextTrainWebsocketService);
    service.subscribeToCptmVehicles('L8');
    const update = listeners.get('cptm_vehicle_update');
    const estimate = {
      id: 'estimate-uuid',
      prefix: '',
      lat: -23.53,
      lng: -46.78,
      bearing: 0,
      wheelchair: false,
      climatized: false,
      lastUpdate: Date.now(),
      averageSpeed: 0,
      stopSequence: 0,
      estimated: true,
      validUntil: Date.now() + 20_000,
    };

    update?.({
      type: 'full',
      lineCode: 'L8',
      vehicles: [estimate],
      timestamp: 200,
    });
    update?.({
      type: 'delta',
      lineCode: 'L8',
      vehicles: [],
      timestamp: 201,
    });
    update?.({
      type: 'delta',
      lineCode: 'L8',
      vehicles: [estimate],
      timestamp: 200,
    });
    update?.({
      type: 'delta',
      lineCode: 'L8',
      vehicles: [estimate],
      timestamp: Number.NaN,
    });
    update?.({
      type: 'delta',
      lineCode: 'L8',
      vehicles: [estimate],
      timestamp: undefined,
    } as never);

    expect(service.getCptmVehicles('L8')).toEqual([]);
  });

  it('filters malformed vehicle rows while treating an empty snapshot as authoritative', () => {
    const service = TestBed.inject(NextTrainWebsocketService);
    service.subscribeToCptmVehicles('L8');
    const update = listeners.get('cptm_vehicle_update');
    const vehicle = {
      id: 'estimate-uuid',
      prefix: '',
      lat: -23.53,
      lng: -46.78,
      bearing: 0,
      wheelchair: false,
      climatized: false,
      lastUpdate: Date.now(),
      averageSpeed: 0,
      stopSequence: 0,
      estimated: true,
      validUntil: Date.now() + 20_000,
    };

    update?.({
      type: 'delta',
      lineCode: 'L8',
      vehicles: [vehicle, null, { ...vehicle, lat: Number.NaN }],
      timestamp: 200,
    });
    expect(service.getCptmVehicles('L8')).toEqual([vehicle]);

    update?.({
      type: 'delta',
      lineCode: 'L8',
      vehicles: [],
      timestamp: 201,
    });
    expect(service.getCptmVehicles('L8')).toEqual([]);

    update?.(null as never);
    expect(service.getCptmVehicles('L8')).toEqual([]);
  });
});
