import { TestBed } from '@angular/core/testing';
import { Feature } from 'ol';
import { Point } from 'ol/geom';
import { Style } from 'ol/style';
import { StationNameService } from '../../../geography/station-name.service';
import { MapLayerStyleService } from './map-layer-style.service';

describe('selected bus stop markers', () => {
  it('reuses bike styles until their visible state changes', () => {
    TestBed.configureTestingModule({ providers: [
      MapLayerStyleService,
      { provide: StationNameService, useValue: {} },
    ] });
    const service = TestBed.inject(MapLayerStyleService);
    const bike = new Feature({
      geometry: new Point([0, 0]), type: 'bike_station',
      bikesAvailable: 3, effectiveCapacity: 10, hasElectricBikesAvailable: false,
    });
    const initial = service.createSelectionStyle(bike);
    bike.set('lastReported', 123);
    expect(service.createSelectionStyle(bike)).toBe(initial);
    bike.set('bikesAvailable', 4);
    const availability = service.createSelectionStyle(bike);
    expect(availability).not.toBe(initial);
    expect(service.createSelectionStyle(bike)).toBe(availability);
    bike.set('effectiveCapacity', 12);
    const capacity = service.createSelectionStyle(bike);
    expect(capacity).not.toBe(availability);
    bike.set('hasElectricBikesAvailable', true);
    expect(service.createSelectionStyle(bike)).not.toBe(capacity);
  });

  it('keeps the large icon visible at zoom 12 and hides it below that zoom', () => {
    TestBed.configureTestingModule({ providers: [
      MapLayerStyleService,
      { provide: StationNameService, useValue: {} },
    ] });
    const styles = TestBed.inject(MapLayerStyleService);
    const stop = new Feature({ geometry: new Point([0, 0]), type: 'stop', isSubwayStation: false });
    expect(styles.createSelectionStyle(stop, 11)).toEqual([]);
    const style = styles.createSelectionStyle(stop, 12) as Style;
    expect(style.getImage()?.getScale()).toBe(0.55);
    expect(styles.createSelectionStyle(stop, 16)).toBe(style);
  });
});
