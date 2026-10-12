import { BusInformationService } from '../bus-information/bus-information.service';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import {
  BusRouteGraphQL,
  BusStopGraphQL,
  GeographyGraphQLService,
  RouteRailConnectionGraphQL,
  ScheduledBusDepartureGraphQL,
} from '../../geography/geography-graphql.service';
import {
  LineWithVehicles,
  RealtimeWebsocketService,
  StopArrivalUpdate,
} from '../../realtime/realtime-websocket.service';
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
        {
          provide: BusInformationService,
          useValue: {
            notices: jest.fn(() =>
              of({ status: 'AVAILABLE', lastUpdated: null, notices: [] }),
            ),
          },
        },
        { provide: RealtimeWebsocketService, useValue: realtimeService },
        { provide: GeographyGraphQLService, useValue: geographyService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(StopArrivalsComponent);
    fixture.componentRef.setInput('stop', stop);
    fixture.componentRef.setInput('routes', [route]);
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
    jest.useRealTimers();
  });

  function expandRoute(index = 0): HTMLElement {
    const header = fixture.nativeElement.querySelectorAll(
      '.route-panel-header',
    )[index] as HTMLElement;
    header.click();
    fixture.detectChanges();
    return header;
  }

  it('uses Circular for arrival and schedule labels without changing the schedule headsign', () => {
    fixture.componentRef.setInput('routes', [{
      ...route, isCircular: true, destination: 'Term. Pirituba', directionId: 0,
    }]);
    fixture.componentInstance.scheduledDepartures.set([{
      routeId: route.routeId, routeShortName: route.shortName, tripId: 'circular-trip',
      directionId: 0, headsign: 'Term. Pirituba', departureTime: '2026-10-10T12:00:00Z',
    }]);
    fixture.detectChanges();
    expect(fixture.componentInstance.getLineDestination(line)).toBe('Circular');
    expect(fixture.componentInstance.scheduledRows()[0]).toEqual(expect.objectContaining({
      headsign: 'Term. Pirituba', destinationLabel: 'Circular',
    }));
  });

  it('shows rail connections only for the displayed destination when direction IDs disagree', () => {
    const currentDirection = { ...route, destination: 'Term. Pirituba', directionId: 0 };
    expect(fixture.componentInstance.getRouteDirectionsWithRail(currentDirection).map((direction) => direction.headsign)).toEqual(['Term. Pirituba']);
  });

  it('shows only the selected destination when opposite arrivals share a line code', () => {
    const outbound = { ...route, favoriteCode: 'outbound', destination: 'Vl. Olímpia', directionId: 1 };
    const inbound = { ...route, favoriteCode: 'inbound', destination: 'Term. Pirituba', directionId: 0 };
    fixture.componentRef.setInput('routes', [outbound, inbound]);
    fixture.componentRef.setInput('selectedRouteKeys', ['outbound']);
    fixture.componentInstance.arrivals.set(createArrivals(line));
    fixture.detectChanges();
    expect(fixture.componentInstance.arrivalLines()).toHaveLength(0);
    fixture.componentInstance.arrivals.set(createArrivals({ ...line, sl: 1 }));
    fixture.detectChanges();
    expect(fixture.componentInstance.arrivalLines()).toHaveLength(1);
  });

  it('keeps the full line name and displays the direction underneath in the route list', () => {
    fixture.componentRef.setInput('routes', [
      { ...route, destination: 'Term. Pirituba', directionId: 0 },
    ]);
    fixture.detectChanges();

    expect(
      fixture.nativeElement
        .querySelector('.route-label .route-line-name')
        ?.textContent?.trim(),
    ).toBe(route.longName);
    expect(
      fixture.nativeElement
        .querySelector('.route-label .route-direction')
        ?.textContent?.trim(),
    ).toBe('Sentido Term. Pirituba');
  });

  it('keeps full-mode arrival details inside the matching route panel', () => {
    fixture.componentInstance.arrivals.set(
      createArrivals({ ...line, vs: [createVehicle(847)] }),
    );
    fixture.detectChanges();
    const routeHeader = fixture.nativeElement.querySelector(
      '.route-panel-header',
    ) as HTMLElement;

    expect(fixture.nativeElement.querySelector('.arrival-line')).toBeNull();
    expect(routeHeader.querySelector('.route-next-arrival')).toBeNull();

    expandRoute();

    expect(fixture.nativeElement.querySelectorAll('.arrival-line')).toHaveLength(1);
    expect(
      fixture.nativeElement.querySelector('.line-destination')?.textContent,
    ).toContain('TERM. PIRITUBA');
    expect(
      fixture.nativeElement.querySelector('.vehicle-id')?.textContent,
    ).toContain('Veículo 847');
  });

  it('keeps same-code directions separate and shows estimates only while closed', () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 9, 10, 12, 0));
    const inboundRoute: BusRouteGraphQL = {
      ...route,
      favoriteCode: 'saved-inbound',
      destination: 'Term. Pirituba',
      directionId: 0,
    };
    const outboundRoute: BusRouteGraphQL = {
      ...route,
      favoriteCode: 'saved-outbound',
      destination: 'Vl. Olímpia',
      directionId: 1,
    };
    const timedArrivals = createArrivals(line);
    fixture.componentRef.setInput('routes', [inboundRoute, outboundRoute]);
    fixture.componentInstance.arrivals.set({
      ...timedArrivals,
      p: {
        ...timedArrivals.p,
        l: [
          { ...line, vs: [createVehicle(1, '12:03')] },
          {
            ...line,
            sl: 1,
            vs: [createVehicle(2, '12:08')],
          },
        ],
      },
    });
    fixture.detectChanges();

    const headerFor = (routeCode: string) =>
      Array.from(
        fixture.nativeElement.querySelectorAll('.route-panel-header'),
      ).find(
        (header) =>
          header
            .querySelector('.route-direction')
            ?.textContent?.includes(routeCode),
      ) as HTMLElement;
    const firstHeader = headerFor('Term. Pirituba');
    const secondHeader = headerFor('Vl. Olímpia');

    expect(firstHeader.querySelector('.route-next-arrival')?.textContent).toContain(
      '3 min',
    );
    expect(firstHeader.querySelector('.route-badge')?.textContent).toContain(
      route.shortName,
    );
    expect(
      firstHeader.querySelector('.route-next-arrival mat-icon')?.textContent,
    ).toContain('schedule');
    expect(secondHeader.querySelector('.route-next-arrival')?.textContent).toContain(
      '8 min',
    );
    expect(secondHeader.querySelector('.route-badge')?.textContent).toContain(
      route.shortName,
    );
    expect(firstHeader.querySelector('.vehicle-count')).toBeNull();
    expect(secondHeader.querySelector('.vehicle-count')).toBeNull();

    firstHeader.click();
    fixture.detectChanges();

    expect(firstHeader.querySelector('.route-next-arrival')).toBeNull();
    expect(secondHeader.querySelector('.route-next-arrival')?.textContent).toContain(
      '8 min',
    );
  });

  it('counts route notices even without arrivals and keeps them after rail stations', () => {
    const api = TestBed.inject(BusInformationService);
    const query = api.notices as jest.Mock;
    const result = {
      status: 'AVAILABLE',
      lastUpdated: '2026-09-07T07:30:00Z',
      notices: [
        {
          sourceId: '1',
          sourceUrl: 'https://www.sptrans.com.br/informativos/oeste/exemplo/1/',
          title: 'Desvio de itinerário',
          description: '07/09/2026\n847P-10 Destino\nIda: via alternativa.',
          periodText: '07/09/2026',
          routes: ['847P-10'],
          listedDate: '7 de setembro',
          listing: 'RECENT',
        },
      ],
    };
    fixture.componentInstance.busNotices.set(result);
    const noArrivalUpdate = createArrivals(line);
    fixture.componentInstance.arrivals.set({
      ...noArrivalUpdate,
      p: { ...noArrivalUpdate.p, l: [] },
    });
    fixture.componentInstance.isLoading.set(false);
    fixture.detectChanges();

    expandRoute();
    const directionList = fixture.nativeElement.querySelector(
      '.direction-list',
    ) as HTMLElement;
    const diversions = fixture.nativeElement.querySelector(
      '.route-diversions',
    ) as HTMLElement;
    expect(diversions?.textContent).toContain('Desvios (1)');
    expect(directionList.compareDocumentPosition(diversions)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(fixture.nativeElement.querySelector('.arrival-line')).toBeNull();

    const diversionsHeader = diversions.querySelector(
      'mat-expansion-panel-header',
    ) as HTMLElement;
    diversionsHeader.click();
    fixture.detectChanges();
    expect(
      diversions.querySelector('app-bus-information button')?.textContent,
    ).toContain('Desvio');

    const count = query.mock.calls.length;
    fixture.componentInstance.arrivals.update((value) =>
      value ? { ...value, hr: '12:01' } : value,
    );
    fixture.detectChanges();
    expect(query).toHaveBeenCalledTimes(count);
  });

  it('shows a programmed departure in the embedded summary before expanding', () => {
    const scheduledRoute: BusRouteGraphQL = {
      ...route,
      routeId: 'artesp:001',
      shortName: '001',
      sourceAgency: 'ARTESP',
      supportsRealtime: false,
      destination: 'Centro',
      directionId: 0,
    };
    const departure: ScheduledBusDepartureGraphQL = {
      routeId: scheduledRoute.routeId,
      routeShortName: scheduledRoute.shortName,
      tripId: 'scheduled-trip',
      headsign: 'Centro',
      directionId: 0,
      departureTime: '2026-10-12T14:05:00-03:00',
      sourceAgency: 'ARTESP',
    };
    jest.spyOn(TestBed.inject(GeographyGraphQLService), 'getScheduledBusDepartures')
      .mockReturnValue(of([departure]));
    fixture.componentRef.setInput('stop', {
      ...stop,
      stopId: 'artesp:42',
      sourceAgency: 'ARTESP',
    });
    fixture.componentRef.setInput('routes', [scheduledRoute]);
    fixture.componentRef.setInput('embedded', true);
    fixture.detectChanges();
    fixture.detectChanges();

    const header = fixture.nativeElement.querySelector('.route-panel-header') as HTMLElement;
    expect(fixture.nativeElement.querySelector('mat-card')).toBeNull();
    expect(header.querySelector('.route-next-arrival')?.textContent).toContain('14:05');
    expect(header.querySelector('.route-next-arrival')?.textContent).toContain('Programado');
    expect(fixture.nativeElement.querySelector('.scheduled-list')).toBeNull();

    expandRoute();

    expect(fixture.nativeElement.querySelector('.scheduled-time')?.textContent).toContain('14:05');
    expect(header.querySelector('.route-next-arrival')).toBeNull();
  });

  it('shows one departure per route and expands only that route to five', () => {
    const departures: ScheduledBusDepartureGraphQL[] = Array.from(
      { length: 7 },
      (_, index) => ({
        routeId: 'artesp:001',
        routeShortName: '001',
        tripId: `artesp:trip-${index}`,
        headsign: 'Centro',
        directionId: 0,
        departureTime: `2026-09-07T14:${String(index * 5).padStart(2, '0')}:00-03:00`,
        sourceAgency: 'ARTESP',
      }),
    );
    departures.push({
      ...departures[0],
      routeId: 'artesp:002',
      tripId: 'artesp:other-trip',
      routeShortName: '002',
    });
    const getDepartures = jest
      .spyOn(
        TestBed.inject(GeographyGraphQLService),
        'getScheduledBusDepartures',
      )
      .mockReturnValue(of(departures));
    fixture.componentRef.setInput('stop', {
      ...stop,
      stopId: 'artesp:42',
      sourceAgency: 'ARTESP',
    });
    fixture.componentRef.setInput('compact', true);
    fixture.detectChanges();
    fixture.detectChanges();

    expect(getDepartures).toHaveBeenCalledWith('artesp:42', 5);
    expect(
      fixture.nativeElement.querySelectorAll('.scheduled-group'),
    ).toHaveLength(2);
    expect(
      fixture.nativeElement.querySelectorAll('.scheduled-time'),
    ).toHaveLength(2);
    const toggle = fixture.nativeElement.querySelector(
      '.schedule-toggle',
    ) as HTMLButtonElement;
    expect(toggle.textContent).toContain('Ver 5 horários');
    toggle.click();
    fixture.detectChanges();
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(
      fixture.nativeElement
        .querySelectorAll('.scheduled-group')[0]
        .querySelectorAll('.scheduled-time'),
    ).toHaveLength(5);
    expect(
      fixture.nativeElement
        .querySelectorAll('.scheduled-group')[1]
        .querySelectorAll('.scheduled-time'),
    ).toHaveLength(1);
    toggle.click();
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelectorAll('.scheduled-time'),
    ).toHaveLength(2);
  });

  it('renders the destination selected by the OlhoVivo direction', () => {
    expandRoute();
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
    const displayedRoute = {
      ...route,
      destination: 'Term. Pirituba',
      directionId: 0,
    };
    fixture.componentRef.setInput('routes', [displayedRoute]);
    fixture.detectChanges();
    fixture.componentInstance.railConnections.set(
      new Map([
        [
          displayedRoute.routeId,
          {
            ...connection,
            directions: [
              {
                directionId: 1,
                headsign: 'Term. Pirituba',
                stations: [
                  { ...createStation('vila-madalena', 'Vila Madalena'), stopsUntil: 3 },
                  { ...createStation('pinheiros', 'Pinheiros'), stopsUntil: 8 },
                ],
              },
            ],
          },
        ],
      ]),
    );
    fixture.detectChanges();
    expandRoute();
    const connectionsSection = fixture.nativeElement.querySelector(
      '.route-rail-connections',
    ) as HTMLElement;
    const arrivalsSection = fixture.nativeElement.querySelector(
      '.route-arrivals',
    ) as HTMLElement;
    expect(connectionsSection.getAttribute('aria-label')).toBe(
      'Estações de metrô e trem atendidas',
    );
    expect(
      connectionsSection.querySelector('.route-detail-title')?.textContent,
    ).toContain('Estações de metrô e trem atendidas');
    expect(connectionsSection.classList).toContain('separated-section');
    expect(arrivalsSection.compareDocumentPosition(connectionsSection)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    const station = fixture.nativeElement.querySelector(
      '.route-rail-connections .rail-station',
    ) as HTMLElement;

    expect(
      station.querySelector('.station-line-badge')?.textContent?.trim(),
    ).toBe('2');
    expect(
      station.querySelector('.station-line-badge')?.getAttribute('aria-label'),
    ).toBe('Linha 2');
    expect(
      station.querySelector('.rail-station-name')?.textContent?.trim(),
    ).toBe('Vila Madalena');
    expect(
      station.querySelector('.rail-station-distance')?.textContent?.trim(),
    ).toBe('Parada da linha a 131 m da estação');
    expect(
      Array.from(
        fixture.nativeElement.querySelectorAll('.rail-station-spacing > span'),
      ).map((spacing: Element) => spacing.textContent?.trim()),
    ).toEqual([
      'Em 3 paradas',
      'Mais 5 paradas',
    ]);
  });

  it('does not format invalid station distances', () => {
    for (const distanceMeters of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
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

type StopArrivalsWithPoint = Omit<StopArrivalUpdate, 'p'> & {
  p: NonNullable<StopArrivalUpdate['p']>;
};

function createArrivals(line: LineWithVehicles): StopArrivalsWithPoint {
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

function createVehicle(p: number, t?: string) {
  return {
    p,
    a: false,
    ta: '2026-10-10T12:00:00.000Z',
    py: 0,
    px: 0,
    ...(t === undefined ? {} : { t }),
  };
}
