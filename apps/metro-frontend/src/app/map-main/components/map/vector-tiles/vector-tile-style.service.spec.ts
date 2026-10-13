import { TestBed } from '@angular/core/testing';
import { LoggerService } from '@metro/shared/api';
import { Feature } from 'ol';
import Icon from 'ol/style/Icon';
import { StationNameService } from '../../../geography/station-name.service';
import { VectorTileFeatureDataService } from './vector-tile-feature-data.service';
import { VectorTileLayerType } from './vector-tile-layer.config';
import { VectorTileStyleService } from './vector-tile-style.service';

describe('VectorTileStyleService caching', () => {
  let service: VectorTileStyleService;
  const formatStationName = jest.fn((name: string) => name);

  beforeEach(() => {
    jest.clearAllMocks();
    TestBed.configureTestingModule({
      providers: [
        VectorTileStyleService,
        { provide: LoggerService, useValue: { warn: jest.fn() } },
        { provide: StationNameService, useValue: { formatStationName } },
        { provide: VectorTileFeatureDataService, useValue: { isBikeStationCluster: () => false } },
      ],
    });
    service = TestBed.inject(VectorTileStyleService);
  });

  it('reuses both station label states through repeated zoom reversals', () => {
    const feature = new Feature({ name: 'Estação', agencies: [] });
    const type = VectorTileLayerType.RAIL_STATIONS;
    const withoutLabels = service.getStyleForLayer(type, feature, 12);
    const withLabels = service.getStyleForLayer(type, feature, 16);
    for (let frame = 0; frame < 60; frame++) {
      expect(service.getStyleForLayer(type, feature, 13)).toBe(withoutLabels);
      expect(service.getStyleForLayer(type, feature, 15)).toBe(withLabels);
    }
    expect(formatStationName).toHaveBeenCalledTimes(1);
    expect(withLabels).not.toBe(withoutLabels);
  });

  it('shares a bus stop icon across features and zoom levels', () => {
    const type = VectorTileLayerType.BUS_STOPS;
    const style = service.getStyleForLayer(type, new Feature(), 12);
    expect(style).toBe(service.getStyleForLayer(type, new Feature(), 18));
    if (Array.isArray(style)) throw new Error('Expected one bus stop style');
    expect(style.getImage()).toBeInstanceOf(Icon);
    expect((style.getImage() as Icon).getScale()).toBe(0.32);
  });

  it('creates fresh bike styles when a refreshed tile has new feature data', () => {
    const type = VectorTileLayerType.BIKE_STATIONS;
    const before = new Feature({ num_bikes_available: 1, effective_capacity: 10 });
    const after = new Feature({ num_bikes_available: 8, effective_capacity: 10 });
    expect(service.getStyleForLayer(type, before, 13)).toBe(
      service.getStyleForLayer(type, before, 16),
    );
    expect(service.getStyleForLayer(type, after, 16)).not.toBe(
      service.getStyleForLayer(type, before, 16),
    );
  });
});
