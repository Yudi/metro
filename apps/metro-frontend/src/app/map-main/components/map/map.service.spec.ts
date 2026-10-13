import { TestBed } from '@angular/core/testing';
import { LoggerService } from '@metro/shared/api';
import { Map as OLMap, View } from 'ol';
import { MapLayerService } from './layers/map-layer.service';
import { MapBaseTileService } from './layers/map-base-tile.service';
import { MapCameraService } from './map-camera.service';
import { MapService } from './map.service';
import { VectorTileLayerService } from './vector-tiles/vector-tile-layer.service';

describe('MapService zoom initialization', () => {
  let service: MapService;
  const layers = {
    addLayersToMap: jest.fn(),
    setZoomLevel: jest.fn(),
    clearLayer: jest.fn(),
  };
  const vectorTileLayers = {
    addLayersToMap: jest.fn(),
    setZoomLevel: jest.fn(),
    setMapMoving: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    TestBed.configureTestingModule({
      providers: [
        MapService,
        { provide: MapLayerService, useValue: layers },
        { provide: VectorTileLayerService, useValue: vectorTileLayers },
        {
          provide: MapBaseTileService,
          useValue: { createLayer: jest.fn(), destroy: jest.fn() },
        },
        {
          provide: MapCameraService,
          useValue: { attach: jest.fn(), detach: jest.fn() },
        },
        {
          provide: LoggerService,
          useValue: { info: jest.fn(), debug: jest.fn(), warn: jest.fn() },
        },
      ],
    });
    service = TestBed.inject(MapService);
  });

  afterEach(() => {
    service.destroy();
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it.each([0, 12, 14, 16])('initializes layer styling at zoom %s before attaching layers', (zoom) => {
    service.initializeMap('map', { zoom, showControls: false });

    expect(service.zoomLevel()).toBe(zoom);
    for (const layerService of [layers, vectorTileLayers]) {
      expect(layerService.setZoomLevel).toHaveBeenCalledWith(zoom);
      expect(layerService.setZoomLevel.mock.invocationCallOrder[0]).toBeLessThan(
        layerService.addLayersToMap.mock.invocationCallOrder[0],
      );
    }
  });

  it('resets retained layer zoom when reopening the map at low zoom', () => {
    service.initializeMap('map', { zoom: 16, showControls: false });
    service.initializeMap('map', { zoom: 12, showControls: false });

    expect(service.zoomLevel()).toBe(12);
    expect(layers.setZoomLevel).toHaveBeenLastCalledWith(12);
    expect(vectorTileLayers.setZoomLevel).toHaveBeenLastCalledWith(12);
  });

  it('publishes only the final camera after a burst of zoom changes', () => {
    const onMap = jest.spyOn(OLMap.prototype, 'on');
    const onView = jest.spyOn(View.prototype, 'on');
    const map = service.initializeMap('map', { zoom: 12, showControls: false });
    const moveEndListener = onMap.mock.calls.find(
      ([event]) => event === 'moveend',
    )?.[1];

    // Simulate sixty animation frames, including repeated reversals.
    for (let frame = 0; frame < 60; frame++) {
      map.getView().setZoom(frame % 2 === 0 ? 18 : 9);
    }
    map.getView().setZoom(15);
    expect(onView.mock.calls.some(([event]) => event === 'change:resolution')).toBe(false);
    expect(onView.mock.calls.some(([event]) => event === 'change:center')).toBe(false);
    expect(service.zoomLevel()).toBe(12);
    expect(layers.setZoomLevel).toHaveBeenCalledTimes(1);
    expect(vectorTileLayers.setZoomLevel).toHaveBeenCalledTimes(1);

    expect(typeof moveEndListener).toBe('function');
    if (typeof moveEndListener === 'function') {
      moveEndListener.call(map, { type: 'moveend' });
    }
    expect(service.zoomLevel()).toBe(15);
    expect(layers.setZoomLevel).toHaveBeenLastCalledWith(15);
    expect(vectorTileLayers.setZoomLevel).toHaveBeenLastCalledWith(15);
    expect(layers.setZoomLevel).toHaveBeenCalledTimes(2);
  });

  it('publishes the settled center after panning', () => {
    const on = jest.spyOn(OLMap.prototype, 'on');
    const map = service.initializeMap('map', { center: [-46.6, -23.5], showControls: false });
    const listener = on.mock.calls.find(([event]) => event === 'moveend')?.[1];
    map.getView().setCenter([-46.7, -23.6]);
    expect(service.center()).toEqual([-46.6, -23.5]);
    if (typeof listener === 'function') listener.call(map, { type: 'moveend' });
    expect(service.center()).toEqual([-46.7, -23.6]);
  });

  it.each(['dragging', 'animating', 'interacting'])('skips hover hit detection while %s', (state) => {
    const on = jest.spyOn(OLMap.prototype, 'on');
    const map = service.initializeMap('map', { showControls: false });
    const listener = on.mock.calls.find(([event]) => event === 'pointermove')?.[1];
    if (state === 'animating') jest.spyOn(map.getView(), 'getAnimating').mockReturnValue(true);
    if (state === 'interacting') jest.spyOn(map.getView(), 'getInteracting').mockReturnValue(true);
    expect(typeof listener).toBe('function');
    // The mock has no hit detection API: reaching it would throw.
    if (typeof listener === 'function') {
      expect(() => listener.call(map, { dragging: state === 'dragging' })).not.toThrow();
    }
  });

  it('hit-tests the latest hover position once per frame and cancels queued work on movement', () => {
    jest.useFakeTimers();
    const on = jest.spyOn(OLMap.prototype, 'on');
    const map = service.initializeMap('map', { showControls: false });
    const hit = jest.fn().mockReturnValue(false);
    Object.assign(map, { hasFeatureAtPixel: hit });
    const pointer = on.mock.calls.find(([event]) => event === 'pointermove')?.[1];
    const start = on.mock.calls.find(([event]) => event === 'movestart')?.[1];
    const end = on.mock.calls.find(([event]) => event === 'moveend')?.[1];
    if (typeof pointer !== 'function' || typeof start !== 'function' || typeof end !== 'function') {
      throw new Error('Missing movement listeners');
    }
    pointer.call(map, { pixel: [1, 1] });
    pointer.call(map, { pixel: [2, 2] });
    pointer.call(map, { pixel: [3, 3] });
    expect(hit).not.toHaveBeenCalled();
    jest.advanceTimersByTime(16);
    expect(hit).toHaveBeenCalledTimes(1);
    expect(hit).toHaveBeenCalledWith([3, 3]);

    pointer.call(map, { pixel: [4, 4] });
    start.call(map, { type: 'movestart' });
    expect(vectorTileLayers.setMapMoving).toHaveBeenLastCalledWith(true);
    jest.advanceTimersByTime(16);
    expect(hit).toHaveBeenCalledTimes(1);
    end.call(map, { type: 'moveend' });
    expect(vectorTileLayers.setMapMoving).toHaveBeenLastCalledWith(false);

    pointer.call(map, { pixel: [5, 5] });
    service.destroy();
    jest.advanceTimersByTime(16);
    expect(hit).toHaveBeenCalledTimes(1);
  });
});
