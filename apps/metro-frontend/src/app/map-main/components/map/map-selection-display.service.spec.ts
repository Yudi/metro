import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { LoggerService } from '@metro/shared/api';
import { FeatureFactoryService } from './feature-factory.service';
import { MapSelectionDisplayService } from './map-selection-display.service';
import { MapService } from './map.service';
import { MapStateService } from './map-state.service';
import { FeatureCreationSource } from './map.types';
import { LayerType } from './layers/map-layer.service';

describe('MapSelectionDisplayService', () => {
  it('draws a selected rail station supplied by a deep link', () => {
    const addFeature = jest.fn();
    const createStopFeature = jest.fn(() => ({ getId: () => 'CONS' }));
    const selectedStops = signal(new Map([
      ['CONS', {
        id: 'CONS',
        name: 'Consolação',
        latitude: -23.5571,
        longitude: -46.6606,
        isSubwayStation: true,
      }],
    ]));
    TestBed.configureTestingModule({
      providers: [
        MapSelectionDisplayService,
        {
          provide: MapService,
          useValue: {
            getLayerService: () => ({
              getFeaturesFromLayer: () => [],
              addFeature,
            }),
          },
        },
        {
          provide: MapStateService,
          useValue: {
            selectedRoutes: signal(new Map()),
            selectedStops,
            selectedBikeStations: signal(new Map()),
            displayedShapes: signal([]),
            displayedStops: signal([]),
            bikeStations: signal([]),
          },
        },
        { provide: FeatureFactoryService, useValue: { createStopFeature } },
        { provide: LoggerService, useValue: { debug: jest.fn() } },
      ],
    });

    TestBed.inject(MapSelectionDisplayService).updateSelectedFeatures();

    expect(createStopFeature).toHaveBeenCalledWith(
      expect.objectContaining({ stopId: 'CONS', name: 'Consolação' }),
      FeatureCreationSource.SELECTION,
    );
    expect(addFeature).toHaveBeenCalledWith(
      LayerType.SELECTION,
      expect.objectContaining({ getId: expect.any(Function) }),
    );
  });
});
