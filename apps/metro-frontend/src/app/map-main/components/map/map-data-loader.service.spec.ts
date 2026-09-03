import { TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { throwError } from 'rxjs';
import { LoggerService } from '@metro/shared/api';
import { GeographyGraphQLService } from '../../services/geography-graphql.service';
import { VectorTileLayerService } from '../../services/vector-tile-layer.service';
import { MapDataLoaderService } from './map-data-loader.service';
import { MapStateService } from './map-state.service';

describe('MapDataLoaderService', () => {
  let service: MapDataLoaderService;
  let geographyService: {
    getRouteFullData: jest.Mock;
    getStopFullData: jest.Mock;
  };
  let logger: { debug: jest.Mock; error: jest.Mock; warn: jest.Mock };
  let snackBar: { open: jest.Mock };

  beforeEach(() => {
    const error = new Error('request timed out');
    geographyService = {
      getRouteFullData: jest.fn(() => throwError(() => error)),
      getStopFullData: jest.fn(() => throwError(() => error)),
    };
    logger = {
      debug: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
    };
    snackBar = { open: jest.fn() };

    TestBed.configureTestingModule({
      providers: [
        MapDataLoaderService,
        MapStateService,
        { provide: GeographyGraphQLService, useValue: geographyService },
        {
          provide: VectorTileLayerService,
          useValue: {
            setBusRouteIds: jest.fn(),
            setBusStopFilter: jest.fn(),
          },
        },
        { provide: MatSnackBar, useValue: snackBar },
        { provide: LoggerService, useValue: logger },
      ],
    });

    service = TestBed.inject(MapDataLoaderService);
  });

  it('reports a failed route-data request in Brazilian Portuguese', async () => {
    await service.loadRouteData('route-1');

    expect(logger.error).toHaveBeenCalledWith(
      'Error loading route data',
      expect.any(Error),
    );
    expect(snackBar.open).toHaveBeenCalledWith(
      'Não foi possível carregar os dados da rota',
      'Fechar',
      { duration: 3000 },
    );
  });

  it('keeps a background stop-data failure silent', async () => {
    await service.loadStopData('stop-1', false);

    expect(logger.error).toHaveBeenCalledWith(
      'Error loading stop data',
      expect.any(Error),
    );
    expect(snackBar.open).not.toHaveBeenCalled();
  });
});
