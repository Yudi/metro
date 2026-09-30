import { TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { LoggerService } from '@metro/shared/api';
import { Observable, Subject, throwError } from 'rxjs';
import type {
  BusRouteGraphQL,
  BusStopGraphQL,
  RouteFullDataGraphQL,
  StopFullDataSnapshot,
} from '../../geography/geography-graphql.service';
import { GeographyGraphQLService } from '../../geography/geography-graphql.service';
import { VectorTileLayerService } from './vector-tiles/vector-tile-layer.service';
import { MapDataLoaderService } from './map-data-loader.service';
import { MapStateService } from './map-state.service';

const stop: BusStopGraphQL = {
  id: 'stop-1',
  stopId: 'stop-1',
  name: 'Praça da Sé',
  latitude: -23.5505,
  longitude: -46.6333,
  isSubwayStation: false,
};

function route(routeId: string): BusRouteGraphQL {
  return {
    id: routeId,
    routeId,
    shortName: routeId,
    longName: `Linha ${routeId}`,
    color: '112233',
    textColor: 'FFFFFF',
  };
}

describe('MapDataLoaderService', () => {
  let service: MapDataLoaderService;
  let geographyService: {
    getRouteFullData: jest.Mock;
    watchStopFullData: jest.Mock;
  };
  let logger: { debug: jest.Mock; error: jest.Mock; warn: jest.Mock };
  let snackBar: { open: jest.Mock };
  let mapState: MapStateService;
  let vectorTileLayer: {
    setBusRouteIds: jest.Mock;
    setBusStopFilter: jest.Mock;
  };

  beforeEach(() => {
    const error = new Error('request timed out');
    geographyService = {
      getRouteFullData: jest.fn(() => throwError(() => error)),
      watchStopFullData: jest.fn(() => throwError(() => error)),
    };
    logger = {
      debug: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
    };
    snackBar = { open: jest.fn() };
    vectorTileLayer = {
      setBusRouteIds: jest.fn(),
      setBusStopFilter: jest.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        MapDataLoaderService,
        MapStateService,
        { provide: GeographyGraphQLService, useValue: geographyService },
        { provide: VectorTileLayerService, useValue: vectorTileLayer },
        { provide: MatSnackBar, useValue: snackBar },
        { provide: LoggerService, useValue: logger },
      ],
    });

    service = TestBed.inject(MapDataLoaderService);
    mapState = TestBed.inject(MapStateService);
  });

  it('reports a failed route-data request in Brazilian Portuguese', async () => {
    await service.loadRouteData('route-1');

    expect(logger.error).toHaveBeenCalledWith(
      'Error loading route data',
      expect.any(Error),
    );
    expect(snackBar.open).toHaveBeenCalledWith(
      'Não foi possível carregar os dados da rota',
      'Fechar',
      { duration: 3000 },
    );
  });

  it('shows the stop from the initial response while deferred routes are pending', async () => {
    const updates = new Subject<StopFullDataSnapshot>();
    geographyService.watchStopFullData.mockReturnValue(updates.asObservable());

    const resultPromise = service.loadStopData(stop.stopId, false);
    updates.next({ stop, hasNext: true });

    await expect(resultPromise).resolves.toEqual({ status: 'loaded', stop });
    expect(mapState.displayedStops()).toEqual([stop]);
    expect(mapState.displayedRoutes()).toEqual([]);
    expect(mapState.isLoading()).toBe(true);
  });

  it('adds a deferred route batch once and clears loading on completion', async () => {
    const updates = new Subject<StopFullDataSnapshot>();
    geographyService.watchStopFullData.mockReturnValue(updates.asObservable());
    const displayUpdates = jest.fn();
    mapState.setUpdateDisplayCallback(displayUpdates);

    const resultPromise = service.loadStopData(stop.stopId, false);
    updates.next({ stop, hasNext: true });
    await resultPromise;

    const routeData: RouteFullDataGraphQL[] = [
      { route: route('100') },
      { route: route('101') },
      { route: route('102') },
    ];
    updates.next({ stop, routes: routeData, hasNext: true });

    expect(mapState.displayedRoutes()).toEqual(
      routeData.map(({ route }) => route),
    );
    expect(mapState.routesDerivedFromStops()).toEqual(
      new Set(['100', '101', '102']),
    );
    expect(displayUpdates).toHaveBeenCalledTimes(2);
    expect(vectorTileLayer.setBusRouteIds).toHaveBeenCalledTimes(1);
    expect(mapState.isLoading()).toBe(true);

    updates.next({ stop, routes: routeData, hasNext: false });

    expect(mapState.displayedRoutes()).toEqual(
      routeData.map(({ route }) => route),
    );
    expect(displayUpdates).toHaveBeenCalledTimes(2);
    expect(vectorTileLayer.setBusRouteIds).toHaveBeenCalledTimes(1);
    expect(mapState.isLoading()).toBe(false);
    expect(snackBar.open).not.toHaveBeenCalled();
  });

  it('keeps the initial stop when deferred route delivery fails', async () => {
    const updates = new Subject<StopFullDataSnapshot>();
    geographyService.watchStopFullData.mockReturnValue(updates.asObservable());

    const resultPromise = service.loadStopData(stop.stopId);
    updates.next({ stop, hasNext: true });
    await expect(resultPromise).resolves.toEqual({ status: 'loaded', stop });

    updates.error(new Error('route patch failed'));

    expect(mapState.displayedStops()).toEqual([stop]);
    expect(mapState.isLoading()).toBe(false);
    expect(logger.error).toHaveBeenCalledWith(
      'Error loading stop data',
      expect.any(Error),
    );
    expect(snackBar.open).toHaveBeenCalledWith(
      'Não foi possível carregar os dados da parada',
      'Fechar',
      { duration: 3000 },
    );
  });

  it('cancels a stop stream on deselection and ignores late route data', async () => {
    const updates = new Subject<StopFullDataSnapshot>();
    const canonicalStop = {
      ...stop,
      id: 'canonical-stop',
      stopId: 'canonical-stop',
    };
    const teardown = jest.fn();
    const source = new Observable<StopFullDataSnapshot>((subscriber) => {
      const inner = updates.subscribe(subscriber);
      return () => {
        teardown();
        inner.unsubscribe();
      };
    });
    geographyService.watchStopFullData.mockReturnValue(source);

    const resultPromise = service.loadStopData('stop-alias', false);
    updates.next({ stop: canonicalStop, hasNext: true });
    await resultPromise;

    service.removeStopDisplayData(canonicalStop.stopId);
    updates.next({
      stop: canonicalStop,
      routes: [{ route: route('100') }],
      hasNext: false,
    });

    expect(teardown).toHaveBeenCalledTimes(1);
    expect(mapState.displayedStops()).toEqual([]);
    expect(mapState.displayedRoutes()).toEqual([]);
    expect(mapState.isLoading()).toBe(false);
  });

  it('resolves a cancelled request without reporting a missing stop', async () => {
    const updates = new Subject<StopFullDataSnapshot>();
    geographyService.watchStopFullData.mockReturnValue(updates.asObservable());

    const resultPromise = service.loadStopData(stop.stopId);
    service.cancelStopDataLoads();

    await expect(resultPromise).resolves.toEqual({ status: 'cancelled' });
    expect(logger.warn).not.toHaveBeenCalledWith('Stop not found', {
      stopId: stop.stopId,
    });
    expect(snackBar.open).not.toHaveBeenCalled();
    expect(mapState.isLoading()).toBe(false);
  });

  it('keeps a background stop-data failure silent', async () => {
    const error = new Error('request timed out');

    await expect(service.loadStopData('stop-1', false)).resolves.toEqual({
      status: 'error',
      error,
    });

    expect(logger.error).toHaveBeenCalledWith('Error loading stop data', error);
    expect(snackBar.open).not.toHaveBeenCalled();
    expect(mapState.isLoading()).toBe(false);
  });
});
