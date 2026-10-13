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
    expect(layers.getFeaturesFromLayer(LayerType.BIKE)).toHaveLength(0);

    const station = stations[0];
    state.selectedBikeStations.set(new Map([[station.stationId, {
      id: station.stationId, name: station.name,
      latitude: station.latitude, longitude: station.longitude,
    }]]));
    display.updateMapDisplay();
    const marker = layers.getFeaturesFromLayer(LayerType.SELECTION)[0];
    expect(marker.get('stationData')).toBe(station);
    expect(createBike).toHaveBeenCalledTimes(1);
    expect(layers.getFeaturesFromLayer(LayerType.BIKE)).toHaveLength(0);

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
    layers.setLayerVisibility(LayerType.BIKE, false);
    expect(layers.getLayer(LayerType.SELECTION)?.getVisible()).toBe(true);
    state.selectedBikeStations.set(new Map());
    display.updateMapDisplay();
    expect(layers.getFeaturesFromLayer(LayerType.SELECTION)).toEqual([]);
  });
});
