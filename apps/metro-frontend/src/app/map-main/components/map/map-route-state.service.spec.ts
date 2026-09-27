import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { convertToParamMap } from '@angular/router';
import {
  FavoritesService,
  LoggerService,
  RailGraphqlService,
} from '@metro/shared/api';
import { BikeStationsService } from '../../geography/bike-stations.service';
import { MapRouteStateService } from './map-route-state.service';
import { MapService } from './map.service';
import { MapStateService } from './map-state.service';
import { MapDataLoaderService } from './map-data-loader.service';
import { MapDisplayService } from './map-display.service';
import { MapInteractionService } from './map-interaction.service';
import { MapViewStateStorageService } from './map-view-state-storage.service';

describe('map destinations from the omnibox', () => {
  it('applies rail selection and visible layers once when route state is replayed', () => {
    const addRailLineToSelection = jest.fn();
    const setLayerVisibility = jest.fn();
    const layers = { setLayerVisibility };
    TestBed.configureTestingModule({
      providers: [
        MapRouteStateService,
        {
          provide: MapService,
          useValue: {
            center: signal(null),
            zoomLevel: signal(null),
            getMap: () => null,
            getLayerService: () => layers,
            getVectorTileLayerService: () => layers,
          },
        },
        { provide: MapStateService, useValue: {} },
        { provide: MapDataLoaderService, useValue: {} },
        { provide: MapDisplayService, useValue: {} },
        {
          provide: MapInteractionService,
          useValue: { addRailLineToSelection },
        },
        { provide: BikeStationsService, useValue: {} },
        { provide: RailGraphqlService, useValue: {} },
        { provide: FavoritesService, useValue: { favorites: signal({}) } },
        {
          provide: MapViewStateStorageService,
          useValue: { defaultStateRequests: signal(0) },
        },
        { provide: LoggerService, useValue: { debug: jest.fn() } },
      ],
    });
    const state = TestBed.inject(MapRouteStateService);
    const params = convertToParamMap({
      railRoutes: 'L9',
      subwayRoutes: '1',
      subwayStations: '1',
    });
    state.applyRouteState(params);
    state.applyRouteState(params);
    expect(addRailLineToSelection).toHaveBeenCalledTimes(1);
    expect(addRailLineToSelection).toHaveBeenCalledWith('L9');
    expect(setLayerVisibility).toHaveBeenCalledWith('rail-routes', true);
  });
});
