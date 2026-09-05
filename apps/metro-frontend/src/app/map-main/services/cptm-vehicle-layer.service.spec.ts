import { signal, type WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { LoggerService } from '@metro/shared/api';
import {
  type TrackedRailLineCode,
  type TrackedRailVehicle,
} from '@metro/shared/utils';
import { NextTrainWebsocketService } from './next-train-websocket.service';
import { CptmVehicleLayerService } from './cptm-vehicle-layer.service';

describe('CptmVehicleLayerService', () => {
  let service: CptmVehicleLayerService;
  let vehicles: WritableSignal<
    Map<TrackedRailLineCode, TrackedRailVehicle[]>
  >;
  let connected: WritableSignal<boolean>;
  let subscribeToCptmVehicles: jest.Mock;
  let releases: jest.Mock[];

  const createVehicle = (
    overrides: Partial<TrackedRailVehicle> = {},
  ): TrackedRailVehicle => ({
    id: 'vehicle-uuid',
    prefix: 'legacy-prefix',
    lat: -23.53,
    lng: -46.78,
    bearing: 0,
    wheelchair: false,
    climatized: false,
    lastUpdate: Date.now(),
    averageSpeed: 0,
    stopSequence: 0,
    ...overrides,
  });

  const refreshMarkers = (): void => {
    (
      service as unknown as {
        updateVehicleMarkers: (
          value: Map<TrackedRailLineCode, TrackedRailVehicle[]>,
          isConnected: boolean,
        ) => void;
      }
    ).updateVehicleMarkers(vehicles(), connected());
  };

  const getFeatures = (): { get: (key: string) => unknown }[] =>
    service.getLayer()?.getSource()?.getFeatures() ?? [];

  beforeEach(() => {
    jest.useFakeTimers();
    releases = [];
    vehicles = signal<Map<TrackedRailLineCode, TrackedRailVehicle[]>>(
      new Map(),
    );
    connected = signal(true);
    subscribeToCptmVehicles = jest.fn(() => {
      const release = jest.fn();
      releases.push(release);
      return release;
    });

    TestBed.configureTestingModule({
      providers: [
        CptmVehicleLayerService,
        {
          provide: NextTrainWebsocketService,
          useValue: {
            cptmVehicles: vehicles.asReadonly(),
            connected: connected.asReadonly(),
            subscribeToCptmVehicles,
            unsubscribeFromCptmVehicles: jest.fn(),
          },
        },
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

    service = TestBed.inject(CptmVehicleLayerService);
  });

  afterEach(() => {
    service.ngOnDestroy();
    jest.useRealTimers();
  });

  it('owns one generic stream subscription per line and releases it once', () => {
    service.subscribeToLine('L8');
    service.subscribeToLine('L8');

    expect(subscribeToCptmVehicles).toHaveBeenCalledTimes(1);
    expect(subscribeToCptmVehicles).toHaveBeenCalledWith('L8');
    expect(service.isLineSubscribed('L8')).toBe(true);

    service.unsubscribeFromLine('L8');

    expect(releases).toHaveLength(1);
    expect(releases[0]).toHaveBeenCalledTimes(1);
    expect(service.isLineSubscribed('L8')).toBe(false);
  });

  it('renders estimated vehicles with an opaque identity and terminal direction', () => {
    service.subscribeToLine('L8');
    const estimate = createVehicle({
      id: 'estimate-uuid',
      estimated: true,
      validUntil: Date.now() + 20_000,
      bearing: 0,
      destination: 'Varginha',
      estimatedPositionDescription: 'entre Berrini e Morumbi',
    });
    vehicles.set(new Map([['L8', [estimate]]]));

    refreshMarkers();

    expect(getFeatures()).toHaveLength(1);
    expect(getFeatures()[0].get('vehicleId')).toBe('estimate-uuid');
    expect(getFeatures()[0].get('lineCode')).toBe('L8');
    expect(getFeatures()[0].get('destination')).toBe('Varginha');
    expect(getFeatures()[0].get('estimatedPositionDescription')).toBe(
      'entre Berrini e Morumbi',
    );
    expect(getFeatures()[0].get('estimatedPosition')).toBe(true);
  });

  it('renders the estimated terminal above its status label', () => {
    const styles = service['createVehicleStyle'](
      'L9',
      'Varginha',
      undefined,
      undefined,
      true,
    );

    expect(styles).toHaveLength(3);
  });

  it('removes line markers when its owned stream is released', () => {
    service.subscribeToLine('L8');
    vehicles.set(
      new Map([
        [
          'L8',
          [
            createVehicle({
              id: 'estimate-uuid',
              estimated: true,
              validUntil: Date.now() + 20_000,
            }),
          ],
        ],
      ]),
    );
    refreshMarkers();
    expect(getFeatures()).toHaveLength(1);

    service.unsubscribeFromLine('L8');

    expect(getFeatures()).toHaveLength(0);
  });

  it('keeps the measured direction style and omits it for estimates', () => {
    const actualStyles = service['createVehicleStyle'](
      'L10',
      'Rio Grande da Serra',
      0,
      1,
    );
    const estimatedStyles = service['createVehicleStyle'](
      'L9',
      undefined,
      0,
      1,
      true,
    );

    expect(actualStyles).toHaveLength(3);
    expect(estimatedStyles).toHaveLength(2);
  });

  it('hides invalid and expired estimates while preserving actual markers on disconnect', () => {
    service.subscribeToLine('L8');
    service.subscribeToLine('L10');
    const actual = createVehicle({ id: 'actual-uuid', prefix: 'actual' });
    const estimate = createVehicle({
      id: 'estimate-uuid',
      estimated: true,
      validUntil: Date.now() + 20_000,
    });
    vehicles.set(
      new Map([
        ['L10', [actual]],
        ['L8', [estimate]],
      ]),
    );

    refreshMarkers();
    expect(getFeatures()).toHaveLength(2);

    connected.set(false);
    refreshMarkers();
    expect(getFeatures()).toHaveLength(1);
    expect(getFeatures()[0].get('vehicleId')).toBe('actual');

    connected.set(true);
    vehicles.set(
      new Map([
        ['L10', [actual]],
        [
          'L8',
          [
            createVehicle({
              id: 'invalid',
              estimated: true,
              validUntil: Date.now() - 1,
              lat: Number.NaN,
            }),
          ],
        ],
      ]),
    );
    refreshMarkers();
    expect(getFeatures()).toHaveLength(1);
  });

  it('removes an estimate one millisecond after validUntil', () => {
    service.subscribeToLine('L8');
    const validUntil = Date.now() + 1_000;
    vehicles.set(
      new Map([
        [
          'L8',
          [createVehicle({ estimated: true, validUntil })],
        ],
      ]),
    );

    refreshMarkers();
    expect(getFeatures()).toHaveLength(1);
    jest.advanceTimersByTime(1_000);
    expect(getFeatures()).toHaveLength(1);
    jest.advanceTimersByTime(1);
    expect(getFeatures()).toHaveLength(0);
  });
});
