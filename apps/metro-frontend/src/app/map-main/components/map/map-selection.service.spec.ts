import { TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { of, throwError } from 'rxjs';
import { LoggerService } from '@metro/shared/api';
import { BikeStationsService } from '../../services/bike-stations.service';
import { CptmVehicleLayerService } from '../../services/cptm-vehicle-layer.service';
import { RealtimeWebsocketService } from '../../services/realtime-websocket.service';
import { VectorTileLayerService } from '../../services/vector-tile-layer.service';
import { GeographyCacheService } from '../../utils/geography-cache.service';
import { MapDataLoaderService } from './map-data-loader.service';
import { MapDisplayService } from './map-display.service';
import { MapSelectionService } from './map-selection.service';
import { MapStateService } from './map-state.service';

describe('MapSelectionService', () => {
  let service: MapSelectionService;
  let mapState: MapStateService;
  let cache: { getRoute: jest.Mock; getStop: jest.Mock };
  let dataLoader: {
    syncVectorTileFilters: jest.Mock;
    loadRouteData: jest.Mock;
    loadStopData: jest.Mock;
    removeRouteDisplayData: jest.Mock;
  };
  let logger: {
    debug: jest.Mock;
    info: jest.Mock;
    warn: jest.Mock;
    error: jest.Mock;
  };
  let snackBar: { open: jest.Mock };

  beforeEach(() => {
    cache = {
      getRoute: jest.fn(() => of(null)),
      getStop: jest.fn(() => of(null)),
    };
    dataLoader = {
      syncVectorTileFilters: jest.fn(),
      loadRouteData: jest.fn(() => Promise.resolve()),
      loadStopData: jest.fn(() => Promise.resolve()),
      removeRouteDisplayData: jest.fn(),
    };
    logger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };
    snackBar = { open: jest.fn() };

    TestBed.configureTestingModule({
      providers: [
        MapSelectionService,
        MapStateService,
        { provide: GeographyCacheService, useValue: cache },
        { provide: MapDataLoaderService, useValue: dataLoader },
        {
          provide: MapDisplayService,
          useValue: {
            clearSelection: jest.fn(),
            updateMapDisplay: jest.fn(),
          },
        },
        { provide: LoggerService, useValue: logger },
        { provide: MatSnackBar, useValue: snackBar },
        {
          provide: BikeStationsService,
          useValue: { getStation: jest.fn(), stations: jest.fn(() => []) },
        },
        {
          provide: RealtimeWebsocketService,
          useValue: {
            subscribeToRoute: jest.fn(),
            unsubscribeFromRoute: jest.fn(),
            unsubscribeFromStop: jest.fn(),
          },
        },
        {
          provide: CptmVehicleLayerService,
          useValue: {
            subscribeToLine: jest.fn(),
            unsubscribeFromLine: jest.fn(),
          },
        },
        {
          provide: VectorTileLayerService,
          useValue: { setLayerVisibility: jest.fn() },
        },
      ],
    });

    service = TestBed.inject(MapSelectionService);
    mapState = TestBed.inject(MapStateService);
  });

  it('handles a failed route lookup without selecting or loading the route', async () => {
    const error = new Error('request timed out');
    cache.getRoute.mockReturnValue(throwError(() => error));

    await expect(
      service.addRouteToSelection('route-1', true),
    ).resolves.toBeUndefined();

    expect(logger.error).toHaveBeenCalledWith(
      'Failed to load route selection',
      error,
    );
    expect(snackBar.open).toHaveBeenCalledWith(
      'Não foi possível carregar a rota',
      'Fechar',
      { duration: 3000 },
    );
    expect(mapState.selectedRoutes().size).toBe(0);
    expect(dataLoader.loadRouteData).not.toHaveBeenCalled();
  });

  it('keeps background stop lookup failures silent', async () => {
    const error = new Error('request timed out');
    cache.getStop.mockReturnValue(throwError(() => error));

    await expect(
      service.addStopToSelection('stop-1', false),
    ).resolves.toBeUndefined();

    expect(logger.error).toHaveBeenCalledWith(
      'Failed to load stop selection',
      error,
    );
    expect(snackBar.open).not.toHaveBeenCalled();
    expect(mapState.selectedStops().size).toBe(0);
    expect(dataLoader.loadStopData).not.toHaveBeenCalled();
  });

  it('reports missing selections in Brazilian Portuguese', async () => {
    await service.addRouteToSelection('missing-route', true);
    await service.addStopToSelection('missing-stop', true);

    expect(snackBar.open).toHaveBeenNthCalledWith(
      1,
      'Rota não encontrada',
      'Fechar',
      { duration: 2000 },
    );
    expect(snackBar.open).toHaveBeenNthCalledWith(
      2,
      'Parada não encontrada',
      'Fechar',
      { duration: 2000 },
    );
  });

  it('publishes a route tile filter before starting its full-data request', async () => {
    cache.getRoute.mockReturnValue(
      of({
        routeId: 'route-1',
        shortName: '100',
        longName: 'Route 1',
        color: '112233',
        textColor: 'FFFFFF',
      }),
    );

    await service.addRouteToSelection('route-1', false);

    expect(dataLoader.syncVectorTileFilters).toHaveBeenCalledTimes(1);
    expect(dataLoader.loadRouteData).toHaveBeenCalledWith('route-1', false);
    expect(
      dataLoader.syncVectorTileFilters.mock.invocationCallOrder[0],
    ).toBeLessThan(dataLoader.loadRouteData.mock.invocationCallOrder[0]);
    expect(mapState.selectedRoutes().has('route-1')).toBe(true);
    expect(snackBar.open).not.toHaveBeenCalled();
  });

  it('publishes a stop tile filter before starting its full-data request', async () => {
    cache.getStop.mockReturnValue(
      of({
        stopId: 'stop-1',
        name: 'Stop 1',
        latitude: -23.55,
        longitude: -46.63,
        isSubwayStation: false,
      }),
    );

    await service.addStopToSelection('stop-1', false);

    expect(dataLoader.syncVectorTileFilters).toHaveBeenCalledTimes(1);
    expect(dataLoader.loadStopData).toHaveBeenCalledWith('stop-1', false);
    expect(
      dataLoader.syncVectorTileFilters.mock.invocationCallOrder[0],
    ).toBeLessThan(dataLoader.loadStopData.mock.invocationCallOrder[0]);
    expect(mapState.selectedStops().has('stop-1')).toBe(true);
    expect(snackBar.open).not.toHaveBeenCalled();
  });

  it('subscribes and releases estimated rail markers for a selected L8 line', () => {
    service.addRailLineToSelection('L8', false);

    expect(
      TestBed.inject(CptmVehicleLayerService).subscribeToLine,
    ).toHaveBeenCalledWith('L8');
    expect(mapState.selectedRoutes().has('L8')).toBe(true);

    service.removeRouteFromSelection('L8');

    expect(
      TestBed.inject(CptmVehicleLayerService).unsubscribeFromLine,
    ).toHaveBeenCalledWith('L8');
  });
});
