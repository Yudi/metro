import { TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { LoggerService } from '@metro/shared/api';
import { MapFeatureInteractionService } from './map-feature-interaction.service';
import { MapStateService } from './map-state.service';
import { MapDisplayService } from './map-display.service';
import { MapService } from '../../services/map.service';
import { BikeStationsService } from '../../services/bike-stations.service';
import { VectorTileLayerService } from '../../services/vector-tile-layer.service';
import { MapDetailsDialogService } from './map-details-dialog.service';
import { MapSelectionService } from './map-selection.service';

describe('MapFeatureInteractionService', () => {
  let service: MapFeatureInteractionService;
  let snackBar: { open: jest.Mock };

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
          useValue: { zoomToFeatures: jest.fn(), zoomLevel: jest.fn(() => 12) },
        },
        {
          provide: BikeStationsService,
          useValue: { upsertStationSummary: jest.fn(), stations: jest.fn(() => []) },
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

    expect(snackBar.open).toHaveBeenCalledWith(
      'Linha L8 rumo a Itapevi: Posição estimada entre Osasco e Comandante Sampaio.',
      'Fechar',
      { duration: 5000 },
    );
    expect(snackBar.open.mock.calls[0][0]).not.toContain('Ônibus');
    expect(snackBar.open.mock.calls[0][0]).not.toContain('estimate-uuid');
    expect(snackBar.open.mock.calls[0][0]).not.toContain('previsões');
  });
});
