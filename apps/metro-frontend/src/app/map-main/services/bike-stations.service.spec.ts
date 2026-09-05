import { TestBed } from '@angular/core/testing';
import { LoggerService } from '@metro/shared/api';
import { io } from 'socket.io-client';
import { BikeStationsService } from './bike-stations.service';

jest.mock('socket.io-client', () => ({ io: jest.fn() }));

describe('BikeStationsService', () => {
  const listeners = new Map<string, (...args: unknown[]) => void>();
  const socket = {
    connected: true,
    on: jest.fn((event: string, handler: (...args: unknown[]) => void) => {
      listeners.set(event, handler);
      return socket;
    }),
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
        BikeStationsService,
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
    TestBed.inject(BikeStationsService).ngOnDestroy();
    jest.useRealTimers();
  });

  it('backs off detail retries after a timeout and exposes the error state', () => {
    const service = TestBed.inject(BikeStationsService);
    service.upsertStationSummary({
      stationId: 'station-1',
      name: 'Estação 1',
      latitude: -23.55,
      longitude: -46.63,
      capacity: 20,
      effectiveCapacity: 20,
      numBikesAvailable: 5,
      electricBikesAvailable: 1,
    });

    service.ensureStationDetails('station-1');
    expect(socket.emit).toHaveBeenCalledWith('station_details_request', {
      stationId: 'station-1',
    });

    jest.advanceTimersByTime(10_000);
    expect(service.getStation('station-1')?.detailsError).toBe(true);

    service.ensureStationDetails('station-1');
    expect(
      socket.emit.mock.calls.filter(
        ([event]) => event === 'station_details_request',
      ),
    ).toHaveLength(1);

    jest.advanceTimersByTime(30_000);
    service.ensureStationDetails('station-1');
    expect(
      socket.emit.mock.calls.filter(
        ([event]) => event === 'station_details_request',
      ),
    ).toHaveLength(2);
  });

  it('clears a previous detail error after a successful response', () => {
    const service = TestBed.inject(BikeStationsService);
    service.upsertStationSummary({
      stationId: 'station-1',
      latitude: -23.55,
      longitude: -46.63,
      capacity: 20,
      effectiveCapacity: 20,
      numBikesAvailable: 5,
      electricBikesAvailable: 1,
    });
    service.ensureStationDetails('station-1');
    jest.advanceTimersByTime(10_000);

    listeners.get('station_details')?.({
      stationId: 'station-1',
      station: {
        stationId: 'station-1',
        latitude: -23.55,
        longitude: -46.63,
        capacity: 20,
        effectiveCapacity: 20,
        numBikesAvailable: 7,
        electricBikesAvailable: 2,
        numBikesDisabled: 0,
        numDocksDisabled: 0,
        isInstalled: true,
        vehicleAvailability: [],
      },
      lastUpdated: 100,
      fetchedAt: 100,
    });

    expect(service.getStation('station-1')).toEqual(
      expect.objectContaining({ detailsLoaded: true, detailsError: false }),
    );
  });
});
