import { TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { of, Subject, throwError } from 'rxjs';
import { encodeBusDirectionFavorite } from '@metro/shared/utils';
import { LoggerService } from '@metro/shared/api';
import { BikeStationsService } from '../../geography/bike-stations.service';
import { CptmVehicleLayerService } from '../../realtime/cptm-vehicle-layer.service';
import { RealtimeWebsocketService } from '../../realtime/realtime-websocket.service';
import { VectorTileLayerService } from './vector-tiles/vector-tile-layer.service';
import { GeographyCacheService } from '../../geography/geography-cache.service';
import { GeographyGraphQLService } from '../../geography/geography-graphql.service';
import type { BusRouteGraphQL } from '../../geography/geography-graphql.service';
import { MapDataLoaderService } from './map-data-loader.service';
import type { StopDataLoadResult } from './map-data-loader.service';
import { MapDisplayService } from './map-display.service';
import { MapSelectionService } from './map-selection.service';
import { MapStateService } from './map-state.service';

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((complete) => { resolve = complete; });
  return { promise, resolve };
}

function createBusDirection(
  favoriteCode: string,
  directionId: number,
  destination: string,
): BusRouteGraphQL {
  return {
    id: 'gtfs:100',
    routeId: 'gtfs:100',
    favoriteCode,
    directionId,
    destination,
    shortName: '100',
    longName: 'Terminal A - Terminal B',
    color: '112233',
    textColor: 'FFFFFF',
    sourceAgency: 'sptrans',
  };
}

describe('MapSelectionService', () => {
  let service: MapSelectionService;
  let mapState: MapStateService;
  let cache: { getRoute: jest.Mock };
  let geography: {
    getBusRouteDirections: jest.Mock;
    getRouteFocusCoordinates: jest.Mock;
    getRailLineFocusCoordinates: jest.Mock;
  };
  let dataLoader: {
    syncVectorTileFilters: jest.Mock;
    loadRouteData: jest.Mock;
    loadStopData: jest.Mock;
    removeRouteDisplayData: jest.Mock;
    removeStopDisplayData: jest.Mock;
    cancelStopDataLoad: jest.Mock;
    cancelStopDataLoads: jest.Mock;
    cancelPendingLoads: jest.Mock;
  };
  let logger: {
    debug: jest.Mock;
    info: jest.Mock;
    warn: jest.Mock;
    error: jest.Mock;
  };
  let snackBar: { open: jest.Mock };
  let focus: {
    point: jest.Mock;
    coordinates: jest.Mock;
    isCurrent: jest.Mock;
    cancel: jest.Mock;
  };

  beforeEach(() => {
    focus = {
      point: jest.fn(),
      coordinates: jest.fn(),
      isCurrent: jest.fn(() => true),
      cancel: jest.fn(() => focus.isCurrent.mockReturnValue(false)),
    };
    cache = {
      getRoute: jest.fn(() => of(null)),
    };
    geography = {
      getBusRouteDirections: jest.fn(() => of([])),
      getRouteFocusCoordinates: jest.fn(() => of([])),
      getRailLineFocusCoordinates: jest.fn(() => of([])),
    };
    dataLoader = {
      syncVectorTileFilters: jest.fn(),
      loadRouteData: jest.fn(() => Promise.resolve()),
      loadStopData: jest.fn(() =>
        Promise.resolve({ status: 'not-found' as const }),
      ),
      removeRouteDisplayData: jest.fn(),
      removeStopDisplayData: jest.fn(),
      cancelStopDataLoad: jest.fn(),
      cancelStopDataLoads: jest.fn(),
      cancelPendingLoads: jest.fn(),
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
        { provide: GeographyGraphQLService, useValue: geography },
        { provide: MapDataLoaderService, useValue: dataLoader },
        {
          provide: MapDisplayService,
          useValue: {
            createFocusRequest: jest.fn(() => focus),
            centerOn: jest.fn(),
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

  it('uses server bounds even when cached route geometry is available', async () => {
    const route = {
      ...createBusDirection('gtfs:100', 0, 'Terminal B'),
      geometry: { type: 'LineString', coordinates: [[-46.6, -23.5], [-46.7, -23.6]] },
    };
    cache.getRoute.mockReturnValue(of(route));

    await service.addRouteToSelection(route.routeId, true);

    expect(focus.coordinates).toHaveBeenCalledWith([]);
    expect(geography.getRouteFocusCoordinates).toHaveBeenCalledWith('gtfs:100');
  });

  it('focuses a rail link using all line stations without resetting the city view', () => {
    const points = [[-46.6, -23.5], [-46.7, -23.6]];
    geography.getRailLineFocusCoordinates.mockReturnValue(of(points));

    service.focusRouteOnMap('L1', true);

    expect(geography.getRailLineFocusCoordinates).toHaveBeenCalledWith('L1');
    expect(focus.coordinates).toHaveBeenCalledWith(points);
    expect(TestBed.inject(MapDisplayService).centerOn).not.toHaveBeenCalled();
  });

  it('focuses a bus link using complete geometry without waiting for visible tiles', () => {
    const points = [[-46.6, -23.5], [-46.7, -23.6]];
    geography.getRouteFocusCoordinates.mockReturnValue(of(points));

    service.focusRouteOnMap('gtfs:100', false);

    expect(geography.getRouteFocusCoordinates).toHaveBeenCalledWith('gtfs:100');
    expect(focus.coordinates).toHaveBeenCalledWith(points);
  });

  it('cancels route-link focus when the route is removed before geometry arrives', () => {
    const geometry = new Subject<[number, number][]>();
    geography.getRouteFocusCoordinates.mockReturnValue(geometry.asObservable());
    mapState.addRouteToSelection({ id: 'route-a', shortName: '100', longName: 'Route A' });
    service.focusRouteOnMap('route-a', false);

    service.removeRouteFromSelection('route-a');
    geometry.next([[-46.6, -23.5], [-46.7, -23.6]]);

    expect(focus.cancel).toHaveBeenCalledTimes(1);
    expect(focus.coordinates).not.toHaveBeenCalled();
  });

  it('does not cancel another route focus when removing an older selection', () => {
    const geometry = new Subject<[number, number][]>();
    geography.getRouteFocusCoordinates.mockReturnValue(geometry.asObservable());
    mapState.addRouteToSelection({ id: 'route-a', shortName: '100', longName: 'Route A' });
    mapState.addRouteToSelection({ id: 'route-b', shortName: '200', longName: 'Route B' });
    service.focusRouteOnMap('route-b', false);

    service.removeRouteFromSelection('route-a');
    const points: [number, number][] = [[-46.6, -23.5], [-46.7, -23.6]];
    geometry.next(points);

    expect(focus.cancel).not.toHaveBeenCalled();
    expect(focus.coordinates).toHaveBeenCalledWith(points);
  });

  it('cancels focus already queued for a removed selection', async () => {
    const route = {
      ...createBusDirection('gtfs:100', 0, 'Terminal B'),
      geometry: { type: 'LineString', coordinates: [[-46.6, -23.5], [-46.7, -23.6]] },
    };
    cache.getRoute.mockReturnValue(of(route));
    await service.addRouteToSelection(route.routeId, true);
    expect(focus.coordinates).toHaveBeenCalled();

    service.removeRouteFromSelection(route.routeId);

    expect(focus.cancel).toHaveBeenCalledTimes(1);
  });

  it.each(['older-first', 'newer-first'])('focuses the latest stop alias when loads complete %s', async (order) => {
    const older = deferred<StopDataLoadResult>();
    const newer = deferred<StopDataLoadResult>();
    dataLoader.loadStopData
      .mockReturnValueOnce(older.promise)
      .mockReturnValueOnce(newer.promise);
    let generation = 0;
    const acceptedFocus = jest.fn();
    jest.mocked(TestBed.inject(MapDisplayService).createFocusRequest).mockImplementation(() => {
      const requestGeneration = ++generation;
      const isCurrent = () => requestGeneration === generation;
      return {
        isCurrent,
        cancel: () => { if (isCurrent()) generation++; },
        point: (coordinates) => { if (isCurrent()) acceptedFocus(coordinates); },
        coordinates: () => undefined,
      };
    });
    const firstSelection = service.addStopToSelection('alias-a');
    const secondSelection = service.addStopToSelection('alias-b');
    const result: StopDataLoadResult = {
      status: 'loaded',
      stop: {
        id: 'canonical', stopId: 'canonical', name: 'Stop',
        latitude: -23.5, longitude: -46.6, isSubwayStation: false,
      },
    };

    if (order === 'older-first') {
      older.resolve(result);
      await firstSelection;
      newer.resolve(result);
      await secondSelection;
    } else {
      newer.resolve(result);
      await secondSelection;
      older.resolve(result);
      await firstSelection;
    }

    expect(mapState.selectedStops().size).toBe(1);
    expect(acceptedFocus).toHaveBeenCalledTimes(1);
    expect(acceptedFocus).toHaveBeenCalledWith([-46.6, -23.5]);
  });

  it('cancels queued stop focus when its canonical selection is removed', async () => {
    dataLoader.loadStopData.mockResolvedValue({
      status: 'loaded',
      stop: {
        id: 'canonical', stopId: 'canonical', name: 'Stop',
        latitude: -23.5, longitude: -46.6, isSubwayStation: false,
      },
    });
    await service.addStopToSelection('alias-a');

    service.removeStopFromSelection('canonical');

    expect(focus.cancel).toHaveBeenCalledTimes(1);
    expect(mapState.selectedStops().size).toBe(0);
  });

  it('restores a saved selection without requesting camera movement', async () => {
    const route = createBusDirection('gtfs:100', 0, 'Terminal B');
    cache.getRoute.mockReturnValue(of(route));

    await service.addRouteToSelection(route.routeId, false);

    expect(TestBed.inject(MapDisplayService).createFocusRequest).not.toHaveBeenCalled();
    expect(focus.coordinates).not.toHaveBeenCalled();
  });

  it('still adds a route after a gesture, without requesting late camera geometry', async () => {
    const route = createBusDirection('gtfs:100', 0, 'Terminal B');
    cache.getRoute.mockReturnValue(of(route));
    focus.isCurrent.mockReturnValue(false);

    await service.addRouteToSelection(route.routeId, true);

    expect(mapState.selectedRoutes().has(route.favoriteCode ?? route.routeId)).toBe(true);
    expect(geography.getRouteFocusCoordinates).not.toHaveBeenCalled();
  });

  it('does not add a second selection when a feed update slightly moves the same saved direction', async () => {
    const snapshot = {
      sourceAgency: 'sptrans', shortName: '001',
      originLatitude: -23.5, originLongitude: -46.6,
      viaLatitude: -23.51, viaLongitude: -46.61,
      destinationLatitude: -23.53, destinationLongitude: -46.63,
    };
    const saved = encodeBusDirectionFavorite(snapshot);
    const fresh = encodeBusDirectionFavorite({ ...snapshot, originLatitude: -23.5002 });
    if (!saved || !fresh) throw new Error('Invalid fixtures');
    mapState.addRouteToSelection({ id: saved, routeId: 'old-id', shortName: '001', longName: 'Old name' });
    cache.getRoute.mockReturnValue(of({ routeId: 'new-id', favoriteCode: fresh, shortName: '001', longName: 'New name' }));
    await service.addRouteToSelection(fresh, false);
    expect([...mapState.selectedRoutes().keys()]).toEqual([saved]);
    expect(dataLoader.loadRouteData).not.toHaveBeenCalled();
  });

  it('cancels focus using the existing direction key after a feed identity changes', async () => {
    const identity = {
      sourceAgency: 'sptrans', shortName: '001',
      originLatitude: -23.5, originLongitude: -46.6,
      viaLatitude: -23.51, viaLongitude: -46.61,
      destinationLatitude: -23.53, destinationLongitude: -46.63,
    };
    const saved = encodeBusDirectionFavorite(identity);
    const fresh = encodeBusDirectionFavorite({ ...identity, originLatitude: -23.5002 });
    if (!saved || !fresh) throw new Error('Invalid fixtures');
    mapState.addRouteToSelection({
      id: saved, routeId: 'old-id', shortName: '001', longName: 'Old direction',
    });
    cache.getRoute.mockReturnValue(of({
      ...createBusDirection(fresh, 0, 'Terminal B'),
      shortName: '001',
      geometry: { type: 'LineString', coordinates: [[-46.6, -23.5], [-46.63, -23.53]] },
    }));

    await service.addRouteToSelection(fresh, true);
    service.removeRouteFromSelection(saved);

    expect(focus.coordinates).toHaveBeenCalled();
    expect(focus.cancel).toHaveBeenCalledTimes(1);
    expect(mapState.selectedRoutes().size).toBe(0);
  });

  it('does not restore a whole-line selection after its pending lookup was replaced', async () => {
    const updates = new Subject<unknown>();
    cache.getRoute.mockReturnValue(updates.asObservable());
    const pending = service.addRouteToSelection('pending-line', false);
    service.removeRouteFromSelection('pending-line', false);
    updates.next({ routeId: 'feed-id', favoriteCode: 'pending-line', shortName: '001', longName: 'A - B' });
    await pending;
    expect(mapState.selectedRoutes().size).toBe(0);
    expect(dataLoader.loadRouteData).not.toHaveBeenCalled();
    expect(snackBar.open).not.toHaveBeenCalled();
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

  it('keeps background stop-data failures silent', async () => {
    const error = new Error('request timed out');
    dataLoader.loadStopData.mockResolvedValue({ status: 'error', error });

    await expect(
      service.addStopToSelection('stop-1', false),
    ).resolves.toBeUndefined();

    expect(snackBar.open).not.toHaveBeenCalled();
    expect(mapState.selectedStops().size).toBe(0);
    expect(dataLoader.loadStopData).toHaveBeenCalledWith(
      'stop-1',
      false,
      undefined,
      expect.any(Function),
    );
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

  it('adds the route selection before starting its full-data request', async () => {
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

    expect(dataLoader.loadRouteData).toHaveBeenCalledWith('route-1', false);
    expect(mapState.selectedRoutes().has('route-1')).toBe(true);
    expect(snackBar.open).not.toHaveBeenCalled();
  });

  it('keeps two directions of one feed route as separate selections', async () => {
    const outboundCode =
      'bus:v1:sptrans:100:-23.5000~-46.6000:-23.5100~-46.6100:-23.5200~-46.6200';
    const inboundCode =
      'bus:v1:sptrans:100:-23.5200~-46.6200:-23.5150~-46.6100:-23.5000~-46.6000';
    cache.getRoute.mockImplementation((favoriteCode: string) =>
      of({
        id: 'gtfs:100',
        routeId: 'gtfs:100',
        favoriteCode,
        directionId: favoriteCode === outboundCode ? 0 : 1,
        destination: favoriteCode === outboundCode ? 'Centro' : 'Bairro',
        shortName: '100',
        longName: 'Terminal A - Terminal B',
        color: '112233',
        textColor: 'FFFFFF',
        sourceAgency: 'sptrans',
        supportsRealtime: true,
      }),
    );

    await service.addRouteToSelection(outboundCode, false);
    await service.addRouteToSelection(inboundCode, false);

    expect(Array.from(mapState.selectedRoutes().keys())).toEqual([
      outboundCode,
      inboundCode,
    ]);
    expect(mapState.selectedRoutes().get(outboundCode)).toMatchObject({
      id: outboundCode,
      routeId: 'gtfs:100',
      destination: 'Centro',
      directionId: 0,
    });
    expect(mapState.selectedRoutes().get(inboundCode)).toMatchObject({
      id: inboundCode,
      routeId: 'gtfs:100',
      destination: 'Bairro',
      directionId: 1,
    });
    expect(dataLoader.loadRouteData).toHaveBeenNthCalledWith(
      1,
      outboundCode,
      false,
    );
    expect(dataLoader.loadRouteData).toHaveBeenNthCalledWith(
      2,
      inboundCode,
      false,
    );
  });

  it('adds the unique reverse-endpoint direction once for repeated clicks', async () => {
    const outboundCode = encodeBusDirectionFavorite({
      sourceAgency: 'sptrans',
      shortName: '100',
      originLatitude: -23.5,
      originLongitude: -46.6,
      viaLatitude: -23.51,
      viaLongitude: -46.61,
      destinationLatitude: -23.52,
      destinationLongitude: -46.62,
    });
    const inboundCode = encodeBusDirectionFavorite({
      sourceAgency: 'sptrans',
      shortName: '100',
      originLatitude: -23.52,
      originLongitude: -46.62,
      viaLatitude: -23.515,
      viaLongitude: -46.61,
      destinationLatitude: -23.5,
      destinationLongitude: -46.6,
    });
    if (!outboundCode || !inboundCode) throw new Error('Invalid fixtures');

    mapState.addRouteToSelection({
      id: outboundCode,
      routeId: 'gtfs:100',
      shortName: '100',
      longName: 'Terminal A - Terminal B',
      destination: 'Terminal B',
      directionId: 0,
    });
    geography.getBusRouteDirections.mockReturnValue(
      of([
        createBusDirection(outboundCode, 0, 'Terminal B'),
        createBusDirection(inboundCode, 1, 'Terminal A'),
      ]),
    );
    cache.getRoute.mockImplementation((favoriteCode: string) =>
      of({
        routeId: 'gtfs:100',
        favoriteCode,
        directionId: 1,
        destination: 'Terminal A',
        shortName: '100',
        longName: 'Terminal B - Terminal A',
        sourceAgency: 'sptrans',
        supportsRealtime: true,
      }),
    );

    const firstClick = service.addOppositeDirectionToSelection(outboundCode);
    const repeatedClick = service.addOppositeDirectionToSelection(outboundCode);
    await Promise.all([firstClick, repeatedClick]);
    await service.addOppositeDirectionToSelection(outboundCode);

    expect(geography.getBusRouteDirections).toHaveBeenCalledTimes(2);
    expect(geography.getBusRouteDirections).toHaveBeenCalledWith(['gtfs:100']);
    expect(cache.getRoute).toHaveBeenCalledWith(inboundCode);
    expect(cache.getRoute).toHaveBeenCalledTimes(2);
    expect(Array.from(mapState.selectedRoutes().keys())).toEqual([
      outboundCode,
      inboundCode,
    ]);
    expect(dataLoader.loadRouteData).toHaveBeenCalledTimes(1);
    expect(dataLoader.loadRouteData).toHaveBeenCalledWith(inboundCode, false);
    expect(snackBar.open).not.toHaveBeenCalled();
  });

  it('adds the other unambiguous direction of a circular service', async () => {
    const firstCode = encodeBusDirectionFavorite({
      sourceAgency: 'sptrans',
      shortName: '100',
      originLatitude: -23.5,
      originLongitude: -46.6,
      viaLatitude: -23.51,
      viaLongitude: -46.61,
      destinationLatitude: -23.5,
      destinationLongitude: -46.6,
    });
    const secondCode = encodeBusDirectionFavorite({
      sourceAgency: 'sptrans',
      shortName: '100',
      originLatitude: -23.5,
      originLongitude: -46.6,
      viaLatitude: -23.49,
      viaLongitude: -46.59,
      destinationLatitude: -23.5,
      destinationLongitude: -46.6,
    });
    if (!firstCode || !secondCode) throw new Error('Invalid fixtures');

    mapState.addRouteToSelection({
      id: firstCode,
      routeId: 'gtfs:100',
      shortName: '100',
      longName: 'Circular service',
      destination: 'Circular service',
      directionId: 0,
    });
    geography.getBusRouteDirections.mockReturnValue(
      of([
        createBusDirection(firstCode, 0, 'Circular service'),
        createBusDirection(secondCode, 1, 'Circular service'),
      ]),
    );
    cache.getRoute.mockImplementation((favoriteCode: string) =>
      of({
        routeId: 'gtfs:100',
        favoriteCode,
        directionId: 1,
        destination: 'Circular service',
        shortName: '100',
        longName: 'Circular service',
        sourceAgency: 'sptrans',
      }),
    );

    await service.addOppositeDirectionToSelection(firstCode);

    expect(Array.from(mapState.selectedRoutes().keys())).toEqual([
      firstCode,
      secondCode,
    ]);
  });

  it('does not guess when more than one direction reverses the selected endpoints', async () => {
    const outboundCode = encodeBusDirectionFavorite({
      sourceAgency: 'sptrans',
      shortName: '100',
      originLatitude: -23.5,
      originLongitude: -46.6,
      viaLatitude: -23.51,
      viaLongitude: -46.61,
      destinationLatitude: -23.52,
      destinationLongitude: -46.62,
    });
    const inboundCode = encodeBusDirectionFavorite({
      sourceAgency: 'sptrans',
      shortName: '100',
      originLatitude: -23.52,
      originLongitude: -46.62,
      viaLatitude: -23.515,
      viaLongitude: -46.61,
      destinationLatitude: -23.5,
      destinationLongitude: -46.6,
    });
    const secondInboundCode = encodeBusDirectionFavorite({
      sourceAgency: 'sptrans',
      shortName: '100',
      originLatitude: -23.52,
      originLongitude: -46.62,
      viaLatitude: -23.513,
      viaLongitude: -46.608,
      destinationLatitude: -23.5,
      destinationLongitude: -46.6,
    });
    if (!outboundCode || !inboundCode || !secondInboundCode) {
      throw new Error('Invalid fixtures');
    }

    mapState.addRouteToSelection({
      id: outboundCode,
      routeId: 'gtfs:100',
      shortName: '100',
      longName: 'Terminal A - Terminal B',
      destination: 'Terminal B',
      directionId: 0,
    });
    geography.getBusRouteDirections.mockReturnValue(
      of([
        createBusDirection(outboundCode, 0, 'Terminal B'),
        createBusDirection(inboundCode, 1, 'Terminal A'),
        createBusDirection(secondInboundCode, 2, 'Terminal A'),
      ]),
    );

    await service.addOppositeDirectionToSelection(outboundCode);

    expect(mapState.selectedRoutes().size).toBe(1);
    expect(cache.getRoute).not.toHaveBeenCalled();
    expect(snackBar.open).toHaveBeenCalledWith(
      'Não foi possível identificar um único sentido oposto',
      'Fechar',
      { duration: 2500 },
    );
  });

  it('reports when no reverse-endpoint direction is available', async () => {
    const selectedCode = encodeBusDirectionFavorite({
      sourceAgency: 'sptrans',
      shortName: '100',
      originLatitude: -23.5,
      originLongitude: -46.6,
      viaLatitude: -23.51,
      viaLongitude: -46.61,
      destinationLatitude: -23.52,
      destinationLongitude: -46.62,
    });
    if (!selectedCode) throw new Error('Invalid fixture');

    mapState.addRouteToSelection({
      id: selectedCode,
      routeId: 'gtfs:100',
      shortName: '100',
      longName: 'Terminal A - Terminal B',
      destination: 'Terminal B',
      directionId: 0,
    });
    geography.getBusRouteDirections.mockReturnValue(
      of([createBusDirection(selectedCode, 0, 'Terminal B')]),
    );

    await service.addOppositeDirectionToSelection(selectedCode);

    expect(cache.getRoute).not.toHaveBeenCalled();
    expect(snackBar.open).toHaveBeenCalledWith(
      'Sentido oposto não encontrado',
      'Fechar',
      { duration: 2500 },
    );
  });

  it('does not add a direction after its selected source is removed during lookup', async () => {
    const selectedCode = encodeBusDirectionFavorite({
      sourceAgency: 'sptrans',
      shortName: '100',
      originLatitude: -23.5,
      originLongitude: -46.6,
      viaLatitude: -23.51,
      viaLongitude: -46.61,
      destinationLatitude: -23.52,
      destinationLongitude: -46.62,
    });
    if (!selectedCode) throw new Error('Invalid fixture');
    const directions = new Subject<BusRouteGraphQL[]>();
    mapState.addRouteToSelection({
      id: selectedCode,
      routeId: 'gtfs:100',
      shortName: '100',
      longName: 'Terminal A - Terminal B',
      destination: 'Terminal B',
      directionId: 0,
    });
    geography.getBusRouteDirections.mockReturnValue(directions.asObservable());

    const pending = service.addOppositeDirectionToSelection(selectedCode);
    service.removeRouteFromSelection(selectedCode, false);
    directions.next([
      createBusDirection(selectedCode, 0, 'Terminal B'),
    ]);
    await pending;

    expect(mapState.selectedRoutes().size).toBe(0);
    expect(cache.getRoute).not.toHaveBeenCalled();
    expect(snackBar.open).not.toHaveBeenCalled();
  });

  it('does not restore the opposite direction when selections clear after cache emits', async () => {
    const selectedCode = encodeBusDirectionFavorite({
      sourceAgency: 'sptrans',
      shortName: '100',
      originLatitude: -23.5,
      originLongitude: -46.6,
      viaLatitude: -23.51,
      viaLongitude: -46.61,
      destinationLatitude: -23.52,
      destinationLongitude: -46.62,
    });
    const oppositeCode = encodeBusDirectionFavorite({
      sourceAgency: 'sptrans',
      shortName: '100',
      originLatitude: -23.52,
      originLongitude: -46.62,
      viaLatitude: -23.515,
      viaLongitude: -46.61,
      destinationLatitude: -23.5,
      destinationLongitude: -46.6,
    });
    if (!selectedCode || !oppositeCode) throw new Error('Invalid fixtures');

    mapState.addRouteToSelection({
      id: selectedCode,
      routeId: 'gtfs:100',
      shortName: '100',
      longName: 'Terminal A - Terminal B',
      destination: 'Terminal B',
      directionId: 0,
    });
    geography.getBusRouteDirections.mockReturnValue(
      of([
        createBusDirection(selectedCode, 0, 'Terminal B'),
        createBusDirection(oppositeCode, 1, 'Terminal A'),
      ]),
    );
    const routeLookup = new Subject<BusRouteGraphQL | null>();
    cache.getRoute.mockReturnValue(routeLookup.asObservable());

    const pending = service.addOppositeDirectionToSelection(selectedCode);
    await Promise.resolve();
    expect(cache.getRoute).toHaveBeenCalledWith(oppositeCode);

    routeLookup.next(createBusDirection(oppositeCode, 1, 'Terminal A'));
    service.clearAllSelections(false);
    await pending;

    expect(mapState.selectedRoutes().size).toBe(0);
    expect(dataLoader.loadRouteData).not.toHaveBeenCalled();
    expect(snackBar.open).not.toHaveBeenCalled();
  });

  it('uses the full-data response to populate the selection', async () => {
    const stop = {
      stopId: 'stop-1',
      name: 'Stop 1',
      latitude: -23.55,
      longitude: -46.63,
      isSubwayStation: false,
    };
    dataLoader.loadStopData.mockResolvedValue({ status: 'loaded', stop });

    await service.addStopToSelection('stop-1', false);

    expect(dataLoader.loadStopData).toHaveBeenCalledWith(
      'stop-1',
      false,
      undefined,
      expect.any(Function),
    );
    expect(mapState.selectedStops().has(stop.stopId)).toBe(true);
    expect(snackBar.open).not.toHaveBeenCalled();
  });

  it('does not restore a stop after selections clear before the result continuation', async () => {
    const stop = {
      id: 'stop-1',
      stopId: 'stop-1',
      name: 'Stop 1',
      latitude: -23.55,
      longitude: -46.63,
      isSubwayStation: false,
    };
    let resolveLoad!: (result: { status: 'loaded'; stop: typeof stop }) => void;
    dataLoader.loadStopData.mockReturnValue(
      new Promise((resolve) => (resolveLoad = resolve)),
    );

    const pendingSelection = service.addStopToSelection(stop.stopId, false);
    resolveLoad({ status: 'loaded', stop });
    service.clearAllSelections(false);
    await pendingSelection;

    expect(mapState.selectedStops().has(stop.stopId)).toBe(false);
    expect(dataLoader.cancelPendingLoads).toHaveBeenCalledTimes(1);
  });

  it('cancels an alias request when its canonical stop is removed', async () => {
    const stop = {
      id: 'canonical-stop',
      stopId: 'canonical-stop',
      name: 'Stop 1',
      latitude: -23.55,
      longitude: -46.63,
      isSubwayStation: false,
    };
    let resolveLoad!: (result: { status: 'loaded'; stop: typeof stop }) => void;
    dataLoader.loadStopData.mockImplementation(
      (
        _requestedId: string,
        _showSnackbar: boolean,
        _stopUpdates: unknown,
        onStopReceived: (receivedStop: typeof stop) => void,
      ) => {
        onStopReceived(stop);
        return new Promise((resolve) => (resolveLoad = resolve));
      },
    );

    const pendingSelection = service.addStopToSelection('alias-stop', false);
    service.removeStopFromSelection(stop.stopId);
    resolveLoad({ status: 'loaded', stop });
    await pendingSelection;

    expect(dataLoader.cancelStopDataLoad).toHaveBeenCalledWith('alias-stop');
    expect(mapState.selectedStops().has(stop.stopId)).toBe(false);
  });

  it('keeps rail vehicle tracking when the route disables bus realtime', async () => {
    cache.getRoute.mockReturnValue(
      of({
        routeId: 'rail:L10',
        shortName: 'CPTM L10',
        longName: 'Linha 10-Turquesa',
        color: 'A3A3A3',
        textColor: 'FFFFFF',
        routeType: 2,
        sourceAgency: 'CPTM',
        supportsRealtime: false,
      }),
    );

    await service.addRouteToSelection('rail:L10', false);

    expect(
      TestBed.inject(CptmVehicleLayerService).subscribeToLine,
    ).toHaveBeenCalledWith('L10');
    expect(
      TestBed.inject(RealtimeWebsocketService).subscribeToRoute,
    ).not.toHaveBeenCalled();
  });

  it.each(['001', 'CPTM L10'])(
    'subscribes to Artesp positions by canonical ID when its short name is %s',
    async (shortName) => {
      cache.getRoute.mockReturnValue(
        of({
          routeId: 'artesp:001',
          shortName,
          longName: 'Terminal Regional - Centro',
          color: 'C90C0F',
          textColor: 'FFFFFF',
          routeType: 3,
          sourceAgency: 'ARTESP',
          supportsRealtime: false,
        }),
      );

      await service.addRouteToSelection('artesp:001', false);

      const realtime = TestBed.inject(RealtimeWebsocketService);
      expect(realtime.subscribeToRoute).toHaveBeenCalledWith('artesp:001');
      expect(
        TestBed.inject(CptmVehicleLayerService).subscribeToLine,
      ).not.toHaveBeenCalled();

      service.removeRouteFromSelection('artesp:001');

      expect(realtime.unsubscribeFromRoute).toHaveBeenCalledWith('artesp:001');
    },
  );

  it('keeps SPTrans realtime subscriptions keyed by short name', async () => {
    cache.getRoute.mockReturnValue(
      of({
        routeId: 'sptrans:100',
        shortName: '100',
        longName: 'Route 100',
        color: '112233',
        textColor: 'FFFFFF',
        sourceAgency: 'SPTRANS',
        supportsRealtime: true,
      }),
    );

    await service.addRouteToSelection('sptrans:100', false);

    const realtime = TestBed.inject(RealtimeWebsocketService);
    expect(realtime.subscribeToRoute).toHaveBeenCalledWith('100');

    service.removeRouteFromSelection('sptrans:100');

    expect(realtime.unsubscribeFromRoute).toHaveBeenCalledWith('100');
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
