import { TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { of, Subject } from 'rxjs';
import { GeographyGraphQLService, BusRouteGraphQL } from '../../geography/geography-graphql.service';
import { LoggerService } from '@metro/shared/api';
import { MapFeatureInteractionService } from './map-feature-interaction.service';
import { MapStateService } from './map-state.service';
import { MapDisplayService } from './map-display.service';
import { MapService } from './map.service';
import { BikeStationsService } from '../../geography/bike-stations.service';
import { VectorTileLayerService, VectorTileLayerType } from './vector-tiles/vector-tile-layer.service';
import { MapDetailsDialogService } from './map-details-dialog.service';
import { MapSelectionService } from './map-selection.service';
import { MapPanelService } from './map-panel/map-panel.service';
import { BusVehicleDetailsComponent } from './bus-vehicle-details.component';

describe('MapFeatureInteractionService', () => {
  let service: MapFeatureInteractionService;
  let snackBar: { open: jest.Mock };
  let panels: MapPanelService;

  beforeEach(() => {
    snackBar = { open: jest.fn() };
    TestBed.configureTestingModule({
      providers: [
        MapFeatureInteractionService,
        MapStateService,
        { provide: MatSnackBar, useValue: snackBar },
        {
          provide: LoggerService,
          useValue: {
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
          },
        },
        {
          provide: MapService,
          useValue: { focusFeature: jest.fn(), zoomToFeatures: jest.fn(), zoomLevel: jest.fn(() => 12) },
        },
        {
          provide: BikeStationsService,
          useValue: {
            upsertStationSummary: jest.fn(),
            stations: jest.fn(() => []),
          },
        },
        {
          provide: VectorTileLayerService,
          useValue: { isVectorTileFeature: jest.fn(() => false) },
        },
        {
          provide: MapDetailsDialogService,
          useValue: {
            showRoutesForStop: jest.fn(),
            showBikeStationDetails: jest.fn(),
            openSubwayStationDialog: jest.fn(),
          },
        },
        {
          provide: MapSelectionService,
          useValue: { addRouteToSelection: jest.fn() },
        },
        { provide: MapDisplayService, useValue: {} },
      ],
    });
    service = TestBed.inject(MapFeatureInteractionService);
    panels = TestBed.inject(MapPanelService);
  });

  it('shows only the latest route click and cancels detail work when leaving the map', () => {
    const older = new Subject<BusRouteGraphQL>();
    const newer = new Subject<BusRouteGraphQL>();
    const afterLeaving = new Subject<BusRouteGraphQL>();
    const getBusRoute = jest.fn().mockReturnValueOnce(older)
      .mockReturnValueOnce(newer).mockReturnValueOnce(afterLeaving);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [
      MapFeatureInteractionService,
      { provide: MatSnackBar, useValue: snackBar },
      { provide: MapStateService, useValue: {} },
      { provide: MapDisplayService, useValue: {} },
      { provide: MapService, useValue: { focusFeature: jest.fn() } },
      { provide: MapDetailsDialogService, useValue: {} },
      { provide: MapSelectionService, useValue: {} },
      { provide: BikeStationsService, useValue: {} },
      { provide: LoggerService, useValue: { debug: jest.fn() } },
      { provide: GeographyGraphQLService, useValue: { getBusRoute } },
      { provide: VectorTileLayerService, useValue: {
        isVectorTileFeature: () => true,
        getFeatureLayerType: () => VectorTileLayerType.BUS_ROUTES,
        extractBusRouteData: (feature: { getId(): string }) => ({ routeId: feature.getId() }),
      } },
    ] });
    service = TestBed.inject(MapFeatureInteractionService);
    snackBar.open.mockReturnValue({ onAction: () => of() });
    const feature = (id: string) => ({ getId: () => id, get: () => undefined, getProperties: () => ({}) });
    const route = (id: string): BusRouteGraphQL => ({ id, routeId: id, shortName: id, longName: id, color: '112233', textColor: 'FFFFFF' });
    service.handleFeatureSelection(feature('A') as never);
    service.handleFeatureSelection(feature('B') as never);
    newer.next(route('B'));
    older.next(route('A'));
    expect(snackBar.open).toHaveBeenCalledTimes(1);
    expect(snackBar.open).toHaveBeenCalledWith('Rota: B', 'Adicionar', { duration: 5000 });
    service.handleFeatureSelection(feature('C') as never);
    service.cancelPendingFeatureDetails();
    afterLeaving.next(route('C'));
    expect(snackBar.open).toHaveBeenCalledTimes(1);
  });

  it('explains an estimated train location without exposing source details', () => {
    const properties = {
      estimatedPosition: true,
      lineCode: 'L8',
      destination: 'Itapevi',
      estimatedPositionDescription: 'entre Osasco e Comandante Sampaio',
      vehicleId: 'estimate-uuid',
    };
    const feature = {
      get: (key: string): unknown => properties[key as keyof typeof properties],
      getProperties: () => properties,
    };

    service.handleFeatureSelection(feature as never);

    expect(panels.panel()).toEqual(
      expect.objectContaining({
        title: 'Linha L8 rumo a Itapevi',
        summary: 'Posição estimada entre Osasco e Comandante Sampaio.',
      }),
    );
    const content = `${panels.panel()?.title}: ${panels.panel()?.summary}`;
    expect(content).not.toContain('Ônibus');
    expect(content).not.toContain('estimate-uuid');
    expect(content).not.toContain('previsões');
  });

  it('shows the train and full rail line name for a tracked vehicle', () => {
    const properties = { vehicleId: 'S048', lineCode: 'L11' };
    service.handleFeatureSelection({
      get: () => undefined,
      getProperties: () => properties,
    } as never);

    expect(panels.panel()).toEqual(
      expect.objectContaining({
        title: 'Trem S048',
        summary: 'Linha 11 - Coral',
      }),
    );
  });

  it('keeps the bus label for bus vehicles', () => {
    const properties = { vehicleId: '1234', routeShortName: '8000-10' };
    service.handleFeatureSelection({
      get: () => undefined,
      getProperties: () => properties,
    } as never);

    expect(panels.panel()).toEqual(
      expect.objectContaining({
        title: 'Ônibus 1234',
        summary: 'Linha 8000-10',
        component: BusVehicleDetailsComponent,
        showSummary: false,
        data: expect.objectContaining({ routeShortName: '8000-10', isCircular: false }),
      }),
    );
  });

  it('shows the sanitized bus plate and GTFS route label in the existing popup', () => {
    const properties = {
      vehicleId: 'ABC1D23',
      routeShortName: '001',
      destination: 'Terminal Centro',
    };
    service.handleFeatureSelection({
      get: () => undefined,
      getProperties: () => properties,
    } as never);

    expect(panels.panel()).toEqual(
      expect.objectContaining({
        title: 'Ônibus ABC1D23',
        summary: 'Linha 001, sentido Terminal Centro',
      }),
    );
  });

  it('shows the destination alongside a selected bus route', () => {
    snackBar.open.mockReturnValue({ onAction: () => of(undefined) });
    const properties = {
      routeId:
        'bus:v1:sptrans:100:-23.5000~-46.6000:-23.5100~-46.6100:-23.5200~-46.6200',
      shortName: '100',
      longName: 'Terminal A - Terminal B',
      destination: 'Terminal Centro',
    };

    service.handleFeatureSelection({
      get: () => undefined,
      getProperties: () => properties,
    } as never);

    expect(snackBar.open).toHaveBeenCalledWith(
      'Rota: 100, sentido Terminal Centro',
      'Adicionar',
      { duration: 5000 },
    );
  });

  it('opens individual bike MVT details with availability and electric counts intact', () => {
    const tiles = TestBed.inject(VectorTileLayerService);
    const bikes = TestBed.inject(BikeStationsService);
    const details = TestBed.inject(MapDetailsDialogService);
    const summary = {
      stationId: 'station-1', latitude: -23.55, longitude: -46.63,
      capacity: 20, effectiveCapacity: 20,
      numBikesAvailable: 7, electricBikesAvailable: 2,
    };
    Object.assign(tiles, {
      isVectorTileFeature: () => true,
      getFeatureLayerType: () => VectorTileLayerType.BIKE_STATIONS,
      extractBikeStationClusterData: () => null,
      extractBikeStationData: () => summary,
    });
    (bikes.upsertStationSummary as jest.Mock).mockReturnValue(summary);
    service.handleFeatureSelection({
      get: () => undefined, getProperties: () => ({}),
    } as never);
    expect(bikes.upsertStationSummary).toHaveBeenCalledWith(summary);
    expect(details.showBikeStationDetails).toHaveBeenCalledWith('station-1');
  });

  it('zooms into backend bike clusters without downloading station details', () => {
    const tiles = TestBed.inject(VectorTileLayerService);
    const details = TestBed.inject(MapDetailsDialogService);
    const display = TestBed.inject(MapDisplayService);
    const centerOn = jest.fn();
    Object.assign(display, { centerOn });
    Object.assign(tiles, {
      isVectorTileFeature: () => true,
      getFeatureLayerType: () => VectorTileLayerType.BIKE_STATIONS,
      extractBikeStationClusterData: () => ({ latitude: -23.55, longitude: -46.63 }),
    });
    service.handleFeatureSelection({
      get: () => undefined, getProperties: () => ({}),
    } as never);
    expect(centerOn).toHaveBeenCalledWith([-46.63, -23.55], 14);
    expect(details.showBikeStationDetails).not.toHaveBeenCalled();
  });

});
