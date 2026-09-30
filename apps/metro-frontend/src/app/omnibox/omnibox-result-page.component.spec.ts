import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import {
  ActivatedRoute,
  convertToParamMap,
  ParamMap,
  provideRouter,
} from '@angular/router';
import { Observable, of, Subject } from 'rxjs';
import { CityContextService } from '../cities/city-context.service';
import { BikeStation } from '../map-main/components/map/map.types';
import { BikeStationsService } from '../map-main/geography/bike-stations.service';
import type {
  BusRouteGraphQL,
  StopFullDataSnapshot,
} from '../map-main/geography/geography-graphql.service';
import { GeographyGraphQLService } from '../map-main/geography/geography-graphql.service';
import { TypesenseSearchService } from '../search/typesense-search.service';
import { OmniboxResultPageComponent } from './omnibox-result-page.component';

describe('OmniboxResultPageComponent', () => {
  const stop = {
    id: '340015325',
    stopId: '340015325',
    name: 'Av. Paulista, 1000',
    latitude: -23.5614,
    longitude: -46.656,
    isSubwayStation: false,
    agencies: ['bus'],
    routeShortNames: ['477A'],
  };
  const geography = {
    watchStopFullData: jest.fn(),
  };
  const search = { search: jest.fn() };
  const bikes = {
    getStation: jest.fn(),
    upsertStationSummary: jest.fn(),
    ensureStationDetails: jest.fn(),
  };

  async function createPage(
    kind: string,
    id: string,
    query: Record<string, string>,
    paramMap: Observable<ParamMap> = of(convertToParamMap({ kind, id })),
  ) {
    const queryParamMap = convertToParamMap(query);
    TestBed.configureTestingModule({
      imports: [OmniboxResultPageComponent],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap,
            queryParamMap: of(queryParamMap),
            snapshot: { queryParamMap },
          },
        },
        { provide: MatDialog, useValue: { open: jest.fn() } },
        { provide: GeographyGraphQLService, useValue: geography },
        { provide: TypesenseSearchService, useValue: search },
        { provide: BikeStationsService, useValue: bikes },
        { provide: CityContextService, useValue: { path: () => '/sp/mapa' } },
      ],
    });
    TestBed.overrideProvider(MatDialog, { useValue: { open: jest.fn() } });
    TestBed.overrideComponent(OmniboxResultPageComponent, {
      set: { template: '' },
    });
    const fixture = TestBed.createComponent(OmniboxResultPageComponent);
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    geography.watchStopFullData.mockReturnValue(
      of({ stop, routes: [], hasNext: false }),
    );
    search.search.mockReturnValue(of({ success: false, results: [] }));
    bikes.getStation.mockReturnValue(null);
  });

  it('keeps the launcher available while loading and focuses before hiding it', async () => {
    const page = await createPage('bus-stop', stop.stopId, { q: 'paulista' });
    const closed = new Subject<void>();
    const focusSearch = jest.fn(() => expect(page.searchOpen()).toBe(false));
    const open = jest.mocked(TestBed.inject(MatDialog).open);
    open.mockReturnValue({
      componentInstance: { focusSearch },
      afterClosed: () => closed,
    } as unknown as ReturnType<MatDialog['open']>);

    const opening = page.openSearch('p');
    expect(page.searchOpen()).toBe(false);
    void page.openSearch('paulista');
    await opening;

    expect(open).toHaveBeenCalledTimes(1);
    expect(focusSearch).toHaveBeenCalledTimes(1);
    expect(page.searchOpen()).toBe(true);
    const received: string[] = [];
    const subscription = open.mock.calls[0][1]?.data.queryChanges.subscribe(
      (query: string) => received.push(query),
    );
    expect(received).toEqual(['paulista']);
    subscription.unsubscribe();
  });

  it('shows a stop before deferred routes arrive and keeps the dialog injector stable', async () => {
    const snapshots = new Subject<StopFullDataSnapshot>();
    geography.watchStopFullData.mockReturnValue(snapshots);
    const page = await createPage('bus-stop', stop.stopId, { q: 'paulista' });
    snapshots.next({ stop, hasNext: true });

    expect(page.query()).toBe('paulista');
    expect(page.detail()).toMatchObject({
      kind: 'bus-stop',
      title: stop.name,
      data: { stop, routes: [], routesLoading: true, routesError: false },
    });
    const dialogInjector = page.detailInjector();
    const route: BusRouteGraphQL = {
      id: '477A-10',
      routeId: '477A-10',
      shortName: '477A',
      longName: 'Pinheiros - Ibirapuera',
      color: '112233',
      textColor: 'FFFFFF',
    };

    snapshots.next({
      stop,
      routes: [{ route }],
      hasNext: false,
    });

    expect(page.detail()?.data).toMatchObject({
      routes: [route],
      routesLoading: false,
      routesError: false,
    });
    expect(page.detailInjector()).toBe(dialogInjector);
    expect(page.embeddedInputs()).toMatchObject({
      detailsOverride: { stop, routes: [route] },
    });
  });

  it('preserves the stop if deferred route delivery fails', async () => {
    const snapshots = new Subject<StopFullDataSnapshot>();
    geography.watchStopFullData.mockReturnValue(snapshots);
    const page = await createPage('bus-stop', stop.stopId, { q: 'paulista' });
    snapshots.next({ stop, hasNext: true });
    snapshots.error(new Error('offline'));

    expect(page.detail()).toMatchObject({
      kind: 'bus-stop',
      data: {
        stop,
        routesLoading: false,
        routesError: true,
      },
    });
  });

  it('shows GraphQL route errors without losing stop details', async () => {
    const snapshots = new Subject<StopFullDataSnapshot>();
    geography.watchStopFullData.mockReturnValue(snapshots);
    const page = await createPage('bus-stop', stop.stopId, { q: 'paulista' });
    snapshots.next({ stop, hasNext: true });
    snapshots.next({
      stop,
      hasNext: false,
      errors: [
        { message: 'routes unavailable', path: ['stopFullData', 'routes'] },
      ],
    });

    expect(page.detail()).toMatchObject({
      kind: 'bus-stop',
      data: {
        stop,
        routesLoading: false,
        routesError: true,
      },
    });
  });

  it('unsubscribes the stop stream when navigating to another result', async () => {
    const routeParams = new Subject<ParamMap>();
    const teardown = jest.fn();
    geography.watchStopFullData.mockReturnValue(
      new Observable<StopFullDataSnapshot>(() => teardown),
    );
    const page = await createPage('bus-stop', stop.stopId, {}, routeParams);
    routeParams.next(convertToParamMap({ kind: 'bus-stop', id: stop.stopId }));
    expect(geography.watchStopFullData).toHaveBeenCalledWith(stop.stopId);

    routeParams.next(convertToParamMap({ kind: 'rail-line', id: 'L9' }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(teardown).toHaveBeenCalledTimes(1);
    expect(page.detail()?.kind).toBe('rail-line');
  });

  it('restores rail station details from a shared URL if search is unavailable', async () => {
    const page = await createPage('rail-station', 'CONS', {
      q: 'paulista',
      name: 'Consolação',
      lat: '-23.5571',
      lon: '-46.6606',
      lines: 'Verde',
    });
    expect(page.detail()?.kind).toBe('rail-station');
    expect(page.detail()?.mapParams).toEqual({
      railStationId: 'CONS',
      railStationName: 'Consolação',
      subwayStations: '1',
      lat: '-23.5571',
      lon: '-46.6606',
      z: '16',
    });
  });

  it('keeps rail station details available without a map location', async () => {
    const page = await createPage('rail-station', 'CONS', {
      q: 'consolação',
      name: 'Consolação',
    });
    expect(page.detail()?.kind).toBe('rail-station');
    expect(page.detail()?.mapParams).toBeNull();
  });

  it('uses cached bike availability without replacing it with zeroes', async () => {
    const station = {
      stationId: 'bike-35',
      name: 'Estação 35',
      numBikesAvailable: 7,
    } as BikeStation;
    bikes.getStation.mockReturnValue(station);
    const page = await createPage('bike-station', station.stationId, {
      q: 'bike',
      name: station.name,
      lat: '-23.5731',
      lon: '-46.6822',
    });
    expect(page.bikeStation()).toBe(station);
    expect(bikes.upsertStationSummary).not.toHaveBeenCalled();
    expect(bikes.ensureStationDetails).toHaveBeenCalledWith(station.stationId);
    expect(page.detail()?.mapParams).toEqual({
      bike: '1',
      bikeStationId: station.stationId,
      bikeStationName: station.name,
      lat: '-23.5731',
      lon: '-46.6822',
      z: '17',
    });
  });
});
