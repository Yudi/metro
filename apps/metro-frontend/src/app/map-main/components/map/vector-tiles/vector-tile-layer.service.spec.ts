import { TestBed } from '@angular/core/testing';
import { LoggerService } from '@metro/shared/api';
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
        { provide: VectorTileStyleService, useValue: {} },
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
    expect(service.getLayer(VectorTileLayerType.BIKE_STATIONS)?.changed).toHaveBeenCalledTimes(1);
    expect(service.getLayer(VectorTileLayerType.BUS_ROUTES)?.changed).not.toHaveBeenCalled();
    service.setZoomLevel(13);
    expect(service.getLayer(VectorTileLayerType.RAIL_STATIONS)?.changed).toHaveBeenCalledTimes(2);
  });

  it('retains cached tiles when equivalent route and stop filters are repeated', () => {
    const routes = service.getLayer(VectorTileLayerType.BUS_ROUTES)?.getSource();
    const stops = service.getLayer(VectorTileLayerType.BUS_STOPS)?.getSource();
    if (!routes || !stops) throw new Error('Missing tile sources');
    const refreshRoutes = jest.spyOn(routes, 'refresh');
    const refreshStops = jest.spyOn(stops, 'refresh');
    service.setBusRouteIds(['b', 'a']);
    service.setBusRouteIds(['a', 'b', 'a']);
    service.setBusStopFilter({ routeIds: ['b', 'a'], stopIds: ['s'], nearby: null });
    service.setBusStopFilter({ routeIds: ['a', 'b'], stopIds: ['s', 's'], nearby: null });
    expect(refreshRoutes).toHaveBeenCalledTimes(1);
    expect(refreshStops).toHaveBeenCalledTimes(1);

    service.setBusRouteIds([]);
    service.setBusStopFilter({ routeIds: [], stopIds: [], nearby: null });
    expect(refreshRoutes).toHaveBeenCalledTimes(2);
    expect(refreshStops).toHaveBeenCalledTimes(2);
  });

  it('refreshes stops when the nearby radius changes', () => {
    const source = service.getLayer(VectorTileLayerType.BUS_STOPS)?.getSource();
    if (!source) throw new Error('Missing tile source');
    const refresh = jest.spyOn(source, 'refresh');
    const nearby = { lat: -23.5, lon: -46.6, radiusMeters: 500 };
    service.setBusStopFilter({ routeIds: [], stopIds: [], nearby });
    service.setBusStopFilter({ routeIds: [], stopIds: [], nearby: { ...nearby, radiusMeters: 1000 } });
    expect(refresh).toHaveBeenCalledTimes(2);
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

});
