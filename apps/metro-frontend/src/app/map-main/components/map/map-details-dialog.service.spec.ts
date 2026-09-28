import { TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { LoggerService } from '@metro/shared/api';
import { Observable, Subject, of } from 'rxjs';
import { BikeStation } from './map.types';
import {
  BusRouteGraphQL,
  BusStopGraphQL,
  GeographyGraphQLService,
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
    getBusStop: jest.Mock<Observable<BusStopGraphQL | null>, [string]>;
    getRoutesForStop: jest.Mock<Observable<BusRouteGraphQL[]>, [string]>;
  };
  let bikeStationRecords: Map<string, BikeStation>;

  beforeEach(() => {
    mapState = new MapStateService();
    geographyService = {
      getBusStop: jest.fn(() => of(null)),
      getRoutesForStop: jest.fn(() => of([])),
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
        { provide: MapSelectionService, useValue: { addStopToSelection: jest.fn(), addRouteToSelection: jest.fn(), addBikeStationToSelection: jest.fn() } },
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
    const stopRequest = new Subject<BusStopGraphQL | null>();
    geographyService.getBusStop.mockReturnValue(stopRequest.asObservable());

    const pendingDetails = service.showRoutesForStop(stop.stopId);
    expect(panelService.panel()?.title).toBe('Carregando parada');

    panelService.close();
    stopRequest.next(stop);
    stopRequest.complete();
    await pendingDetails;

    expect(panelService.panel()).toBeNull();
    expect(geographyService.getRoutesForStop).not.toHaveBeenCalled();
  });

  it('does not replace a newer vehicle panel when stop routes resolve late', async () => {
    const routeRequest = new Subject<BusRouteGraphQL[]>();
    geographyService.getBusStop.mockReturnValue(of(stop));
    geographyService.getRoutesForStop.mockReturnValue(routeRequest.asObservable());

    const pendingDetails = service.showRoutesForStop(stop.stopId);
    await Promise.resolve();
    expect(geographyService.getRoutesForStop).toHaveBeenCalledWith(stop.stopId);

    panelService.openNotice({
      title: 'Trem S048',
      summary: 'Linha 11 - Coral',
      icon: 'train',
    });
    routeRequest.next([]);
    routeRequest.complete();
    await pendingDetails;

    expect(panelService.panel()?.title).toBe('Trem S048');
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
