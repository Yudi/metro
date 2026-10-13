import { DestroyRef, signal } from '@angular/core';
import { MapDataLoaderService } from './map-data-loader.service';
import { TestBed } from '@angular/core/testing';
import { LoggerService } from '@metro/shared/api';
import { BIKE_STATION_FULL } from '@metro/shared/storybook-mocks';
import { CityContextService } from '../../../cities/city-context.service';
import { FeatureFactoryService } from './feature-factory.service';
import { LayerType, MapLayerService } from './layers/map-layer.service';
import { MapLayerStyleService } from './layers/map-layer-style.service';
import { MapCameraService } from './map-camera.service';
import { MapDisplayService } from './map-display.service';
import { MapSelectionDisplayService } from './map-selection-display.service';
import { MapService } from './map.service';
import { MapStateService } from './map-state.service';

describe('MapDisplayService bike tile ownership', () => {
  it('batches overlay mutations, updates route filters independently, and stops on teardown', () => {
    const map = signal<object | null>(null);
    const syncVectorTileFilters = jest.fn();
    const updateSelectedFeatures = jest.fn();
    let disconnect: () => void = () => undefined;
    TestBed.configureTestingModule({ providers: [
      MapDisplayService, MapStateService,
      { provide: CityContextService, useValue: {} },
      { provide: MapCameraService, useValue: {} },
      { provide: FeatureFactoryService, useValue: {} },
      { provide: MapService, useValue: { getMap: map } },
      { provide: MapDataLoaderService, useValue: { syncVectorTileFilters } },
      { provide: MapSelectionDisplayService, useValue: { updateSelectedFeatures } },
    ] });
    const state = TestBed.inject(MapStateService);
    const display = TestBed.inject(MapDisplayService);
    TestBed.runInInjectionContext(() => display.connect({
      destroyed: false,
      onDestroy: (callback: () => void) => { disconnect = callback; return () => undefined; },
    } as DestroyRef));
    TestBed.tick();
    expect(updateSelectedFeatures).not.toHaveBeenCalled();
    map.set({});
    TestBed.tick();
    expect(updateSelectedFeatures).toHaveBeenCalledTimes(1);
    expect(syncVectorTileFilters).toHaveBeenCalledTimes(1);

    state.addRouteToSelection({ id: 'route-1', shortName: '100', longName: 'Centro' });
    TestBed.tick();
    expect(syncVectorTileFilters).toHaveBeenCalledTimes(2);
    expect(updateSelectedFeatures).toHaveBeenCalledTimes(1);

    state.addStopToSelection({ id: 'stop-1', name: 'Sé', latitude: -23.55, longitude: -46.63 });
    state.setBikeStations([]);
    state.addBikeStationToSelection({ id: 'bike-1', name: 'Estação', latitude: -23.55, longitude: -46.63 });
    TestBed.tick();
    expect(updateSelectedFeatures).toHaveBeenCalledTimes(2);
    expect(syncVectorTileFilters).toHaveBeenCalledTimes(3);
    disconnect();
    state.clearAllSelections();
    TestBed.tick();
    expect(updateSelectedFeatures).toHaveBeenCalledTimes(2);
    expect(syncVectorTileFilters).toHaveBeenCalledTimes(3);
  });

  it('renders only selected bike overlays regardless of the detail cache size', () => {
    TestBed.configureTestingModule({
      providers: [
        MapDisplayService, MapStateService, MapLayerService,
        MapSelectionDisplayService, FeatureFactoryService,
        { provide: CityContextService, useValue: {} },
        { provide: MapCameraService, useValue: {} },
        { provide: MapLayerStyleService, useValue: {} },
        { provide: LoggerService, useValue: { debug: jest.fn(), info: jest.fn() } },
        {
          provide: MapService,
          useFactory: (layers: MapLayerService) => ({ getLayerService: () => layers }),
          deps: [MapLayerService],
        },
      ],
    });
    const state = TestBed.inject(MapStateService);
    const layers = TestBed.inject(MapLayerService);
    const display = TestBed.inject(MapDisplayService);
    const factory = TestBed.inject(FeatureFactoryService);
    const createBike = jest.spyOn(factory, 'createBikeStationFeature');
    const stations = Array.from({ length: 1_000 }, (_, index) => ({
      ...BIKE_STATION_FULL, stationId: `station-${index}`, detailsLoaded: true,
    }));
    state.setBikeStations(stations);
    display.updateMapDisplay();
    expect(createBike).not.toHaveBeenCalled();
    expect(layers.getAllLayers()).toHaveLength(1);

    const station = stations[0];
    state.selectedBikeStations.set(new Map([[station.stationId, {
      id: station.stationId, name: station.name,
      latitude: station.latitude, longitude: station.longitude,
    }]]));
    display.updateMapDisplay();
    const marker = layers.getFeaturesFromLayer(LayerType.SELECTION)[0];
    expect(marker.get('stationData')).toBe(station);
    expect(createBike).toHaveBeenCalledTimes(1);
    expect(layers.getAllLayers()).toHaveLength(1);

    const setProperties = jest.spyOn(marker, 'setProperties');
    display.updateMapDisplay();
    expect(createBike).toHaveBeenCalledTimes(1);
    expect(setProperties).not.toHaveBeenCalled();

    const refreshed = { ...station, numBikesAvailable: 9, electricBikesAvailable: 3 };
    state.setBikeStations([refreshed, ...stations.slice(1)]);
    display.updateMapDisplay();
    expect(layers.getFeaturesFromLayer(LayerType.SELECTION)[0]).toBe(marker);
    expect(marker.get('bikesAvailable')).toBe(9);
    expect(marker.get('electricBikesAvailable')).toBe(3);

    // The selection stays interactive even when the general bike layer is hidden.
    expect(layers.getLayer(LayerType.SELECTION)?.getVisible()).toBe(true);
    state.selectedBikeStations.set(new Map());
    display.updateMapDisplay();
    expect(layers.getFeaturesFromLayer(LayerType.SELECTION)).toEqual([]);
  });

  it('renders only selected bus stops in the overlay and removes them on deselection', () => {
    TestBed.configureTestingModule({ providers: [
      MapDisplayService, MapStateService, MapLayerService,
      MapSelectionDisplayService, FeatureFactoryService,
      { provide: CityContextService, useValue: {} },
      { provide: MapCameraService, useValue: {} },
      { provide: MapLayerStyleService, useValue: {} },
      { provide: LoggerService, useValue: { debug: jest.fn(), info: jest.fn() } },
      {
        provide: MapService,
        useFactory: (layers: MapLayerService) => ({ getLayerService: () => layers }),
        deps: [MapLayerService],
      },
    ] });
    const state = TestBed.inject(MapStateService);
    const layers = TestBed.inject(MapLayerService);
    const display = TestBed.inject(MapDisplayService);
    const stop = {
      id: 'bus-stop', stopId: 'bus-stop', name: 'Praça da Sé',
      latitude: -23.55, longitude: -46.63, isSubwayStation: false,
    };
    state.displayedStops.set([stop, { ...stop, id: 'other', stopId: 'other' }]);
    state.addStopToSelection({ ...stop, id: stop.stopId });
    display.updateMapDisplay();
    const markers = layers.getFeaturesFromLayer(LayerType.SELECTION);
    expect(markers).toHaveLength(1);
    expect(markers[0].get('stopId')).toBe(stop.stopId);
    expect(layers.layerConfigs().some((layer) => layer.id === 'bus-stops')).toBe(false);
    state.removeStopFromSelection(stop.stopId);
    display.updateMapDisplay();
    expect(layers.getFeaturesFromLayer(LayerType.SELECTION)).toEqual([]);
  });
});
