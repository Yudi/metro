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

  it('selects linked stations and centers on their coordinates', () => {
    const setLayerVisibility = jest.fn();
    const centerOn = jest.fn();
    const addStopToSelection = jest.fn();
    const addBikeStationToSelection = jest.fn();
    const upsertStationSummary = jest.fn();
    const ensureStationDetails = jest.fn();
    const stations = signal<unknown[]>([]);
    const layers = { setLayerVisibility };
    TestBed.configureTestingModule({
      providers: [
        MapRouteStateService,
        {
          provide: MapService,
          useValue: {
            center: signal(null),
            zoomLevel: signal(null),
            centerOn,
            getLayerService: () => layers,
            getVectorTileLayerService: () => layers,
          },
        },
        {
          provide: MapStateService,
          useValue: { addStopToSelection, setBikeStations: jest.fn() },
        },
        {
          provide: MapDataLoaderService,
          useValue: { syncVectorTileFilters: jest.fn() },
        },
        {
          provide: MapDisplayService,
          useValue: { updateMapDisplay: jest.fn() },
        },
        {
          provide: MapInteractionService,
          useValue: { addBikeStationToSelection },
        },
        {
          provide: BikeStationsService,
          useValue: {
            stations,
            getStation: jest.fn(() => null),
            upsertStationSummary,
            ensureStationDetails,
          },
        },
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
    const rail = convertToParamMap({
      railStationId: 'CONS',
      railStationName: 'Consolação',
      lat: '-23.5571',
      lon: '-46.6606',
      z: '16',
      subwayStations: '1',
    });
    state.applyRouteState(rail);
    state.applyRouteState(rail);
    expect(addStopToSelection).toHaveBeenCalledTimes(1);
    expect(addStopToSelection).toHaveBeenCalledWith({
      id: 'CONS',
      name: 'Consolação',
      latitude: -23.5571,
      longitude: -46.6606,
      isSubwayStation: true,
    });
    expect(centerOn).toHaveBeenCalledWith([-46.6606, -23.5571], 16);

    const bike = convertToParamMap({
      bike: '1',
      bikeStationId: 'bike-35',
      bikeStationName: 'Estação 35',
      lat: '-23.5731',
      lon: '-46.6822',
      z: '17',
    });
    state.applyRouteState(bike);
    state.applyRouteState(bike);
    expect(upsertStationSummary).toHaveBeenCalledTimes(1);
    expect(addBikeStationToSelection).toHaveBeenCalledTimes(1);
    expect(addBikeStationToSelection).toHaveBeenCalledWith('bike-35', false);
    expect(ensureStationDetails).toHaveBeenCalledWith('bike-35');
    expect(centerOn).toHaveBeenCalledWith([-46.6822, -23.5731], 17);
  });
});
