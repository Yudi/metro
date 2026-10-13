import { TestBed } from '@angular/core/testing';
import { Feature } from 'ol';
import { Point } from 'ol/geom';
import { FeatureFactoryService } from './feature-factory.service';
import { MapSelectionDisplayService } from './map-selection-display.service';
import { MapService } from './map.service';
import { MapStateService } from './map-state.service';
import { BikeStation, FeatureCreationSource } from './map.types';
import { LayerType } from './layers/map-layer.service';

const selection = {
  id: 'CONS', name: 'Consolação', latitude: -23.5571,
  longitude: -46.6606, isSubwayStation: true,
};
const station: BikeStation = {
  stationId: 'bike-1', name: 'Estação', latitude: -23.55, longitude: -46.66,
  capacity: 10, effectiveCapacity: 10, numBikesAvailable: 3, numBikesDisabled: 0,
  numDocksAvailable: 7, numDocksDisabled: 0, status: 'IN_SERVICE',
  isInstalled: true, isRenting: true, isReturning: true, lastReported: 1,
  lastReportedIso: '', fetchedAt: 1, electricBikesAvailable: 0,
  hasElectricBikesAvailable: false, vehicleAvailability: [], detailsLoaded: true,
};

describe('MapSelectionDisplayService', () => {
  let service: MapSelectionDisplayService;
  let state: MapStateService;
  let factory: FeatureFactoryService;
  let features: Feature[];
  let addFeature: jest.Mock;
  let removeFeature: jest.Mock;

  beforeEach(() => {
    features = [];
    addFeature = jest.fn((_layer, feature: Feature) => features.push(feature));
    removeFeature = jest.fn((_layer, feature: Feature) => {
      features.splice(features.indexOf(feature), 1);
    });
    TestBed.configureTestingModule({ providers: [
      MapSelectionDisplayService, MapStateService, FeatureFactoryService,
      { provide: MapService, useValue: { getLayerService: () => ({
        getFeaturesFromLayer: () => [...features], addFeature, removeFeature,
      }) } },
    ] });
    service = TestBed.inject(MapSelectionDisplayService);
    state = TestBed.inject(MapStateService);
    factory = TestBed.inject(FeatureFactoryService);
  });

  it('draws a selected rail station supplied by a deep link', () => {
    state.addStopToSelection(selection);
    service.updateSelectedFeatures();
    expect(addFeature).toHaveBeenCalledWith(LayerType.SELECTION, expect.any(Feature));
    expect(features[0].get('name')).toBe('Consolação');
    expect(features[0].get('isSubwayStation')).toBe(true);
  });

  it('does not recreate or mutate markers during repeated updates of unchanged selections', () => {
    for (let index = 0; index < 100; index++) {
      state.addStopToSelection({ ...selection, id: `stop-${index}` });
    }
    const create = jest.spyOn(factory, 'createStopFeature');
    const update = jest.spyOn(factory, 'updateStopFeature');
    service.updateSelectedFeatures();
    const initial = [...features];
    for (let index = 0; index < 10; index++) service.updateSelectedFeatures();
    expect(create).toHaveBeenCalledTimes(100);
    expect(update).not.toHaveBeenCalled();
    expect(addFeature).toHaveBeenCalledTimes(100);
    expect(features).toEqual(initial);
  });

  it('hydrates a deep-link marker in place even when the detail ID differs', () => {
    state.addStopToSelection(selection);
    service.updateSelectedFeatures();
    const feature = features[0];
    const geometry = feature.getGeometry() as Point;
    const properties = jest.spyOn(feature, 'setProperties');
    const move = jest.spyOn(geometry, 'setCoordinates');
    const stop = { ...selection, id: 'database-id', stopId: 'CONS', name: 'Nome atualizado' };
    state.displayedStops.set([stop]);
    service.updateSelectedFeatures();
    expect(features[0]).toBe(feature);
    expect(feature.get('name')).toBe('Nome atualizado');
    expect(addFeature).toHaveBeenCalledTimes(1);
    expect(move).not.toHaveBeenCalled();
    properties.mockClear();
    state.displayedStops.set([{ ...stop }]);
    service.updateSelectedFeatures();
    expect(properties).not.toHaveBeenCalled();
    state.displayedStops.set([{ ...stop, longitude: -46.7 }]);
    service.updateSelectedFeatures();
    expect(move).toHaveBeenCalledTimes(1);
  });

  it('removes deselected features while preserving address pins', () => {
    features.push(factory.createAddressLocationFeature(-23.5, -46.6));
    state.addStopToSelection(selection);
    service.updateSelectedFeatures();
    state.removeStopFromSelection('CONS');
    service.updateSelectedFeatures();
    expect(removeFeature).toHaveBeenCalledTimes(1);
    expect(features).toHaveLength(1);
    expect(features[0].get('creationSource')).toBe(FeatureCreationSource.ADDRESS_SEARCH);
  });

  it('updates bike details without a redraw until counts or geometry change', () => {
    state.addBikeStationToSelection({ ...selection, id: station.stationId });
    state.bikeStations.set([station]);
    service.updateSelectedFeatures();
    const feature = features[0];
    const redraw = jest.spyOn(feature, 'changed');
    const move = jest.spyOn(feature.getGeometry() as Point, 'setCoordinates');
    const snapshot = { ...station, fetchedAt: 2 };
    state.bikeStations.set([snapshot]);
    service.updateSelectedFeatures();
    expect(feature.get('stationData')).toBe(snapshot);
    expect(redraw).not.toHaveBeenCalled();
    expect(move).not.toHaveBeenCalled();
    state.bikeStations.set([{ ...snapshot, numBikesAvailable: 4 }]);
    service.updateSelectedFeatures();
    expect(redraw).toHaveBeenCalledTimes(1);
    expect(feature.get('bikesAvailable')).toBe(4);
    state.bikeStations.set([{ ...snapshot, numBikesAvailable: 4, longitude: -46.7 }]);
    service.updateSelectedFeatures();
    expect(move).toHaveBeenCalledTimes(1);
    expect(addFeature).toHaveBeenCalledTimes(1);
  });
});
