import { TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { LoggerService } from '@metro/shared/api';
import { Observable, Subject, of } from 'rxjs';
import { BikeStation } from './map.types';
import {
  BusRouteGraphQL,
  BusStopGraphQL,
  GeographyGraphQLService,
  StopFullDataSnapshot,
} from '../../geography/geography-graphql.service';
import { BikeStationsService } from '../../geography/bike-stations.service';
import { MapDetailsDialogService } from './map-details-dialog.service';
import { MapDisplayService } from './map-display.service';
import { MapPanelService } from './map-panel/map-panel.service';
import { MapSelectionService } from './map-selection.service';
import { MapStateService } from './map-state.service';

const stop: BusStopGraphQL = {
  id: 'stop-1',
  stopId: 'stop-1',
  name: 'Praça da Sé',
  latitude: -23.5505,
  longitude: -46.6333,
  isSubwayStation: false,
};

function createBikeStation(
  stationId: string,
  name: string,
  bikes: number,
  docks: number,
): BikeStation {
  return {
    stationId,
    name,
    latitude: -23.55,
    longitude: -46.63,
    address: null,
    capacity: 20,
    effectiveCapacity: 20,
    numBikesAvailable: bikes,
    numBikesDisabled: 0,
    numDocksAvailable: docks,
    numDocksDisabled: 0,
    status: 'IN_SERVICE',
    isInstalled: true,
    isRenting: true,
    isReturning: true,
    lastReported: 0,
    lastReportedIso: '2026-09-27T00:00:00.000Z',
    fetchedAt: 0,
    electricBikesAvailable: 0,
    hasElectricBikesAvailable: false,
    vehicleAvailability: [],
    detailsLoaded: false,
  };
}

describe('MapDetailsDialogService map-panel lifecycle', () => {
  let service: MapDetailsDialogService;
  let panelService: MapPanelService;
  let mapState: MapStateService;
  let geographyService: {
    watchStopFullData: jest.Mock<Observable<StopFullDataSnapshot>, [string]>;
  };
  let selectionService: {
    addStopToSelection: jest.Mock;
    addRouteToSelection: jest.Mock;
    addBikeStationToSelection: jest.Mock;
  };
  let bikeStationRecords: Map<string, BikeStation>;

  beforeEach(() => {
    mapState = new MapStateService();
    geographyService = {
      watchStopFullData: jest.fn(() => of({ stop: null, hasNext: false })),
    };
    selectionService = {
      addStopToSelection: jest.fn(),
      addRouteToSelection: jest.fn(),
      addBikeStationToSelection: jest.fn(),
    };
    bikeStationRecords = new Map();

    TestBed.configureTestingModule({
      providers: [
        MapDetailsDialogService,
        MapPanelService,
        { provide: MapStateService, useValue: mapState },
        { provide: GeographyGraphQLService, useValue: geographyService },
        {
          provide: BikeStationsService,
          useValue: {
            ensureStationDetails: jest.fn(),
            getStation: (stationId: string) =>
              bikeStationRecords.get(stationId),
          },
        },
        { provide: MapSelectionService, useValue: selectionService },
        { provide: MapDisplayService, useValue: { updateMapDisplay: jest.fn() } },
        { provide: MatSnackBar, useValue: { open: jest.fn() } },
        {
          provide: LoggerService,
          useValue: {
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
          },
        },
      ],
    });

    service = TestBed.inject(MapDetailsDialogService);
    panelService = TestBed.inject(MapPanelService);
  });

  afterEach(() => {
    panelService.clear();
    TestBed.resetTestingModule();
  });

  it('does not reopen a stop after the user closes its loading panel', async () => {
    const stopRequest = new Subject<StopFullDataSnapshot>();
    const teardown = jest.fn();
    geographyService.watchStopFullData.mockReturnValue(
      new Observable((subscriber) => {
        const inner = stopRequest.subscribe(subscriber);
        return () => {
          teardown();
          inner.unsubscribe();
        };
      }),
    );

    const pendingDetails = service.showRoutesForStop(stop.stopId);
    expect(panelService.panel()?.title).toBe('Parada stop-1');

    panelService.close();
    stopRequest.next({ stop, hasNext: true });
    stopRequest.complete();
    await pendingDetails;

    expect(panelService.panel()).toBeNull();
    expect(teardown).toHaveBeenCalledTimes(1);
    expect(geographyService.watchStopFullData).toHaveBeenCalledWith(stop.stopId);
  });

  it('does not replace a newer vehicle panel when deferred stop data resolves late', async () => {
    const stopRequest = new Subject<StopFullDataSnapshot>();
    geographyService.watchStopFullData.mockReturnValue(stopRequest.asObservable());

    const pendingDetails = service.showRoutesForStop(stop.stopId);
    stopRequest.next({ stop, hasNext: true });

    panelService.openNotice({
      title: 'Trem S048',
      summary: 'Linha 11 - Coral',
      icon: 'train',
    });
    stopRequest.next({ stop, routes: [], hasNext: false });
    await pendingDetails;

    expect(panelService.panel()?.title).toBe('Trem S048');
  });

  it('shows known stop details immediately and fills routes when the patch arrives', async () => {
    const stopRequest = new Subject<StopFullDataSnapshot>();
    geographyService.watchStopFullData.mockReturnValue(stopRequest.asObservable());

    const pendingDetails = service.showRoutesForStop(stop.stopId, stop);
    const firstPanel = panelService.panel();
    expect(firstPanel?.title).toBeDefined();
    expect(firstPanel?.component).toBeTruthy();
    expect((firstPanel?.ref.data as { routesLoading: boolean }).routesLoading).toBe(true);

    const updatedStop = { ...stop, name: 'Praça da Sé - atualizado' };
    stopRequest.next({ stop: updatedStop, hasNext: true });
    const route: BusRouteGraphQL = {
      id: 'route-100',
      routeId: 'route-100',
      shortName: '100',
      longName: 'Centro - Praça da Sé',
      color: '112233',
      textColor: 'FFFFFF',
    };
    stopRequest.next({ stop: updatedStop, routes: [{ route }], hasNext: false });
    stopRequest.complete();
    await pendingDetails;

    expect(panelService.panel()?.id).toBe(firstPanel?.id);
    expect((firstPanel?.ref.data as { routesLoading: boolean }).routesLoading).toBe(false);
    expect((firstPanel?.ref.data as { routes: BusRouteGraphQL[] }).routes).toEqual([route]);
    const title = panelService.panel()?.title;
    expect(typeof title === 'function' ? title() : title).toBe(updatedStop.name);
    expect(panelService.panel()?.id).toBe(firstPanel?.id);
  });

  it('shows a route error when the stop arrives but the deferred patch fails', async () => {
    const stopRequest = new Subject<StopFullDataSnapshot>();
    geographyService.watchStopFullData.mockReturnValue(stopRequest.asObservable());

    const pendingDetails = service.showRoutesForStop(stop.stopId, stop);
    const firstPanel = panelService.panel();
    stopRequest.next({ stop, hasNext: true });
    stopRequest.next({
      stop,
      hasNext: false,
      errors: [{ message: 'route resolver failed', path: ['stopFullData', 'routes'] }],
    });
    stopRequest.complete();
    await pendingDetails;

    expect((firstPanel?.ref.data as { routesLoading: boolean }).routesLoading).toBe(false);
    expect((firstPanel?.ref.data as { routesError: boolean }).routesError).toBe(true);
  });

  it.each([
    { action: 'add', stopId: stop.stopId },
    { action: 'selectRoute', routeId: 'route-100' },
  ])('keeps stop-panel actions active after the incremental query completes', async (result) => {
    const stopRequest = new Subject<StopFullDataSnapshot>();
    geographyService.watchStopFullData.mockReturnValue(stopRequest.asObservable());

    const pendingDetails = service.showRoutesForStop(stop.stopId, stop);
    stopRequest.next({ stop, routes: [], hasNext: false });
    stopRequest.complete();
    await pendingDetails;

    panelService.panel()?.ref.close(result);

    if (result.action === 'add') {
      expect(selectionService.addStopToSelection).toHaveBeenCalledWith(
        stop.stopId,
        true,
        expect.any(Observable),
      );
    } else {
      expect(selectionService.addRouteToSelection).toHaveBeenCalledWith('route-100', true);
    }
  });

  it.each([
    { name: 'while routes are pending', completeBeforeAdd: false },
    { name: 'after routes complete', completeBeforeAdd: true },
  ])('reuses the stop stream when adding from the panel $name', async ({ completeBeforeAdd }) => {
    const stopRequest = new Subject<StopFullDataSnapshot>();
    geographyService.watchStopFullData.mockReturnValue(stopRequest.asObservable());
    const route: BusRouteGraphQL = {
      id: 'route-100',
      routeId: 'route-100',
      shortName: '100',
      longName: 'Centro - Praça da Sé',
      color: '112233',
      textColor: 'FFFFFF',
    };
    const routePatch: StopFullDataSnapshot = {
      stop,
      routes: [{ route }],
      hasNext: false,
    };
    const selectedUpdates: StopFullDataSnapshot[][] = [];
    selectionService.addStopToSelection.mockImplementation(
      (
        _stopId: string,
        _shouldDisplaySnackbar: boolean,
        updates: Observable<StopFullDataSnapshot>,
      ) => {
        const received: StopFullDataSnapshot[] = [];
        selectedUpdates.push(received);
        updates.subscribe((snapshot) => received.push(snapshot));
      },
    );

    const pendingDetails = service.showRoutesForStop(stop.stopId, stop);
    if (completeBeforeAdd) {
      stopRequest.next(routePatch);
      stopRequest.complete();
      await pendingDetails;
    } else {
      stopRequest.next({ stop, hasNext: true });
    }

    panelService.panel()?.ref.close({ action: 'add', stopId: stop.stopId });
    await pendingDetails;

    if (!completeBeforeAdd) {
      stopRequest.next(routePatch);
      stopRequest.complete();
    }

    expect(geographyService.watchStopFullData).toHaveBeenCalledTimes(1);
    expect(selectionService.addStopToSelection).toHaveBeenCalledWith(
      stop.stopId,
      true,
      expect.any(Observable),
    );
    expect(selectedUpdates[0]).toContainEqual(routePatch);
  });

  it('switches bike details to the newly selected station and keeps its summary live', () => {
    const firstStation = createBikeStation('bike-1', 'República', 4, 7);
    const secondStation = createBikeStation('bike-2', 'Luz', 2, 5);
    bikeStationRecords.set(firstStation.stationId, firstStation);
    bikeStationRecords.set(secondStation.stationId, secondStation);
    mapState.setBikeStations([firstStation, secondStation]);

    service.showBikeStationDetails(firstStation.stationId);
    const firstPanelId = panelService.panel()?.id;

    service.showBikeStationDetails(secondStation.stationId);
    const secondPanel = panelService.panel();

    expect(secondPanel?.id).not.toBe(firstPanelId);
    const title = secondPanel?.title;
    expect(typeof title === 'function' ? title() : title).toBe('Luz');

    mapState.setBikeStations([
      firstStation,
      createBikeStation('bike-2', 'Luz', 6, 3),
    ]);
    const summary = secondPanel?.summary;

    expect(typeof summary === 'function' ? summary() : summary).toBe(
      '6 bicicletas · 3 vagas livres',
    );
  });

  it('shows the bike station name when details arrive after the first click', () => {
    const loadingStation = createBikeStation('bike-1', '', 4, 7);
    bikeStationRecords.set(loadingStation.stationId, loadingStation);
    mapState.setBikeStations([loadingStation]);

    service.showBikeStationDetails(loadingStation.stationId);
    const panel = panelService.panel();
    const title = panel?.title;
    expect(typeof title === 'function' ? title() : title).toBe(
      'Carregando estação',
    );

    mapState.setBikeStations([createBikeStation('bike-1', 'República', 4, 7)]);

    expect(typeof title === 'function' ? title() : title).toBe('República');
    expect(panelService.panel()?.id).toBe(panel?.id);
  });
});
