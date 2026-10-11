import { signal } from '@angular/core';
import type { WritableSignal } from '@angular/core';
import type { DashboardFavoriteSelections } from '@metro/shared/api';
import {
  emptyFavorites,
  encodeBusDirectionFavorite,
} from '@metro/shared/utils';
import type { FavoriteList } from '@metro/shared/utils';
import type {
  LiteArrivalLine,
  LiteStopArrivalUpdate,
} from '../../shared/realtime/lite-realtime.service';
import type { LiteScheduledBusDeparture } from '../../shared/search/lite-search.service';
import { Dashboard } from './dashboard';
import type { BusRouteGraphQL, BusStopInsight } from './dashboard.types';

interface DashboardHarness
  extends Pick<
    Dashboard,
    | 'getSelectedBusRoutes'
    | 'getBusArrivalLines'
    | 'getScheduledDepartureDestination'
  > {
  busRoutesByStopId: WritableSignal<Map<string, BusRouteGraphQL[]>>;
  busArrivalsByStopId: WritableSignal<Map<string, LiteStopArrivalUpdate>>;
  dashboardSelections: WritableSignal<DashboardFavoriteSelections | null>;
  favorites: WritableSignal<FavoriteList | null>;
  busStopsById: WritableSignal<Map<string, BusStopInsight>>;
}

function createDirectionFavoriteCode(
  favorite: Parameters<typeof encodeBusDirectionFavorite>[0],
): string {
  const code = encodeBusDirectionFavorite(favorite);
  if (!code) {
    throw new Error('Test direction key was invalid');
  }
  return code;
}

describe('Dashboard bus direction selection', () => {
  const towardPinheiros = createDirectionFavoriteCode({
    sourceAgency: 'sptrans',
    shortName: '477A-10',
    originLatitude: -23.55,
    originLongitude: -46.63,
    viaLatitude: -23.555,
    viaLongitude: -46.625,
    destinationLatitude: -23.56,
    destinationLongitude: -46.62,
  });
  const towardSacoma = createDirectionFavoriteCode({
    sourceAgency: 'sptrans',
    shortName: '477A-10',
    originLatitude: -23.56,
    originLongitude: -46.62,
    viaLatitude: -23.555,
    viaLongitude: -46.625,
    destinationLatitude: -23.55,
    destinationLongitude: -46.63,
  });
  const savedTowardPinheiros = createDirectionFavoriteCode({
    sourceAgency: 'sptrans',
    shortName: '477A-10',
    originLatitude: -23.55,
    originLongitude: -46.63,
    viaLatitude: -23.555,
    viaLongitude: -46.625,
    destinationLatitude: -23.56,
    destinationLongitude: -46.6205,
  });
  const routes: BusRouteGraphQL[] = [
    {
      routeId: '477A-10',
      shortName: '477A-10',
      longName: 'Sacomã – Pinheiros',
      favoriteCode: towardPinheiros,
      destination: 'Pinheiros',
      directionId: 0,
    },
    {
      routeId: '477A-10',
      shortName: '477A-10',
      longName: 'Sacomã – Pinheiros',
      favoriteCode: towardSacoma,
      destination: 'Sacomã',
      directionId: 1,
    },
  ];

  function arrivalLine(sl: number): LiteArrivalLine {
    return {
      c: '477A-10',
      cl: 477,
      sl,
      lt0: 'Pinheiros',
      lt1: 'Sacomã',
      qv: 1,
      vs: [],
    };
  }

  function createDashboardHarness(
    selectedKeys: string[],
  ): DashboardHarness {
    const dashboard = Object.create(Dashboard.prototype) as DashboardHarness;
    dashboard.busRoutesByStopId = signal(new Map([['stop-1', routes]]));
    dashboard.busStopsById = signal(new Map());
    dashboard.favorites = signal({ ...emptyFavorites, busStop: ['stop-1'] });
    dashboard.busArrivalsByStopId = signal(
      new Map([
        [
          'stop-1',
          {
            stopCode: '701441',
            hr: '14:32',
            cacheTimestamp: 1,
            p: {
              cp: 701441,
              np: 'Parada',
              py: -23.56,
              px: -46.63,
              l: [arrivalLine(1), arrivalLine(2)],
            },
          },
        ],
      ]),
    );
    dashboard.dashboardSelections = signal({
      busStopRoutes: { 'stop-1': selectedKeys },
      railStationLines: {},
    });
    return dashboard;
  }

  it('keeps both destinations selected for an older whole-route selection', () => {
    const dashboard = createDashboardHarness(['477A-10']);

    expect(dashboard.getSelectedBusRoutes('stop-1')).toEqual(routes);
    expect(dashboard.getBusArrivalLines('stop-1')).toEqual([
      arrivalLine(1),
      arrivalLine(2),
    ]);
  });

  it('filters live arrivals by the selected direction destination', () => {
    const dashboard = createDashboardHarness([towardPinheiros]);

    expect(dashboard.getSelectedBusRoutes('stop-1')).toEqual([routes[0]]);
    expect(dashboard.getBusArrivalLines('stop-1')).toEqual([arrivalLine(1)]);
  });

  it('keeps matching circular favorites against their original destination', () => {
    const circularRoutes = routes.map((route) => ({
      ...route,
      isCircular: true,
    }));
    const dashboard = createDashboardHarness([towardPinheiros]);
    dashboard.busRoutesByStopId.set(new Map([['stop-1', circularRoutes]]));

    expect(dashboard.getSelectedBusRoutes('stop-1')).toEqual([circularRoutes[0]]);
    expect(dashboard.getBusArrivalLines('stop-1')).toEqual([arrivalLine(1)]);
    expect(circularRoutes[0].destination).toBe('Pinheiros');
  });

  it('filters schedules by destination even when two published patterns share a direction number', () => {
    const dashboard = createDashboardHarness([towardPinheiros]);
    const base = { routeId: '477A-10', routeShortName: '477A-10', tripId: 'trip-1', departureTime: '2026-10-10T12:00:00Z', directionId: 0 };
    const outward = { ...base, headsign: 'Pinheiros' };
    dashboard.busSchedulesByStopId = signal(new Map([['stop-1', [outward, { ...base, tripId: 'trip-2', headsign: 'Sacomã' }]]]));
    expect(dashboard.getBusScheduledDepartures('stop-1')).toEqual([outward]);
  });

  it('displays Circular for matching scheduled departures and preserves the destination for matching', () => {
    const circularRoutes = routes.map((route) => ({
      ...route,
      isCircular: true,
    }));
    const dashboard = createDashboardHarness([towardPinheiros]);
    dashboard.busRoutesByStopId.set(new Map([['stop-1', circularRoutes]]));
    const departure: LiteScheduledBusDeparture = {
      routeId: '477A-10',
      routeShortName: '477A-10',
      tripId: 'trip-1',
      headsign: 'Pinheiros',
      directionId: 0,
      departureTime: '2026-10-10T12:00:00Z',
    };

    expect(dashboard.getScheduledDepartureDestination('stop-1', departure)).toBe(
      'Circular',
    );
    expect(dashboard.getSelectedBusRoutes('stop-1')).toEqual([circularRoutes[0]]);
    expect(circularRoutes[0].destination).toBe('Pinheiros');
  });

  it('uses the current destination when GTFS direction numbers differ from realtime', () => {
    const dashboard = createDashboardHarness([towardPinheiros]);
    dashboard.busRoutesByStopId.set(new Map([['stop-1', routes.map((route) => ({ ...route, directionId: route.directionId === 0 ? 1 : 0 }))]]));
    expect(dashboard.getBusArrivalLines('stop-1')).toEqual([arrivalLine(1)]);
  });

  it('keeps a saved direction selected after its current terminal moves slightly', () => {
    const dashboard = createDashboardHarness([savedTowardPinheiros]);

    expect(dashboard.getSelectedBusRoutes('stop-1')).toEqual([routes[0]]);
    expect(dashboard.getBusArrivalLines('stop-1')).toEqual([arrivalLine(1)]);
  });

  it('uses an explicit canonical stop preference ahead of an original alias', () => {
    const dashboard = createDashboardHarness([towardPinheiros]);
    dashboard.favorites.set({ ...emptyFavorites, busStop: ['old-stop'] });
    dashboard.busStopsById.set(
      new Map([
        [
          'old-stop',
          { stopId: 'stop-1', name: 'Parada', routeShortNames: [] },
        ],
      ]),
    );
    dashboard.dashboardSelections.set({
      busStopRoutes: {
        'old-stop': [towardPinheiros],
        'stop-1': [],
      },
      railStationLines: {},
    });

    expect(dashboard.getSelectedBusRoutes('stop-1')).toEqual([]);
  });
});
