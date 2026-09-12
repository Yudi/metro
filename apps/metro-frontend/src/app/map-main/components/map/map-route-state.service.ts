import { CityContextService } from '../../../cities/city-context.service';
import { Service, effect, inject, signal, untracked } from '@angular/core';
import { ParamMap } from '@angular/router';
import {
  FavoritesService,
  LoggerService,
  RailGraphqlService,
} from '@metro/shared/api';
import {
  FavoriteList,
  getRailLineByCode,
  getRailLineById,
} from '@metro/shared/utils';
import { MapService } from './map.service';
import { MapStateService } from './map-state.service';
import { MapDataLoaderService } from './map-data-loader.service';
import { MapDisplayService } from './map-display.service';
import { MapInteractionService } from './map-interaction.service';
import { BikeStationsService } from '../../geography/bike-stations.service';
import { LayerType } from './layers/map-layer.service';
import { VectorTileLayerType } from './vector-tiles/vector-tile-layer.service';
import {
  MAP_VIEW_STATE_RESTORE_PARAM,
  MapViewStateStorageService,
  SavedMapViewState,
} from './map-view-state-storage.service';

/** Applies route parameters and persists the map view between navigations. */
@Service()
export class MapRouteStateService {
  readonly cityContext = inject(CityContextService);
  private readonly mapService = inject(MapService);
  private readonly mapState = inject(MapStateService);
  private readonly dataLoader = inject(MapDataLoaderService);
  private readonly displayService = inject(MapDisplayService);
  private readonly interactionService = inject(MapInteractionService);
  private readonly bikeStationsService = inject(BikeStationsService);
  private readonly railService = inject(RailGraphqlService);
  private readonly favoritesService = inject(FavoritesService);
  private readonly mapViewStateStorage = inject(MapViewStateStorageService);
  private readonly logger = inject(LoggerService);
  readonly favorites = this.favoritesService.favorites;
  private readonly persistenceReady = signal(false);
  private readonly appliedFavoriteSelections = new Set<string>();
  private isApplyingSavedState = false;
  private appliedSavedStateForNavigation = false;
  private lastDefaultStateRequest =
    this.mapViewStateStorage.defaultStateRequests();

  constructor() {
    this.setupDefaultStateRequestHandler();
    this.setupMapStatePersistence();
  }

  markPersistenceReady(): void {
    this.persistenceReady.set(true);
  }

  applyRouteState(params: ParamMap | Record<string, unknown>): void {
    if (this.shouldRestoreSavedState(params)) {
      void this.restoreLastMapState();
      return;
    }
    this.applyQueryParams(params);
  }

  private setupDefaultStateRequestHandler(): void {
    effect(() => {
      const requestCount = this.mapViewStateStorage.defaultStateRequests();
      if (requestCount === this.lastDefaultStateRequest) return;

      this.lastDefaultStateRequest = requestCount;
      untracked(() => this.applyDefaultMapState());
    });
  }

  private setupMapStatePersistence(): void {
    effect((onCleanup) => {
      const state = this.captureMapViewState();
      if (!this.persistenceReady() || this.isApplyingSavedState || !state) {
        return;
      }

      const timeoutId = setTimeout(() => {
        this.mapViewStateStorage.saveLastState(state);
      }, 350);
      onCleanup(() => clearTimeout(timeoutId));
    });
  }

  private captureMapViewState(): SavedMapViewState | null {
    const center = this.mapService.center();
    const zoom = this.mapService.zoomLevel();
    const layerService = this.mapService.getLayerService();
    const vectorTileService = this.mapService.getVectorTileLayerService();
    if (!center || zoom === null) return null;

    return {
      center,
      zoom,
      displayMode: this.mapState.displayMode(),
      nearbyCenter: this.mapState.nearbyCenter(),
      nearbyRadius: this.mapState.nearbyRadius(),
      layers: {
        [LayerType.BIKE]: layerService.isLayerVisible(LayerType.BIKE),
      },
      vectorLayers: {
        [VectorTileLayerType.RAIL_STATIONS]: vectorTileService.isLayerVisible(
          VectorTileLayerType.RAIL_STATIONS,
        ),
        [VectorTileLayerType.RAIL_ROUTES]: vectorTileService.isLayerVisible(
          VectorTileLayerType.RAIL_ROUTES,
        ),
      },
      selections: {
        routeIds: Array.from(this.mapState.selectedRoutes().keys()),
        stopIds: Array.from(this.mapState.selectedStops().keys()),
        bikeStationIds: Array.from(this.mapState.selectedBikeStations().keys()),
      },
    };
  }

  private shouldRestoreSavedState(
    params: ParamMap | Record<string, unknown>,
  ): boolean {
    const value = this.getParamValue(params, MAP_VIEW_STATE_RESTORE_PARAM);
    return value === '1' || value === 'true';
  }

  private async restoreLastMapState(): Promise<void> {
    if (!this.mapService.getMap() || this.appliedSavedStateForNavigation) {
      return;
    }

    this.appliedSavedStateForNavigation = true;
    const savedState = await this.mapViewStateStorage.readLastState();
    if (!savedState) {
      this.applyDefaultMapState();
      return;
    }
    await this.applySavedMapState(savedState);
  }

  private async applySavedMapState(state: SavedMapViewState): Promise<void> {
    this.isApplyingSavedState = true;
    try {
      this.interactionService.clearAllSelections(false);
      const layerService = this.mapService.getLayerService();
      const vectorTileService = this.mapService.getVectorTileLayerService();
      layerService.setLayerVisibility(
        LayerType.BIKE,
        state.layers[LayerType.BIKE] ?? false,
      );
      vectorTileService.setLayerVisibility(
        VectorTileLayerType.RAIL_STATIONS,
        state.vectorLayers[VectorTileLayerType.RAIL_STATIONS] ?? true,
      );
      vectorTileService.setLayerVisibility(
        VectorTileLayerType.RAIL_ROUTES,
        state.vectorLayers[VectorTileLayerType.RAIL_ROUTES] ?? false,
      );

      if (state.layers[LayerType.BIKE]) {
        await this.bikeStationsService.activate();
        this.mapState.setBikeStations(this.bikeStationsService.stations());
      }
      for (const routeId of state.selections.routeIds) {
        await this.restoreRouteSelection(routeId);
      }
      for (const stopId of state.selections.stopIds) {
        await this.interactionService.addStopToSelection(stopId, false);
      }
      for (const stationId of state.selections.bikeStationIds) {
        this.interactionService.addBikeStationToSelection(stationId, false);
      }

      this.mapState.nearbyRadius.set(state.nearbyRadius);
      this.mapState.nearbyCenter.set(state.nearbyCenter);
      this.mapState.displayMode.set(state.displayMode);
      if (state.displayMode === 'nearby' && state.nearbyCenter) {
        this.dataLoader.loadNearbyStops(
          state.nearbyCenter.lat,
          state.nearbyCenter.lon,
        );
      } else {
        this.dataLoader.syncVectorTileFilters();
      }
      this.mapService.centerOn(state.center, state.zoom);
      this.displayService.updateMapDisplay();
    } catch (error) {
      this.logger.error('Failed to restore saved map state', error);
    } finally {
      this.isApplyingSavedState = false;
    }
  }

  private async restoreRouteSelection(routeId: string): Promise<void> {
    const specialService = this.railService
      .specialServices()
      .find((service) => service.code === routeId);
    if (specialService) {
      this.interactionService.addSpecialRailLineToSelection(
        specialService,
        false,
      );
      return;
    }
    if (getRailLineById(routeId)) {
      this.interactionService.addRailLineToSelection(routeId, false);
      return;
    }
    await this.interactionService.addRouteToSelection(routeId, false);
  }

  private applyDefaultMapState(): void {
    this.isApplyingSavedState = true;
    try {
      this.interactionService.clearAllSelections(false);
      this.mapState.displayMode.set('selected');
      this.mapState.nearbyCenter.set(null);
      this.mapState.nearbyRadius.set(1000);
      this.displayService.clearExploreLocation();
      this.displayService.clearNearbyFeatures();
      this.mapService
        .getLayerService()
        .setLayerVisibility(LayerType.BIKE, false);
      this.mapService
        .getVectorTileLayerService()
        .setLayerVisibility(VectorTileLayerType.RAIL_STATIONS, true);
      this.mapService
        .getVectorTileLayerService()
        .setLayerVisibility(VectorTileLayerType.RAIL_ROUTES, false);
      this.mapService.centerOn(this.cityContext.center(), this.cityContext.city().map.zoom);
      this.dataLoader.syncVectorTileFilters();
      this.displayService.updateMapDisplay();
    } finally {
      this.isApplyingSavedState = false;
    }

    const state = this.captureMapViewState();
    if (this.persistenceReady() && state) {
      this.mapViewStateStorage.saveLastState(state);
    }
  }

  private getParamValue(
    params: ParamMap | Record<string, unknown>,
    key: string,
  ): string | null {
    if (
      !!params &&
      typeof (params as ParamMap).has === 'function' &&
      typeof (params as ParamMap).get === 'function'
    ) {
      return (params as ParamMap).get(key);
    }
    const value = (params as Record<string, unknown>)[key];
    return typeof value === 'string' ? value : null;
  }

  private autoSelectFavorites(favorites: FavoriteList): void {
    for (const routeId of favorites.busRoute) {
      this.applyFavoriteSelection(`busRoute:${routeId}`, () => {
        void this.interactionService.addRouteToSelection(routeId, false);
      });
    }
    for (const stationId of favorites.bikeStation) {
      this.applyFavoriteSelection(`bikeStation:${stationId}`, () => {
        this.mapService
          .getLayerService()
          .setLayerVisibility(LayerType.BIKE, true);
        this.interactionService.addBikeStationToSelection(stationId, false);
      });
    }
    for (const lineCode of favorites.railLine) {
      const specialService = this.railService
        .specialServices()
        .find((service) => service.code === lineCode);
      if (specialService) {
        this.applyFavoriteSelection(`railLine:${lineCode}`, () => {
          this.interactionService.addSpecialRailLineToSelection(
            specialService,
            false,
          );
        });
        continue;
      }

      const lineId = this.getRailFavoriteLineId(lineCode);
      if (!lineId) continue;
      this.applyFavoriteSelection(`railLine:${lineId}`, () => {
        this.interactionService.addRailLineToSelection(lineId, false);
      });
    }
    if (favorites.railStation.length > 0) {
      this.mapService
        .getVectorTileLayerService()
        .setLayerVisibility(VectorTileLayerType.RAIL_STATIONS, true);
    }
  }

  applyFavorites(favorites: FavoriteList): void {
    untracked(() => this.autoSelectFavorites(favorites));
  }

  private applyFavoriteSelection(key: string, select: () => void): void {
    if (this.appliedFavoriteSelections.has(key)) return;
    this.appliedFavoriteSelections.add(key);
    select();
  }

  private getRailFavoriteLineId(value: string): string | null {
    const numericCode = Number(value);
    return Number.isFinite(numericCode)
      ? (getRailLineByCode(numericCode)?.lineId ?? null)
      : value;
  }

  private applyQueryParams(params: ParamMap | Record<string, unknown>): void {
    const isParamMap = (
      value: ParamMap | Record<string, unknown>,
    ): value is ParamMap =>
      !!value &&
      typeof (value as ParamMap).has === 'function' &&
      typeof (value as ParamMap).get === 'function';
    const paramHas = (key: string) =>
      isParamMap(params)
        ? params.has(key)
        : Object.prototype.hasOwnProperty.call(params, key);
    const paramGet = (key: string): string | null =>
      isParamMap(params)
        ? (params.get(key) as string | null)
        : ((params[key] as string | null) ?? null);
    const parseBoolean = (value: string | null) => {
      if (value === null) return null;
      return ['1', 'true', 'yes', 'on'].includes(
        String(value).toLowerCase().trim(),
      );
    };

    const layerService = this.mapService.getLayerService();
    const vectorTileService = this.mapService.getVectorTileLayerService();
    const specialLineCode = paramGet('railLine');
    if (specialLineCode) {
      const specialService = this.railService
        .specialServices()
        .find((service) => service.code === specialLineCode);
      if (specialService) {
        this.applyFavoriteSelection(`queryRailLine:${specialLineCode}`, () => {
          this.interactionService.addSpecialRailLineToSelection(
            specialService,
            false,
          );
        });
      }
    }

    const mappings: Array<{
      param: string;
      kind: 'layer' | 'vector' | 'feature';
      id?: string;
    }> = [
      { param: 'bike', kind: 'layer', id: LayerType.BIKE },
      {
        param: 'subwayStations',
        kind: 'vector',
        id: VectorTileLayerType.RAIL_STATIONS,
      },
      {
        param: 'subwayRoutes',
        kind: 'vector',
        id: VectorTileLayerType.RAIL_ROUTES,
      },
      { param: 'busStops', kind: 'feature' },
      { param: 'busRoutes', kind: 'feature' },
      { param: 'railStations', kind: 'feature' },
    ];

    for (const mapping of mappings) {
      if (!paramHas(mapping.param)) continue;
      const enabled = parseBoolean(paramGet(mapping.param));
      if (enabled === null && mapping.kind !== 'feature') continue;

      if (mapping.kind === 'feature') {
        const parseIds = (key: string) =>
          (paramGet(key) ?? '')
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean);
        parseIds('busRoutes').forEach((routeId) =>
          this.interactionService.addRouteToSelection(routeId, false),
        );
        parseIds('busStops').forEach((stopId) =>
          this.interactionService.addStopToSelection(stopId),
        );
        parseIds('railStations').forEach((stationId) =>
          this.interactionService.addStopToSelection(stationId),
        );
      } else if (mapping.kind === 'vector') {
        vectorTileService.setLayerVisibility(
          mapping.id as VectorTileLayerType,
          enabled as boolean,
        );
        this.logger.debug('Applied query param layer (vector)', {
          param: mapping.param,
          enabled,
        });
      } else {
        layerService.setLayerVisibility(
          mapping.id as LayerType,
          enabled as boolean,
        );
        this.logger.debug('Applied query param layer', {
          param: mapping.param,
          enabled,
        });
      }
    }

    const getNum = (keys: string[]) => {
      for (const key of keys) {
        if (!paramHas(key)) continue;
        const raw = paramGet(key);
        if (raw == null) return null;
        const number = Number(raw);
        if (!Number.isFinite(number)) return null;
        return number;
      }
      return null;
    };
    const lat = getNum(['lat', 'latitude']);
    const lon = getNum(['lon', 'lng', 'longitude']);
    const zoom = getNum(['zoom', 'z']);
    const isValidLat = (value: number | null) =>
      value !== null && value >= -90 && value <= 90;
    const isValidLon = (value: number | null) =>
      value !== null && value >= -180 && value <= 180;
    const isValidZoom = (value: number | null) =>
      value !== null && value >= 0 && value <= 28;

    if (isValidLat(lat) && isValidLon(lon)) {
      const useZoom = isValidZoom(zoom) ? (zoom as number) : undefined;
      try {
        this.mapService.centerOn([lon as number, lat as number], useZoom);
        this.logger.debug('Applied query param center/zoom', {
          lat,
          lon,
          zoom: useZoom,
        });
      } catch (error) {
        this.logger.error(
          'Failed to apply center/zoom from query params',
          error,
        );
      }
    } else if (isValidZoom(zoom) && (lat === null || lon === null)) {
      try {
        this.mapService.centerOn(this.cityContext.center(), zoom as number);
        this.logger.debug('Applied query param zoom with default center', {
          zoom,
        });
      } catch (error) {
        this.logger.error('Failed to apply zoom from query params', error);
      }
    } else if (lat !== null || lon !== null || zoom !== null) {
      this.logger.warn('Ignoring invalid center/zoom query params', {
        lat,
        lon,
        zoom,
      });
    }
  }
}
