import { BusInformationService } from '../../services/bus-information.service';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import {
  BusRouteGraphQL,
  BusStopGraphQL,
  GeographyGraphQLService,
  RouteRailConnectionGraphQL,
  ScheduledBusDepartureGraphQL,
} from '../../services/geography-graphql.service';
import {
  LineWithVehicles,
  RealtimeWebsocketService,
  StopArrivalUpdate,
} from '../../services/realtime-websocket.service';
import { StopArrivalsComponent } from './stop-arrivals.component';

describe('StopArrivalsComponent', () => {
  let fixture: ComponentFixture<StopArrivalsComponent>;

  const route: BusRouteGraphQL = {
    id: '847P-10',
    routeId: '847P-10',
    shortName: '847P-10',
    longName: 'Term. Pirituba - Vl. Olímpia',
    routeType: 3,
    color: '006341',
    textColor: 'ffffff',
  };
  const stop: BusStopGraphQL = {
    id: '630012905',
    stopId: '630012905',
    name: 'R. Fidalga, 634',
    latitude: -23.554243,
    longitude: -46.691261,
    isSubwayStation: false,
  };
  const line: LineWithVehicles = {
    c: '847P-10',
    cl: 33191,
    sl: 2,
    lt0: 'VL. OLÍMPIA',
    lt1: 'TERM. PIRITUBA',
    qv: 1,
    vs: [],
  };
  const connection: RouteRailConnectionGraphQL = {
    routeId: route.routeId,
    routeShortName: route.shortName,
    routeLongName: route.longName,
    directions: [
      {
        directionId: 0,
        headsign: 'Vl. Olímpia',
        stations: [createStation('opposite', 'Eucaliptos')],
      },
      {
        directionId: 1,
        headsign: 'Term. Pirituba',
        stations: [createStation('vila-madalena', 'Vila Madalena')],
      },
    ],
  };

  beforeEach(async () => {
    const arrivals = createArrivals(line);
    const realtimeService = {
      stopArrivals: signal(new Map([[stop.stopId, arrivals]])),
      subscribeToStop: jest.fn(),
      unsubscribeFromStop: jest.fn(),
    };
    const geographyService = {
      getScheduledBusDepartures: jest.fn(() => of([])),
      getRouteRailConnectionsForStop: jest.fn(() =>
        of([
          connection,
          {
            ...connection,
            routeId: `artesp:${connection.routeId}`,
            routeLongName: 'Artesp duplicate short name',
          },
        ]),
      ),
    };

    await TestBed.configureTestingModule({
      imports: [StopArrivalsComponent],
      providers: [
        { provide: BusInformationService, useValue: { notices: jest.fn(() => of({ status: 'AVAILABLE', lastUpdated: null, notices: [] })) } },
        { provide: RealtimeWebsocketService, useValue: realtimeService },
        { provide: GeographyGraphQLService, useValue: geographyService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(StopArrivalsComponent);
    fixture.componentRef.setInput('stop', stop);
    fixture.componentRef.setInput('routes', [route]);
    fixture.detectChanges();
  });

  afterEach(() => fixture.destroy());

  it('places a warning only under the matching arrival item and does not refetch on arrival updates', () => {
    const api = TestBed.inject(BusInformationService);
    const query = api.notices as jest.Mock;
    const result = { status: 'AVAILABLE', lastUpdated: '2026-09-07T07:30:00Z', notices: [{
      sourceId: '1', sourceUrl: 'https://www.sptrans.com.br/informativos/oeste/exemplo/1/',
      title: 'Desvio de itinerário', description: '07/09/2026\n847P-10 Destino\nIda: via alternativa.',
      periodText: '07/09/2026', routes: ['847P-10'], listedDate: '7 de setembro', listing: 'RECENT',
    }] };
    fixture.componentInstance.busNotices.set(result);
    fixture.componentInstance.arrivals.set({ hr: '12:00', p: { cp: 1, np: 'Ponto', py: 0, px: 0, l: [line, { ...line, c: '1234-10', cl: 999 }] } });
    fixture.componentInstance.isLoading.set(false);
    fixture.detectChanges();
    const items = fixture.nativeElement.querySelectorAll('.arrival-line');
    expect(items[0].querySelector('app-bus-information button')?.textContent).toContain('Desvio');
    expect(items[1].querySelector('app-bus-information button')).toBeNull();
    const count = query.mock.calls.length;
    fixture.componentInstance.arrivals.update((value) => value ? { ...value, hr: '12:01' } : value);
    fixture.detectChanges();
    expect(query).toHaveBeenCalledTimes(count);
  });

  it('shows one departure per route and expands only that route to five', () => {
    const departures: ScheduledBusDepartureGraphQL[] = Array.from({ length: 7 }, (_, index) => ({
      routeId: 'artesp:001',
      routeShortName: '001',
      tripId: `artesp:trip-${index}`,
      headsign: 'Centro',
      directionId: 0,
      departureTime: `2026-09-07T14:${String(index * 5).padStart(2, '0')}:00-03:00`,
      sourceAgency: 'ARTESP',
    }));
    departures.push({ ...departures[0], routeId: 'artesp:002', tripId: 'artesp:other-trip', routeShortName: '002' });
    const getDepartures = jest.spyOn(TestBed.inject(GeographyGraphQLService), 'getScheduledBusDepartures')
      .mockReturnValue(of(departures));
    fixture.componentRef.setInput('stop', { ...stop, stopId: 'artesp:42', sourceAgency: 'ARTESP' });
    fixture.detectChanges();
    fixture.detectChanges();

    expect(getDepartures).toHaveBeenCalledWith('artesp:42', 5);
    expect(fixture.nativeElement.querySelectorAll('.scheduled-group')).toHaveLength(2);
    expect(fixture.nativeElement.querySelectorAll('.scheduled-time')).toHaveLength(2);
    const toggle = fixture.nativeElement.querySelector('.schedule-toggle') as HTMLButtonElement;
    expect(toggle.textContent).toContain('Ver 5 horários');
    toggle.click();
    fixture.detectChanges();
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(fixture.nativeElement.querySelectorAll('.scheduled-group')[0].querySelectorAll('.scheduled-time')).toHaveLength(5);
    expect(fixture.nativeElement.querySelectorAll('.scheduled-group')[1].querySelectorAll('.scheduled-time')).toHaveLength(1);
    toggle.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.scheduled-time')).toHaveLength(2);
  });

  it('renders the destination selected by the OlhoVivo direction', () => {
    const destination = fixture.nativeElement.querySelector(
      '.line-destination',
    ) as HTMLElement;

    expect(destination.textContent).toContain('TERM. PIRITUBA');
    expect(destination.textContent).not.toContain('VL. OLÍMPIA');
  });

  it('uses the numeric direction when both rail directions are available', () => {
    expect(
      fixture.componentInstance
        .getLineRailStations(line)
        .map((station) => station.name),
    ).toEqual(['Vila Madalena']);
  });

  it('renders circular line numbers beside the station name and preserves distance', () => {
    const station = fixture.nativeElement.querySelector(
      '.rail-service .rail-station',
    ) as HTMLElement;

    expect(
      station.querySelector('.station-line-badge')?.textContent?.trim(),
    ).toBe('2');
    expect(station.querySelector('.station-line-badge')?.getAttribute('aria-label')).toBe('Linha 2');
    expect(station.querySelector('.rail-station-name')?.textContent?.trim()).toBe('Vila Madalena');
    expect(
      station.querySelector('.rail-station-distance')?.textContent?.trim(),
    ).toBe('Parada da linha a 131 m da estação');
  });

  it('does not format invalid station distances', () => {
    for (const distanceMeters of [
      -1,
      Number.NaN,
      Number.POSITIVE_INFINITY,
    ]) {
      expect(
        fixture.componentInstance.formatStationDistance({
          ...createStation('invalid', 'Invalid'),
          distanceMeters,
        }),
      ).toBeNull();
    }
  });

  it('formats zero as a valid station distance', () => {
    expect(
      fixture.componentInstance.formatStationDistance({
        ...createStation('zero', 'Zero'),
        distanceMeters: 0,
      }),
    ).toBe('Parada da linha a 0 m da estação');
  });

  it('keeps route rail connections namespaced when short names collide', () => {
    const sptransRoute = { ...route, routeId: '001', shortName: '001' };
    const artespRoute = {
      ...route,
      routeId: 'artesp:001',
      shortName: '001',
    };
    const sptransConnection = {
      ...connection,
      routeId: sptransRoute.routeId,
      routeShortName: sptransRoute.shortName,
    };
    const artespConnection = {
      ...connection,
      routeId: artespRoute.routeId,
      routeShortName: artespRoute.shortName,
      routeLongName: 'Artesp duplicate short name',
    };
    fixture.componentInstance.railConnections.set(
      new Map([
        [sptransConnection.routeId, sptransConnection],
        [artespConnection.routeId, artespConnection],
        [sptransConnection.shortName, sptransConnection],
      ]),
    );

    expect(fixture.componentInstance.getRouteConnection(sptransRoute)).toBe(
      sptransConnection,
    );
    expect(fixture.componentInstance.getRouteConnection(artespRoute)).toBe(
      artespConnection,
    );
  });
});

function createArrivals(line: LineWithVehicles): StopArrivalUpdate {
  return {
    stopCode: '630012905',
    hr: '15:31',
    cacheTimestamp: Date.now(),
    p: {
      cp: 630012905,
      np: 'R. Fidalga, 634',
      py: -23.554243,
      px: -46.691261,
      l: [line],
    },
  };
}

function createStation(id: string, name: string) {
  return {
    id,
    name,
    agencies: ['metro'],
    lines: ['Verde'],
    distanceMeters: 131,
    nearStopId: '6311025',
    nearStopName: 'R. Cristovão de Burgos, 54',
    stopSequence: 26,
  };
}
