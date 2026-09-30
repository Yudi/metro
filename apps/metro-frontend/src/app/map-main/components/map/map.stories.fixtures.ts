import { StationImagesService } from '../subway-station-dialog/station-images.service';
import { sharedProdEnvironment } from '@metro/shared/environment';
import {
  computed,
  inject,
  provideEnvironmentInitializer,
  signal,
} from '@angular/core';
import { MatDialogRef } from '@angular/material/dialog';
import { fromLonLat } from 'ol/proj';
import { Feature } from 'ol';
import { Map as OpenLayersMap } from 'ol';
import type { FeatureLike } from 'ol/Feature';
import LineString from 'ol/geom/LineString';
import Point from 'ol/geom/Point';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import { Circle as CircleStyle, Fill, Stroke, Style, Text } from 'ol/style';
import { provideRouter, withDisabledInitialNavigation } from '@angular/router';
import { APP_BASE_HREF } from '@angular/common';
import {
  API_BASE_URL,
  FavoritesService,
  LoggerService,
} from '@metro/shared/api';
import {
  createMockLoggerService,
  createMockRealtimeService,
  type BusStopGraphQL,
  type MockRailServiceOptions,
  PINHEIROS_BUS_STOP,
  BIKE_STATION_FULL,
  BIKE_STATION_EMPTY,
} from '@metro/storybook-mocks';
import { emptyFavorites } from '@metro/shared/utils';
import type { LocationPermissionState } from '@metro/shared/geolocation';
import { GeolocationService } from '@metro/shared/geolocation';
import { ToolbarLayoutComponent } from '../../../shared/layout/toolbar-layout/toolbar-layout.component';
import { MapMainComponent } from '../../map-main.component';
import { BikeStationsService } from '../../geography/bike-stations.service';
import { RealtimeWebsocketService } from '../../realtime/realtime-websocket.service';
import type { VehiclePositionUpdate } from '../../realtime/realtime-websocket.service';
import { MapRealtimeStatusService } from '../../realtime/map-realtime-status.service';
import { RealtimeVehicleLayerService } from '../../realtime/realtime-vehicle-layer.service';
import { CptmVehicleLayerService } from '../../realtime/cptm-vehicle-layer.service';
import { UserLocationLayerService } from './user-location-layer.service';
import { MapStateService } from './map-state.service';
import { MapService } from './map.service';
import {
  MapPanelService,
  type MapPanelSnap,
} from './map-panel/map-panel.service';
import { buildMapPanelAgencyLineGroups } from './map-panel/map-panel-agency-lines';
import { SubwayStationDialogComponent } from '../subway-station-dialog/subway-station-dialog.component';
import { BusStopDialogComponent } from '../bus-stop-dialog/bus-stop-dialog.component';
import { BikeStationDialogComponent } from '../bike-station-dialog/bike-station-dialog.component';
import type { SubwayStationDialogData } from '../subway-station-dialog/subway-station-dialog.component';
import {
  createSubwayStationDialogProviders,
  PARAISO,
} from '../subway-station-dialog/subway-station-dialog.stories.fixtures';
import {
  VectorTileLayerService,
  VectorTileLayerType,
  type RailRouteTileData,
  type RailStationTileData,
  type BusStopTileData,
  type BikeStationTileData,
} from './vector-tiles/vector-tile-layer.service';
import type { SelectedRoute } from './map.types';

const STORY_FEATURE_KIND = 'map-story-feature';
const STORY_LAYER_PROPERTY = 'map-story-layer';

interface StoryStation extends RailStationTileData {
  latitude: number;
  longitude: number;
}

const STORY_STATIONS: StoryStation[] = [
  {
    id: 'story:jabaquara',
    name: 'Jabaquara',
    latitude: -23.6461,
    longitude: -46.6415,
    agencies: ['METRÔ'],
    lines: ['1-Azul'],
    isMerged: false,
  },
  {
    id: 'story:santa-cruz',
    name: 'Santa Cruz',
    latitude: -23.5982,
    longitude: -46.6378,
    agencies: ['METRÔ'],
    lines: ['1-Azul', '5-Lilás'],
    isMerged: true,
  },
  {
    id: 'story:paraiso',
    name: 'Paraíso',
    latitude: PARAISO.latitude,
    longitude: PARAISO.longitude,
    agencies: ['METRÔ'],
    lines: ['1-Azul', '2-Verde'],
    isMerged: true,
  },
  {
    id: 'story:se',
    name: 'Sé',
    latitude: -23.5509,
    longitude: -46.6337,
    agencies: ['METRÔ'],
    lines: ['1-Azul', '3-Vermelha'],
    isMerged: true,
  },
  {
    id: 'story:luz',
    name: 'Luz',
    latitude: -23.5361,
    longitude: -46.6354,
    agencies: ['CPTM', 'METRÔ'],
    lines: ['1-Azul', '4-Amarela', '7-Rubi', '11-Coral'],
    isMerged: true,
  },
  {
    id: 'story:tucuruvi',
    name: 'Tucuruvi',
    latitude: -23.4802,
    longitude: -46.62,
    agencies: ['METRÔ'],
    lines: ['1-Azul'],
    isMerged: false,
  },
  {
    id: 'story:pinheiros',
    name: 'Pinheiros',
    latitude: -23.5673,
    longitude: -46.7012,
    agencies: ['VIAMOBILIDADE'],
    lines: ['9-Esmeralda'],
    isMerged: true,
  },
  {
    id: 'story:vilamadalena',
    name: 'Vila Madalena',
    latitude: -23.5468,
    longitude: -46.6911,
    agencies: ['METRÔ'],
    lines: ['2-Verde'],
    isMerged: false,
  },
];

const STORY_ROUTES = [
  {
    lineCode: 1,
    name: 'Linha 1-Azul',
    color: '#1769aa',
    coordinates: [
      [-46.6415, -23.6461],
      [-46.6378, -23.5982],
      [-46.635, -23.578],
      [-46.6337, -23.5509],
      [-46.6354, -23.5361],
      [-46.62, -23.4802],
    ],
  },
  {
    lineCode: 2,
    name: 'Linha 2-Verde',
    color: '#16834b',
    coordinates: [
      [-46.6911, -23.5468],
      [-46.677, -23.551],
      [-46.662, -23.558],
      [-46.651, -23.568],
      [-46.635, -23.578],
    ],
  },
];

/** Uses real OpenLayers layers and hit detection, with local fixtures instead of MVT requests. */
export class StoryVectorTileLayerService extends VectorTileLayerService {
  private readonly storyLayers = new Map<
    VectorTileLayerType,
    VectorLayer<VectorSource>
  >();

  override addLayersToMap(map: OpenLayersMap): void {
    const routeFeatures = STORY_ROUTES.map((route) => {
      const feature = new Feature({
        geometry: new LineString(
          route.coordinates.map(([longitude, latitude]) =>
            fromLonLat([longitude, latitude]),
          ),
        ),
      });
      feature.setProperties({
        [STORY_FEATURE_KIND]: true,
        [STORY_LAYER_PROPERTY]: VectorTileLayerType.RAIL_ROUTES,
        lineCode: route.lineCode,
        name: route.name,
        color: route.color,
      });
      return feature;
    });
    const routeLayer = new VectorLayer({
      source: new VectorSource({ features: routeFeatures }),
      zIndex: 15,
      visible: this.isLayerVisible(VectorTileLayerType.RAIL_ROUTES),
      style: (feature) =>
        new Style({
          stroke: new Stroke({
            color: String(feature.get('color') ?? '#1769aa'),
            width: 5,
            lineCap: 'round',
            lineJoin: 'round',
          }),
        }),
    });
    const stationFeatures = STORY_STATIONS.map((station) => {
      const feature = new Feature({
        geometry: new Point(fromLonLat([station.longitude, station.latitude])),
      });
      feature.setId(station.id);
      feature.setProperties({
        [STORY_FEATURE_KIND]: true,
        [STORY_LAYER_PROPERTY]: VectorTileLayerType.RAIL_STATIONS,
        id: station.id,
        name: station.name,
        agencies: station.agencies,
        lines: station.lines,
        isMerged: station.isMerged,
      });
      return feature;
    });
    const stationLayer = new VectorLayer({
      source: new VectorSource({ features: stationFeatures }),
      zIndex: 50,
      visible: this.isLayerVisible(VectorTileLayerType.RAIL_STATIONS),
      style: (feature) =>
        new Style({
          image: new CircleStyle({
            radius: 6,
            fill: new Fill({ color: '#ffffff' }),
            stroke: new Stroke({ color: '#25232a', width: 2 }),
          }),
          text: new Text({
            text: String(feature.get('name') ?? ''),
            font: '500 12px Roboto, sans-serif',
            offsetY: -14,
            fill: new Fill({ color: '#202124' }),
            stroke: new Stroke({ color: '#ffffff', width: 3 }),
          }),
        }),
    });

    this.storyLayers.set(VectorTileLayerType.RAIL_ROUTES, routeLayer);
    this.storyLayers.set(VectorTileLayerType.RAIL_STATIONS, stationLayer);
    map.addLayer(routeLayer);
    map.addLayer(stationLayer);

    const pointLayers = [
      {
        type: VectorTileLayerType.BUS_STOPS,
        points: [
          { ...PINHEIROS_BUS_STOP, featureId: PINHEIROS_BUS_STOP.stopId },
        ],
        color: '#d56a23',
      },
      {
        type: VectorTileLayerType.BIKE_STATIONS,
        points: [BIKE_STATION_FULL, BIKE_STATION_EMPTY].map((station) => ({
          ...station,
          featureId: station.stationId,
        })),
        color: '#2e7d32',
      },
    ];
    for (const { type, points, color } of pointLayers) {
      const layer = new VectorLayer({
        source: new VectorSource({
          features: points.map((point) => {
            const feature = new Feature({
              geometry: new Point(
                fromLonLat([point.longitude, point.latitude]),
              ),
            });
            feature.setProperties({
              [STORY_FEATURE_KIND]: true,
              [STORY_LAYER_PROPERTY]: type,
              name: point.name,
              ...(type === VectorTileLayerType.BUS_STOPS
                ? { stopId: PINHEIROS_BUS_STOP.stopId }
                : { stationId: point.featureId }),
            });
            return feature;
          }),
        }),
        zIndex: type === VectorTileLayerType.BUS_STOPS ? 45 : 30,
        visible: this.isLayerVisible(type),
        style: (feature) =>
          new Style({
            image: new CircleStyle({
              radius: 8,
              fill: new Fill({ color }),
              stroke: new Stroke({ color: '#ffffff', width: 2 }),
            }),
            text: new Text({
              text: String(feature.get('name') ?? ''),
              font: '500 12px Roboto, sans-serif',
              offsetY: -17,
              fill: new Fill({ color: '#202124' }),
              stroke: new Stroke({ color: '#ffffff', width: 3 }),
            }),
          }),
      });
      this.storyLayers.set(type, layer);
      map.addLayer(layer);
    }
  }

  override setLayerVisibility(
    layerType: VectorTileLayerType,
    visible: boolean,
  ): void {
    super.setLayerVisibility(layerType, visible);
    this.storyLayers.get(layerType)?.setVisible(visible);
  }

  override toggleLayer(layerType: VectorTileLayerType): void {
    super.toggleLayer(layerType);
    this.storyLayers.get(layerType)?.setVisible(this.isLayerVisible(layerType));
  }

  override isVectorTileFeature(feature: FeatureLike): boolean {
    return (
      feature.get(STORY_FEATURE_KIND) === true ||
      super.isVectorTileFeature(feature)
    );
  }

  override getFeatureLayerType(
    feature: FeatureLike,
  ): VectorTileLayerType | null {
    if (feature.get(STORY_FEATURE_KIND) === true) {
      return feature.get(STORY_LAYER_PROPERTY) as VectorTileLayerType;
    }
    return super.getFeatureLayerType(feature);
  }

  override extractRailStationData(
    feature: FeatureLike,
  ): RailStationTileData | null {
    if (
      feature.get(STORY_FEATURE_KIND) === true &&
      this.getFeatureLayerType(feature) === VectorTileLayerType.RAIL_STATIONS
    ) {
      return {
        id: String(feature.get('id')),
        name: String(feature.get('name')),
        agencies: feature.get('agencies') as string[],
        lines: feature.get('lines') as string[],
        isMerged: Boolean(feature.get('isMerged')),
      };
    }
    return super.extractRailStationData(feature);
  }

  override extractRailRouteData(
    feature: FeatureLike,
  ): RailRouteTileData | null {
    if (
      feature.get(STORY_FEATURE_KIND) === true &&
      this.getFeatureLayerType(feature) === VectorTileLayerType.RAIL_ROUTES
    ) {
      const lineCode = Number(feature.get('lineCode'));
      return {
        id: lineCode,
        name: String(feature.get('name')),
        lineCode,
        lineNumber: lineCode,
        colorHex: String(feature.get('color')),
        agency: 'METRÔ',
      };
    }
    return super.extractRailRouteData(feature);
  }

  override extractBusStopData(feature: FeatureLike): BusStopTileData | null {
    if (
      feature.get(STORY_FEATURE_KIND) === true &&
      this.getFeatureLayerType(feature) === VectorTileLayerType.BUS_STOPS
    ) {
      return {
        stopId: PINHEIROS_BUS_STOP.stopId,
        name: PINHEIROS_BUS_STOP.name,
        latitude: PINHEIROS_BUS_STOP.latitude,
        longitude: PINHEIROS_BUS_STOP.longitude,
      };
    }
    return super.extractBusStopData(feature);
  }

  override extractBikeStationData(
    feature: FeatureLike,
  ): BikeStationTileData | null {
    if (
      feature.get(STORY_FEATURE_KIND) === true &&
      this.getFeatureLayerType(feature) === VectorTileLayerType.BIKE_STATIONS
    ) {
      const station = [BIKE_STATION_FULL, BIKE_STATION_EMPTY].find(
        (item) => item.stationId === feature.get('stationId'),
      );
      if (station) {
        return {
          stationId: station.stationId,
          latitude: station.latitude,
          longitude: station.longitude,
          capacity: station.capacity,
          numBikesAvailable: station.numBikesAvailable,
          electricBikesAvailable: station.electricBikesAvailable,
          effectiveCapacity: station.effectiveCapacity,
        };
      }
    }
    return super.extractBikeStationData(feature);
  }
}

export interface MapStoryScenario {
  selectedRoutes?: SelectedRoute[];
  vehiclePositions?: Map<string, VehiclePositionUpdate>;
  locationPermission?: LocationPermissionState;
  isRequestingLocation?: boolean;
  stationPhotos?: boolean;
  stationDetail?: {
    stop: BusStopGraphQL;
    summary?: string;
    initialSnap?: MapPanelSnap;
  };
  busStopDetail?: boolean;
  bikeStationDetail?: boolean;
}

function createStoryFavoritesService() {
  const favoriteIds = signal(new Set<string>());
  return {
    favorites: signal({ ...emptyFavorites }).asReadonly(),
    isFavorite: (id: string) => favoriteIds().has(id),
    addFavorite: (id: string) =>
      favoriteIds.update((ids) => new Set(ids).add(id)),
    removeFavorite: (id: string) =>
      favoriteIds.update((ids) => {
        const next = new Set(ids);
        next.delete(id);
        return next;
      }),
  };
}

export const MAP_STORY_ROUTER_PROVIDERS = [
  { provide: APP_BASE_HREF, useValue: '/' },
  provideRouter(
    [
      {
        path: '',
        component: ToolbarLayoutComponent,
        data: { cityId: 'sp' },
        children: [
          {
            path: '**',
            component: MapMainComponent,
            data: {
              title: 'Mapa',
              noXPadding: true,
              viewportLayout: true,
            },
          },
        ],
      },
    ],
    withDisabledInitialNavigation(),
  ),
];

export function createMapStoryProviders(scenario: MapStoryScenario = {}) {
  const station = scenario.stationDetail?.stop ?? PARAISO;
  const railServiceOptions: MockRailServiceOptions = {
    cached: null,
    isFresh: false,
    fetchKind: 'normal',
    fetchDelayMs: 0,
  };

  return [
    ...createSubwayStationDialogProviders(station, railServiceOptions),
    {
      provide: MapRealtimeStatusService,
      useValue: {
        state: signal('connected'),
        tooltip: signal('Acompanhamento em tempo real conectado'),
      },
    },
    ...(scenario.stationPhotos
      ? [{ provide: StationImagesService, useClass: StationImagesService }]
      : []),
    { provide: LoggerService, useValue: createMockLoggerService() },
    {
      provide: API_BASE_URL,
      useValue: scenario.stationPhotos
        ? sharedProdEnvironment.apiUrl
        : 'http://storybook.invalid',
    },
    {
      provide: FavoritesService,
      useValue: createStoryFavoritesService(),
    },
    {
      provide: RealtimeWebsocketService,
      useFactory: () => ({
        ...createMockRealtimeService({ fetchKind: 'no-arrivals' }),
        vehiclePositions: () => scenario.vehiclePositions ?? new Map(),
      }),
    },
    ...(scenario.vehiclePositions
      ? []
      : [
          {
            provide: RealtimeVehicleLayerService,
            useValue: { getLayer: () => null },
          },
        ]),
    {
      provide: CptmVehicleLayerService,
      useValue: { getLayer: () => null },
    },
    {
      provide: BikeStationsService,
      useValue: {
        stations: signal([BIKE_STATION_FULL, BIKE_STATION_EMPTY]),
        refreshTick: signal(0),
        activate: () => Promise.resolve(),
        disconnect: () => undefined,
        getStation: (id: string) =>
          [BIKE_STATION_FULL, BIKE_STATION_EMPTY].find(
            (station) => station.stationId === id,
          ) ?? null,
        upsertStationSummary: (summary: { stationId: string }) =>
          [BIKE_STATION_FULL, BIKE_STATION_EMPTY].find(
            (station) => station.stationId === summary.stationId,
          ) ?? BIKE_STATION_FULL,
        ensureStationDetails: () => undefined,
      },
    },
    {
      provide: GeolocationService,
      useValue: {
        permission: signal(scenario.locationPermission ?? 'prompt'),
        isSupported: () => true,
        requestLocation: () =>
          Promise.resolve({
            latitude: PARAISO.latitude,
            longitude: PARAISO.longitude,
          }),
        isDisabled: computed(
          () =>
            scenario.locationPermission === 'denied' ||
            scenario.locationPermission === 'unavailable',
        ),
        isRequesting: signal(scenario.isRequestingLocation ?? false),
      },
    },
    {
      provide: UserLocationLayerService,
      useFactory: () => {
        const map = inject(MapService);
        return {
          addToMap: () => undefined,
          stopTracking: () => undefined,
          removeFromMap: () => undefined,
          centerOnUser: async () =>
            map.centerOn([PARAISO.longitude, PARAISO.latitude], 14),
        };
      },
    },
    { provide: VectorTileLayerService, useClass: StoryVectorTileLayerService },
    // The station panel uses MAP_PANEL_REF; this dialog fallback remains for
    // existing child content that still asks for MatDialogRef.
    {
      provide: MatDialogRef,
      useValue: { close: () => undefined },
    },
    provideEnvironmentInitializer(() => {
      const mapState = inject(MapStateService);
      const vectorTiles = inject(VectorTileLayerService);
      const panel = inject(MapPanelService);

      mapState.selectedRoutes.set(
        new Map(
          (scenario.selectedRoutes ?? []).map((route) => [route.id, route]),
        ),
      );
      vectorTiles.setLayerVisibility(VectorTileLayerType.RAIL_STATIONS, true);
      vectorTiles.setLayerVisibility(VectorTileLayerType.RAIL_ROUTES, true);
      vectorTiles.setLayerVisibility(VectorTileLayerType.BUS_STOPS, true);
      vectorTiles.setLayerVisibility(VectorTileLayerType.BIKE_STATIONS, true);

      if (scenario.stationDetail) {
        const { stop, summary, initialSnap } = scenario.stationDetail;
        const titleLineGroups = buildMapPanelAgencyLineGroups(
          stop.routeShortNames ?? [],
        );
        panel.openComponent<SubwayStationDialogData, void>({
          component: SubwayStationDialogComponent,
          data: { stop },
          title: stop.name,
          summary:
            titleLineGroups.length && summary?.startsWith('Linhas ')
              ? ''
              : (summary ?? ''),
          titleLineGroups,
          icon: 'train',
          initialSnap,
        });
      }
      if (scenario.busStopDetail) {
        panel.openComponent({
          component: BusStopDialogComponent,
          data: {
            stop: PINHEIROS_BUS_STOP,
            routes: [],
            selectedRoutes: new Set<string>(),
          },
          title: PINHEIROS_BUS_STOP.name,
          summary: '',
          icon: 'directions_bus',
          initialSnap: 'expanded',
        });
      }
      if (scenario.bikeStationDetail) {
        panel.openComponent({
          component: BikeStationDialogComponent,
          data: { station: BIKE_STATION_FULL },
          title: BIKE_STATION_FULL.name,
          summary: `${BIKE_STATION_FULL.numBikesAvailable} bicicletas, ${BIKE_STATION_FULL.numDocksAvailable} vagas livres`,
          icon: 'pedal_bike',
          initialSnap: 'expanded',
        });
      }
    }),
  ];
}

export const STORY_MAP_REFERENCE_STOPS = {
  pinheiros: PINHEIROS_BUS_STOP,
  bikeStations: [BIKE_STATION_FULL, BIKE_STATION_EMPTY],
};

export const STORY_MAP_DEFAULT_STATION = PARAISO;
