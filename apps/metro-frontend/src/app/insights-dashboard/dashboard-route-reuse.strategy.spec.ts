import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ChangeDetectionStrategy, Component, PLATFORM_ID, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, RouteReuseStrategy } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { ApiService, FavoritesService, LoggerService } from '@metro/shared/api';
import { emptyFavorites, getRailStationFavoriteKey } from '@metro/shared/utils';
import { of } from 'rxjs';
import { io } from 'socket.io-client';
import { NextTrainWebsocketService } from '../next-train/next-train-websocket.service';
import { BreathingAnimationService } from '../shared/services/breathing-animation.service';

jest.mock('socket.io-client', () => ({ io: jest.fn() }));
import { spFeatureRoutes } from '../cities/sp/sp.routes';
import { GeographyGraphQLService } from '../map-main/geography/geography-graphql.service';
import { InsightsDashboardComponent } from './insights-dashboard.component';
import { DashboardRouteReuseStrategy } from './dashboard-route-reuse.strategy';

@Component({ template: 'Other tab', changeDetection: ChangeDetectionStrategy.OnPush })
class OtherTabComponent {}

const dashboardRoute = spFeatureRoutes.find(
  (route) => route.path === 'painel',
);

describe('Dashboard tab retention', () => {
  const favorites = signal({ ...emptyFavorites, getRailStationFavoriteKey });

  const listeners = new Map<string, (update: unknown) => void>();
  const socket = {
    connected: true,
    on: jest.fn((event: string, listener: (update: unknown) => void) => {
      listeners.set(event, listener);
      return socket;
    }),
    emit: jest.fn(), disconnect: jest.fn(), connect: jest.fn(),
  };

  beforeEach(() => {
    listeners.clear();
    jest.clearAllMocks();
    (io as jest.Mock).mockReturnValue(socket);
    favorites.set({ ...emptyFavorites, getRailStationFavoriteKey });
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          {
            path: 'sp',
            children: [
              {
                ...dashboardRoute,
                path: 'painel',
                component: InsightsDashboardComponent,
                loadComponent: undefined,
              },
              { path: 'favoritos', component: OtherTabComponent },
            ],
          },
        ]),
        { provide: RouteReuseStrategy, useClass: DashboardRouteReuseStrategy },
        NextTrainWebsocketService,
        { provide: LoggerService, useValue: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() } },
        { provide: BreathingAnimationService, useValue: { breathingBrightness: signal(50), subscribe: () => () => undefined } },
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: PLATFORM_ID, useValue: 'browser' },
        { provide: FavoritesService, useValue: {
          favorites,
          dashboardSelections: signal({ busStopRoutes: {}, railStationLines: {} }),
        } },
        { provide: GeographyGraphQLService, useValue: { getRoutesForStop: () => of([]) } },
        { provide: ApiService, useValue: { getRailStatus: () => of({
          lines: [], specialLines: [], specialInfoCards: [],
          lastUpdated: new Date(), success: true, errorMessage: null,
        }) } },
      ],
    });
  });

  it('restores the same panel and DOM without repeating its initial lookup', async () => {
    const harness = await RouterTestingHarness.create();
    const panel = await harness.navigateByUrl('/sp/painel', InsightsDashboardComponent);
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/graphql').flush({ data: { mergedRailStations: [] } });
    harness.detectChanges();
    const element = harness.routeNativeElement;

    for (let visit = 0; visit < 3; visit++) {
      await harness.navigateByUrl('/sp/favoritos', OtherTabComponent);
      const restored = await harness.navigateByUrl('/sp/painel', InsightsDashboardComponent);
      expect(restored).toBe(panel);
      expect(harness.routeNativeElement).toBe(element);
      http.expectNone('/api/graphql');
    }
    http.verify();
  });

  it('applies favorite changes made in another tab to the retained panel', async () => {
    const harness = await RouterTestingHarness.create();
    const panel = await harness.navigateByUrl('/sp/painel', InsightsDashboardComponent);
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/graphql').flush({ data: { mergedRailStations: [] } });
    await harness.navigateByUrl('/sp/favoritos', OtherTabComponent);
    favorites.set({ ...emptyFavorites, busRoute: ['route-1'] });
    await harness.navigateByUrl('/sp/painel', InsightsDashboardComponent);
    http.expectOne((request) => request.body.variables?.routeIds?.[0] === 'route-1')
      .flush({ data: { multipleBusRoutes: [{ routeId: 'route-1', shortName: '1', longName: 'Test route' }], multipleBusStops: [] } });
    harness.detectChanges();
    expect(panel.busRoutes()[0].routeId).toBe('route-1');
    expect(harness.routeNativeElement?.textContent).toContain('Test route');
    http.verify();
  });

  it('keeps the arrival subscription and receives deltas while another tab is open', async () => {
    favorites.set({ ...emptyFavorites, railStation: [getRailStationFavoriteKey('Pinheiros')] });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/sp/painel', InsightsDashboardComponent);
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/graphql').flush({ data: { mergedRailStations: [
      { id: 'pinheiros', name: 'Pinheiros', lines: ['Esmeralda'] },
    ] } });
    harness.detectChanges();
    await harness.fixture.whenStable();
    const service = TestBed.inject(NextTrainWebsocketService);
    expect(socket.emit).toHaveBeenCalledWith('subscribe_station', { lineCode: 'L9', stationCode: 'PIN' });
    listeners.get('next_train_update')?.({ type: 'full', lineCode: 'L9', stationCode: 'PIN', trains: [], timestamp: 100 });
    await harness.navigateByUrl('/sp/favoritos', OtherTabComponent);
    expect(socket.emit).not.toHaveBeenCalledWith('unsubscribe_station', expect.anything());
    listeners.get('next_train_update')?.({ type: 'delta', lineCode: 'L9', stationCode: 'PIN', trains: [], hasError: true, timestamp: 200 });
    expect(service.getStationData('L9', 'PIN')?.hasError).toBe(true);
    await harness.navigateByUrl('/sp/painel', InsightsDashboardComponent);
    expect(socket.emit.mock.calls.filter(([event]) => event === 'subscribe_station')).toHaveLength(1);
    expect(service.getStationData('L9', 'PIN')?.hasError).toBe(true);
    http.expectNone('/api/graphql');
    // Detached cards must still release their subscriptions when the app is destroyed.
    await harness.navigateByUrl('/sp/favoritos', OtherTabComponent);
    (TestBed.inject(RouteReuseStrategy) as DashboardRouteReuseStrategy).ngOnDestroy();
    expect(socket.emit).toHaveBeenCalledWith('unsubscribe_station', { lineCode: 'L9', stationCode: 'PIN' });
    http.verify();
  });

  it('does not retain server-rendered routes', async () => {
    TestBed.overrideProvider(PLATFORM_ID, { useValue: 'server' });
    const harness = await RouterTestingHarness.create();
    const first = await harness.navigateByUrl('/sp/painel', InsightsDashboardComponent);
    await harness.navigateByUrl('/sp/favoritos', OtherTabComponent);
    const second = await harness.navigateByUrl('/sp/painel', InsightsDashboardComponent);
    expect(second).not.toBe(first);
    TestBed.inject(HttpTestingController).verify();
  });
});
