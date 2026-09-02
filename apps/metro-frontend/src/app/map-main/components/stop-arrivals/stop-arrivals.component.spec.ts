import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import {
  BusRouteGraphQL,
  BusStopGraphQL,
  GeographyGraphQLService,
  RouteRailConnectionGraphQL,
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
      getRouteRailConnectionsForStop: jest.fn(() => of([connection])),
    };

    await TestBed.configureTestingModule({
      imports: [StopArrivalsComponent],
      providers: [
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

  it('renders the station distance while preserving agency and line metadata', () => {
    const station = fixture.nativeElement.querySelector(
      '.rail-service .rail-station',
    ) as HTMLElement;

    expect(
      station.querySelector('.rail-station-meta')?.textContent?.trim(),
    ).toBe('metro · Verde');
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
