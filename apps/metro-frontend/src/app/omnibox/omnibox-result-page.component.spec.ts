import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import { CityContextService } from '../cities/city-context.service';
import { BikeStation } from '../map-main/components/map/map.types';
import { BikeStationsService } from '../map-main/geography/bike-stations.service';
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
    getBusStop: jest.fn(),
    getRoutesForStop: jest.fn(),
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
  ) {
    const queryParamMap = convertToParamMap(query);
    TestBed.configureTestingModule({
      imports: [OmniboxResultPageComponent],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: of(convertToParamMap({ kind, id })),
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
    geography.getBusStop.mockReturnValue(of(stop));
    geography.getRoutesForStop.mockReturnValue(of([]));
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

  it('loads a bus stop by URL and retains arrivals when routes fail', async () => {
    geography.getRoutesForStop.mockReturnValue(
      throwError(() => new Error('offline')),
    );
    const page = await createPage('bus-stop', stop.stopId, { q: 'paulista' });
    expect(page.query()).toBe('paulista');
    expect(page.detail()).toEqual({
      kind: 'bus-stop',
      title: stop.name,
      data: {
        stop,
        routes: [],
        selectedRoutes: new Set(),
        showMapActions: false,
      },
      mapParams: {
        busStops: stop.stopId,
        lat: String(stop.latitude),
        lon: String(stop.longitude),
        z: '16',
      },
    });
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
