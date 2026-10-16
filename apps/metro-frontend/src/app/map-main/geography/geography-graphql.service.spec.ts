import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { IncrementalGraphqlClient } from '@metro/shared/api';
import { Observable, Subject } from 'rxjs';
import type {
  BusStopGraphQL,
  RouteFullDataGraphQL,
  RouteRailConnectionGraphQL,
} from './geography-graphql.service';
import { GeographyGraphQLService } from './geography-graphql.service';

interface RawStopFullDataResult {
  data?: {
    stopFullData?: {
      stop?: BusStopGraphQL | null;
      routes?: RouteFullDataGraphQL[] | null;
      routeMetadata?: RouteFullDataGraphQL['route'][] | null;
      railConnections?: RouteRailConnectionGraphQL[] | null;
      railConnectionsWithStopCounts?: RouteRailConnectionGraphQL[] | null;
    } | null;
  };
  errors?: readonly { message: string; path?: readonly (string | number)[] }[];
  hasNext: boolean;
}

const stop: BusStopGraphQL = {
  id: 'stop-1',
  stopId: 'stop-1',
  name: 'Praça da Sé',
  latitude: -23.5505,
  longitude: -46.6333,
  isSubwayStation: false,
};

describe('GeographyGraphQLService camera geometry', () => {
  let service: GeographyGraphQLService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        GeographyGraphQLService,
        { provide: IncrementalGraphqlClient, useValue: {} },
      ],
    });
    service = TestBed.inject(GeographyGraphQLService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('frames a rail line using the selected dataset, including offscreen stations', () => {
    const coordinates: [number, number][][] = [];
    service.getRailLineFocusCoordinates('L1').subscribe((value) => coordinates.push(value));
    const request = http.expectOne('/api/graphql');
    expect(request.request.body.query).toContain('railStations { lines latitude longitude }');
    request.flush({ data: { railStations: [
      { lines: ['AZUL'], longitude: -46.6, latitude: -23.5 },
      { lines: ['L01', 'L02'], longitude: -46.7, latitude: -23.6 },
      { lines: ['VERDE'], longitude: -46.8, latitude: -23.7 },
      { lines: null, longitude: -46.9, latitude: -23.8 },
    ] } });
    expect(coordinates).toEqual([[[-46.6, -23.5], [-46.7, -23.6]]]);
  });

  it.each(['gtfs:100', 'bus:v1:saved-direction'])('requests only server bounds for %s', (routeId) => {
    const coordinates: [number, number][][] = [];
    service.getRouteFocusCoordinates(routeId).subscribe((value) => coordinates.push(value));
    const request = http.expectOne('/api/graphql');
    expect(request.request.body.variables).toEqual({ routeId });
    expect(request.request.body.query).toContain('routeBounds(routeId: $routeId)');
    expect(request.request.body.query).not.toContain('geometry');
    request.flush({ data: { routeBounds: {
      minLng: -46.7, minLat: -23.6, maxLng: -46.6, maxLat: -23.5,
    } } });
    expect(coordinates).toEqual([[[-46.7, -23.6], [-46.6, -23.5]]]);
  });

  it('leaves the camera alone when the route has no bounds', () => {
    const coordinates: [number, number][][] = [];
    service.getRouteFocusCoordinates('missing').subscribe((value) => coordinates.push(value));
    http.expectOne('/api/graphql').flush({ data: { routeBounds: null } });
    expect(coordinates).toEqual([[]]);
  });

  it('loads saved direction metadata without downloading its geometry', () => {
    service.getFavoriteBusDirections(['saved']).subscribe();
    const request = http.expectOne('/api/graphql');
    expect(request.request.body.query).not.toContain('geometry');
    request.flush({ data: { favoriteBusDirections: [] } });
  });

  it('does not request bounds for an unknown rail line', () => {
    const coordinates: [number, number][][] = [];
    service.getRailLineFocusCoordinates('unknown').subscribe((value) => coordinates.push(value));
    http.expectNone('/api/graphql');
    expect(coordinates).toEqual([[]]);
  });
});

describe('GeographyGraphQLService incremental stop query', () => {
  let service: GeographyGraphQLService;
  let query: jest.Mock;

  beforeEach(() => {
    query = jest.fn(() => new Subject<RawStopFullDataResult>().asObservable());
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        GeographyGraphQLService,
        { provide: IncrementalGraphqlClient, useValue: { query } },
      ],
    });
    service = TestBed.inject(GeographyGraphQLService);
  });

  afterEach(() => jest.restoreAllMocks());

  it('shares active consumers, delivers stop before routes, then allows a fresh query', () => {
    const updates = new Subject<RawStopFullDataResult>();
    query.mockReturnValue(updates.asObservable());
    const unusedStream = service.watchStopFullData(stop.stopId);
    const firstValues: unknown[] = [];
    const secondValues: unknown[] = [];

    expect(query).not.toHaveBeenCalled();
    const firstSubscription = service
      .watchStopFullData(stop.stopId)
      .subscribe((value) => firstValues.push(value));
    const secondSubscription = unusedStream.subscribe((value) =>
      secondValues.push(value),
    );

    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toContain('... @defer(label: "stopRoutes")');
    expect(query.mock.calls[0][0]).not.toContain('@stream');

    updates.next({ data: { stopFullData: { stop } }, hasNext: true });
    expect(firstValues).toEqual([{ stop, hasNext: true }]);
    expect(secondValues).toEqual(firstValues);

    const errors = [
      { message: 'route resolver failed', path: ['stopFullData', 'routes'] },
    ];
    updates.next({
      data: { stopFullData: { stop, routes: null } },
      errors,
      hasNext: false,
    });
    updates.complete();
    expect(firstValues).toEqual([
      { stop, hasNext: true },
      { stop, routes: [], errors, hasNext: false },
    ]);
    expect(secondValues).toEqual(firstValues);
    firstSubscription.unsubscribe();
    secondSubscription.unsubscribe();

    query.mockReturnValue(new Subject<RawStopFullDataResult>().asObservable());
    const freshSubscription = service
      .watchStopFullData(stop.stopId)
      .subscribe();
    expect(query).toHaveBeenCalledTimes(2);
    freshSubscription.unsubscribe();
  });

  it('evicts a cancelled in-flight stream so the next subscriber can retry', () => {
    const teardown = jest.fn();
    query.mockReturnValue(
      new Observable<RawStopFullDataResult>(() => teardown),
    );

    const firstSubscription = service
      .watchStopFullData(stop.stopId)
      .subscribe();
    firstSubscription.unsubscribe();

    expect(teardown).toHaveBeenCalledTimes(1);

    query.mockReturnValue(new Subject<RawStopFullDataResult>().asObservable());
    const retrySubscription = service
      .watchStopFullData(stop.stopId)
      .subscribe();

    expect(query).toHaveBeenCalledTimes(2);
    retrySubscription.unsubscribe();
  });

  it('delivers colors before deferred directions and caches only complete metadata for one minute', () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(1000);
    const updates = new Subject<RawStopFullDataResult>();
    query.mockReturnValue(updates.asObservable());
    const values: unknown[] = [];
    const route = {
      id: 'route-1', routeId: 'route-1', shortName: '100',
      longName: 'Centro', color: '006341', textColor: 'ffffff',
    };
    const subscription = service.watchStopFullData(stop.stopId)
      .subscribe((value) => values.push(value));

    expect(query.mock.calls[0][0]).toContain('routeMetadata');
    const metadataFields = query.mock.calls[0][0].split('routeMetadata {')[1].split('... @defer')[0];
    expect(metadataFields).not.toContain('directionId');
    expect(query.mock.calls[0][0]).toContain('railConnections(includeStopCounts: false)');
    expect(query.mock.calls[0][0]).toContain('@defer(label: "stopRailConnectionCounts")');
    updates.next({ data: { stopFullData: { stop, routeMetadata: [route] } }, hasNext: true });
    expect(values).toEqual([{ stop, routes: [{ route }], hasNext: true }]);

    updates.next({ data: { stopFullData: {
      stop, routeMetadata: [route], routes: [{ route }],
      railConnections: [], railConnectionsWithStopCounts: [],
    } }, hasNext: false });
    updates.complete();
    subscription.unsubscribe();

    const cached: unknown[] = [];
    service.watchStopFullData(stop.stopId).subscribe((value) => cached.push(value));
    expect(query).toHaveBeenCalledTimes(1);
    expect(cached).toEqual([values[1]]);

    now.mockReturnValue(61_001);
    const retry = service.watchStopFullData(stop.stopId).subscribe();
    expect(query).toHaveBeenCalledTimes(2);
    retry.unsubscribe();
    now.mockRestore();
  });

  it('keeps exact stop counts when the lightweight rail patch arrives later', () => {
    const updates = new Subject<RawStopFullDataResult>();
    query.mockReturnValue(updates.asObservable());
    const values: unknown[] = [];
    service.watchStopFullData(stop.stopId).subscribe((value) => values.push(value));
    const detailed: RouteRailConnectionGraphQL[] = [{
      routeId: 'route-1', routeShortName: '100', directions: [{
        directionId: 0, headsign: 'Centro', stations: [{
          id: 'station-1', name: 'Sé', lines: ['Azul'], distanceMeters: 50, stopsUntil: 3,
        }],
      }],
    }];
    updates.next({ data: { stopFullData: { stop, railConnectionsWithStopCounts: detailed } }, hasNext: true });
    updates.next({ data: { stopFullData: {
      stop, railConnections: [], railConnectionsWithStopCounts: detailed,
    } }, hasNext: false });
    updates.complete();
    expect(values).toEqual([
      { stop, railConnections: detailed, hasNext: true },
      { stop, railConnections: detailed, hasNext: false },
    ]);
  });
});
