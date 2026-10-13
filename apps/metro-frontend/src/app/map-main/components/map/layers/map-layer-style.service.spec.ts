import { TestBed } from '@angular/core/testing';
import { Feature } from 'ol';
import { Point } from 'ol/geom';
import { Style } from 'ol/style';
import { StationNameService } from '../../../geography/station-name.service';
import { MapLayerStyleService } from './map-layer-style.service';

describe('selected bus stop markers', () => {
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
