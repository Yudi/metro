import { TestBed } from '@angular/core/testing';
import { LoggerService } from '@metro/shared/api';
import { Feature } from 'ol';
import { Style } from 'ol/style';
import { VectorTileFeatureDataService } from './vector-tile-feature-data.service';
import { VectorTileStyleService } from './vector-tile-style.service';
import { VectorTileLayerService, VectorTileLayerType } from './vector-tile-layer.service';

describe('VectorTileLayerService repeated navigation', () => {
  let service: VectorTileLayerService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        VectorTileLayerService,
        { provide: LoggerService, useValue: { debug: jest.fn() } },
        { provide: VectorTileFeatureDataService, useValue: {} },
        {
          provide: VectorTileStyleService,
          useValue: { getStyleForLayer: jest.fn(() => new Style()) },
        },
      ],
    });
    service = TestBed.inject(VectorTileLayerService);
  });

  it('preserves tile rendering across zooms within the same label range', () => {
    service.setZoomLevel(12);
    const changed = service.getAllLayers().map((layer) => jest.spyOn(layer, 'changed'));
    for (let frame = 0; frame < 60; frame++) {
      service.setZoomLevel(12 + frame / 60);
    }
    expect(changed.every((spy) => spy.mock.calls.length === 0)).toBe(true);

    service.setZoomLevel(14);
    expect(service.getLayer(VectorTileLayerType.RAIL_STATIONS)?.changed).toHaveBeenCalledTimes(1);
    expect(service.getLayer(VectorTileLayerType.BIKE_STATIONS)?.changed).not.toHaveBeenCalled();
    expect(service.getLayer(VectorTileLayerType.BUS_ROUTES)?.changed).not.toHaveBeenCalled();
    service.setZoomLevel(13);
    expect(service.getLayer(VectorTileLayerType.RAIL_STATIONS)?.changed).toHaveBeenCalledTimes(2);
  });

  it('shows toggleable bus stops by default and loads unfiltered tiles only at zoom 16+', () => {
    const config = service
      .layerConfigs()
      .find((layer) => layer.id === VectorTileLayerType.BUS_STOPS);
    const layer = service.getLayer(VectorTileLayerType.BUS_STOPS);
    const source = layer?.getSource();
    if (!config || !layer || !source) throw new Error('Missing bus stop layer');

    expect(config).toMatchObject({
      name: 'Pontos de ônibus',
      visible: true,
      toggleable: true,
      tileSize: 256,
      minZoom: 15,
    });
    expect(service.isLayerVisible(VectorTileLayerType.BUS_STOPS)).toBe(true);
    expect(layer.getMinZoom()).toBe(15);
    expect(source.get('tileSize')).toBe(256);

    const getUrl = source.getTileUrlFunction();
    expect(getUrl([14, 6069, 9296], 1, {} as never)).toBeUndefined();
    expect(getUrl([15, 12138, 18593], 1, {} as never)).toBeUndefined();
    const tileUrl = getUrl([16, 24276, 37186], 1, {} as never);
    expect(tileUrl).toContain('/tiles/bus-stops/16/24276/37186.pbf');
    expect(tileUrl).not.toContain('?');

    service.toggleLayer(VectorTileLayerType.BUS_STOPS);
    expect(service.isLayerVisible(VectorTileLayerType.BUS_STOPS)).toBe(false);
    service.toggleLayer(VectorTileLayerType.BUS_STOPS);
    expect(service.isLayerVisible(VectorTileLayerType.BUS_STOPS)).toBe(true);
  });

  it('retains cached route tiles when equivalent route filters are repeated', () => {
    const routes = service.getLayer(VectorTileLayerType.BUS_ROUTES)?.getSource();
    if (!routes) throw new Error('Missing bus route source');
    const refreshRoutes = jest.spyOn(routes, 'refresh');
    service.setBusRouteIds(['b', 'a']);
    service.setBusRouteIds(['a', 'b', 'a']);
    expect(refreshRoutes).toHaveBeenCalledTimes(1);

    service.setBusRouteIds([]);
    expect(refreshRoutes).toHaveBeenCalledTimes(2);
  });

  it('suppresses selected physical stops and recomputes styles when selected IDs change', () => {
    const layer = service.getLayer(VectorTileLayerType.BUS_STOPS);
    if (!layer) throw new Error('Missing bus stop layer');
    const styleFunction = layer.getStyleFunction();
    if (!styleFunction) throw new Error('Missing bus stop style function');

    const feature = new Feature({
      physical_stop_id: 'physical-1',
      stop_id: 'canonical-1',
      merged_stop_ids: 'artesp:member-1,canonical-1',
      source_agency: 'sptrans',
      source_id: 'provider-1',
    });
    const changed = jest.spyOn(layer, 'changed');
    const render = () => styleFunction(feature, 1);
    expect(render()).toBeInstanceOf(Style);

    service.setSelectedBusStopIds(['ARTESP:member-1']);
    expect(changed).toHaveBeenCalledTimes(1);
    expect(render()).toBeUndefined();

    service.setSelectedBusStopIds(['artesp:member-1', 'artesp:member-1']);
    expect(changed).toHaveBeenCalledTimes(1);
    service.setSelectedBusStopIds(['SPTRANS:provider-1']);
    expect(changed).toHaveBeenCalledTimes(2);
    expect(render()).toBeUndefined();

    service.setSelectedBusStopIds([]);
    expect(changed).toHaveBeenCalledTimes(3);
    expect(render()).toBeInstanceOf(Style);
  });

  it('revalidates stable bike URLs once per WebSocket snapshot', () => {
    const source = service.getLayer(VectorTileLayerType.BIKE_STATIONS)?.getSource();
    if (!source) throw new Error('Missing bike source');
    const refresh = jest.spyOn(source, 'refresh');
    const url = () => source.getTileUrlFunction()([14, 6068, 9298], 1, {} as never);
    const initialUrl = url();

    service.refreshBikeStations(null);
    expect(refresh).not.toHaveBeenCalled();
    service.refreshBikeStations(100);
    service.refreshBikeStations(100);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(url()).toBe(initialUrl);
    service.refreshBikeStations(200);
    expect(refresh).toHaveBeenCalledTimes(2);
    expect(url()).toBe(initialUrl);
  });

  it('coalesces bike revisions until movement ends without refreshing unchanged data', () => {
    const source = service.getLayer(VectorTileLayerType.BIKE_STATIONS)?.getSource();
    if (!source) throw new Error('Missing bike source');
    const refresh = jest.spyOn(source, 'refresh');
    service.refreshBikeStations('initial');
    refresh.mockClear();

    service.setMapMoving(true);
    service.refreshBikeStations('second');
    service.refreshBikeStations('latest');
    expect(refresh).not.toHaveBeenCalled();
    service.setMapMoving(false);
    expect(refresh).toHaveBeenCalledTimes(1);
    service.refreshBikeStations('latest');
    service.setMapMoving(false);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('reuses parsed stop identities across renders and selection changes', () => {
    const style = service.getLayer(VectorTileLayerType.BUS_STOPS)?.getStyleFunction();
    if (!style) throw new Error('Missing bus stop style');
    const feature = new Feature({ merged_stop_ids: 'artesp:member', source_agency: 'sptrans' });
    const get = jest.spyOn(feature, 'get');
    service.setSelectedBusStopIds(['other']);
    expect(style(feature, 1)).toBeInstanceOf(Style);
    const reads = get.mock.calls.length;
    service.setSelectedBusStopIds(['ARTESP:member']);
    expect(style(feature, 1)).toBeUndefined();
    expect(get).toHaveBeenCalledTimes(reads);
  });

});
