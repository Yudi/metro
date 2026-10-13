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
  isBusDirectionFavorite,
  isBusLineFavorite,
  getBusLineDirectionAnchor,
  matchBusDirectionFavorite,
  parseBusDirectionFavorite,
} from '@metro/shared/utils';
import { MapService } from './map.service';
import { MapStateService } from './map-state.service';
import { MapDisplayService } from './map-display.service';
import { MapInteractionService } from './map-interaction.service';
import { BikeStationsService } from '../../geography/bike-stations.service';
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
  private lastDetailHandoff: string | null = null;
  private readonly isApplyingSavedState = signal(false);
  private session = 0;
  private lastCameraParams: string | null = null;
  private readonly appliedLayerParams = new Map<string, boolean>();
  private appliedSavedStateForNavigation = false;
  private lastDefaultStateRequest =
    this.mapViewStateStorage.defaultStateRequests();

  constructor() {
    this.setupDefaultStateRequestHandler();
    this.setupMapStatePersistence();
  }

  beginSession(): void {
    this.session++;
    this.persistenceReady.set(false);
    this.isApplyingSavedState.set(false);
    this.lastCameraParams = null;
    this.appliedLayerParams.clear();
    this.appliedFavoriteSelections.clear();
    this.appliedSavedStateForNavigation = false;
    this.lastDetailHandoff = null;
  }

  endSession(): void {
    this.session++;
    this.persistenceReady.set(false);
    this.isApplyingSavedState.set(false);
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
      if (!this.persistenceReady() || this.isApplyingSavedState() || !state) {
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
    const vectorTileService = this.mapService.getVectorTileLayerService();
    if (!center || zoom === null) return null;

    return {
      center,
      zoom,
      vectorLayers: {
        [VectorTileLayerType.BIKE_STATIONS]: vectorTileService.isLayerVisible(VectorTileLayerType.BIKE_STATIONS),
        [VectorTileLayerType.BUS_STOPS]: vectorTileService.isLayerVisible(
          VectorTileLayerType.BUS_STOPS,
        ),
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
    const session = this.session;
    this.isApplyingSavedState.set(true);
    try {
      const savedState = await this.mapViewStateStorage.readLastState();
      if (session !== this.session) return;
      if (!savedState) {
        this.applyDefaultMapState();
        return;
      }
      await this.applySavedMapState(savedState, session);
    } catch (error) {
      if (session === this.session) this.logger.error('Failed to restore saved map state', error);
    } finally {
      if (session === this.session) this.isApplyingSavedState.set(false);
    }
  }

  private async applySavedMapState(state: SavedMapViewState, session: number): Promise<void> {
    this.interactionService.clearAllSelections(false);
    const vectorTileService = this.mapService.getVectorTileLayerService();
    const bikeVisible = state.vectorLayers[VectorTileLayerType.BIKE_STATIONS] ?? false;
    vectorTileService.setLayerVisibility(VectorTileLayerType.BIKE_STATIONS, bikeVisible);
    vectorTileService.setLayerVisibility(
      VectorTileLayerType.RAIL_STATIONS,
      state.vectorLayers[VectorTileLayerType.RAIL_STATIONS] ?? true,
    );
    vectorTileService.setLayerVisibility(
      VectorTileLayerType.RAIL_ROUTES,
      state.vectorLayers[VectorTileLayerType.RAIL_ROUTES] ?? false,
    );
    vectorTileService.setLayerVisibility(
      VectorTileLayerType.BUS_STOPS,
      state.vectorLayers[VectorTileLayerType.BUS_STOPS] ?? true,
    );
    if (bikeVisible) {
      await this.bikeStationsService.activate();
      if (session !== this.session) return;
      this.mapState.setBikeStations(this.bikeStationsService.stations());
    }
    for (const routeId of state.selections.routeIds) {
      if (session !== this.session) return;
      await this.restoreRouteSelection(routeId);
    }
    for (const stopId of state.selections.stopIds) {
      if (session !== this.session) return;
      await this.interactionService.addStopToSelection(stopId, false);
    }
    if (session !== this.session) return;
    for (const stationId of state.selections.bikeStationIds) {
      this.interactionService.addBikeStationToSelection(stationId, false);
    }
    this.mapService.centerOn(state.center, state.zoom);
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
    this.isApplyingSavedState.set(true);
    try {
      this.interactionService.clearAllSelections(false);
      this.displayService.clearAddressLocation();
      this.mapService
        .getVectorTileLayerService()
        .setLayerVisibility(VectorTileLayerType.BIKE_STATIONS, false);
      this.mapService
        .getVectorTileLayerService()
        .setLayerVisibility(VectorTileLayerType.RAIL_STATIONS, true);
      this.mapService
        .getVectorTileLayerService()
        .setLayerVisibility(VectorTileLayerType.RAIL_ROUTES, false);
      this.mapService
        .getVectorTileLayerService()
        .setLayerVisibility(VectorTileLayerType.BUS_STOPS, true);
      this.mapService.centerOn(
        this.cityContext.center(),
        this.cityContext.city().map.zoom,
      );


    } finally {
      this.isApplyingSavedState.set(false);
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
    const directionCandidates = favorites.busRoute.flatMap((code) => {
      const identity = parseBusDirectionFavorite(code);
      return identity ? [{ ...identity, directionId: -1, destination: '' }] : [];
    });
    for (const key of this.appliedFavoriteSelections) {
      if (!key.startsWith('busRoute:')) continue;
      const code = key.slice('busRoute:'.length);
      const anchor = getBusLineDirectionAnchor(code);
      if (anchor && !favorites.busRoute.includes(code) && matchBusDirectionFavorite(anchor, directionCandidates)) {
        this.interactionService.removeRouteFromSelection(code, false);
        this.appliedFavoriteSelections.delete(key);
      }
    }
    for (const routeId of favorites.busRoute) {
      // Legacy line favorites are expanded by FavoritesService. Waiting for
      // that result avoids also selecting a whole-line overlay underneath
      // the two independently removable direction selections.
      if (!isBusDirectionFavorite(routeId) && !isBusLineFavorite(routeId)) continue;
      this.applyFavoriteSelection(`busRoute:${routeId}`, () => {
        void this.interactionService.addRouteToSelection(routeId, false);
      });
    }
    for (const stationId of favorites.bikeStation) {
      this.applyFavoriteSelection(`bikeStation:${stationId}`, () => {
        this.mapService
          .getVectorTileLayerService()
          .setLayerVisibility(VectorTileLayerType.BIKE_STATIONS, true);
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

    for (const lineId of (paramGet('railRoutes') ?? '')
      .split(',')
      .filter(Boolean)) {
      this.applyFavoriteSelection(`queryRailRoute:${lineId}`, () => {
        this.interactionService.addRailLineToSelection(lineId, false);
      });
    }

    const layerParams: ReadonlyArray<readonly [string, VectorTileLayerType]> = [
      ['bike', VectorTileLayerType.BIKE_STATIONS],
      ['subwayStations', VectorTileLayerType.RAIL_STATIONS],
      ['subwayRoutes', VectorTileLayerType.RAIL_ROUTES],
      ['busStopsLayer', VectorTileLayerType.BUS_STOPS],
    ];
    for (const [param, layer] of layerParams) {
      const enabled = parseBoolean(paramGet(param));
      if (enabled === null) {
        this.appliedLayerParams.delete(param);
      } else if (this.appliedLayerParams.get(param) !== enabled) {
        this.appliedLayerParams.set(param, enabled);
        vectorTileService.setLayerVisibility(layer, enabled);
      }
    }

    const parseIds = (param: string) => Array.from(new Set(
      (paramGet(param) ?? '').split(',').map((value) => value.trim()).filter(Boolean),
    ));
    for (const routeId of parseIds('busRoutes')) {
      this.applyFavoriteSelection(`queryBusRoute:${routeId}`, () => {
        void this.interactionService.addRouteToSelection(routeId, false);
      });
    }
    for (const stopId of new Set([...parseIds('busStops'), ...parseIds('railStations')])) {
      this.applyFavoriteSelection(`queryStop:${stopId}`, () => {
        void this.interactionService.addStopToSelection(stopId, false);
      });
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
    const terminalId = paramGet('openTerminal')?.trim();
    const stopId = paramGet('openStop')?.trim();
    const handoff = terminalId
      ? `terminal:${terminalId}`
      : stopId
        ? `stop:${stopId}`
        : null;
    const isRepeatedDetailHandoff =
      handoff !== null && handoff === this.lastDetailHandoff;

    const railStationId = paramGet('railStationId');
    if (railStationId && isValidLat(lat) && isValidLon(lon)) {
      this.applyFavoriteSelection(`queryRailStation:${railStationId}`, () => {
        this.mapState.addStopToSelection({
          id: railStationId,
          name: paramGet('railStationName') || railStationId,
          latitude: lat as number,
          longitude: lon as number,
          isSubwayStation: true,
        });
      });
    }

    const bikeStationId = paramGet('bikeStationId');
    if (bikeStationId && isValidLat(lat) && isValidLon(lon)) {
      this.applyFavoriteSelection(`queryBikeStation:${bikeStationId}`, () => {
        if (!this.bikeStationsService.getStation(bikeStationId)) {
          this.bikeStationsService.upsertStationSummary({
            stationId: bikeStationId,
            name: paramGet('bikeStationName') || bikeStationId,
            latitude: lat as number,
            longitude: lon as number,
            capacity: null,
            effectiveCapacity: 0,
            numBikesAvailable: 0,
            electricBikesAvailable: 0,
          });
        }
        this.mapState.setBikeStations(this.bikeStationsService.stations());
        this.interactionService.addBikeStationToSelection(bikeStationId, false);
        this.bikeStationsService.ensureStationDetails(bikeStationId);
      });
    }

    const cameraParams = JSON.stringify([lat, lon, zoom]);
    if (!isRepeatedDetailHandoff && cameraParams !== this.lastCameraParams) {
      this.lastCameraParams = cameraParams;
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

    if (!handoff) {
      this.lastDetailHandoff = null;
      return;
    }
    if (!this.mapService.getMap()) {
      // This service survives route changes. A newly created map must accept
      // the same detail link after the previous map has been destroyed.
      this.lastDetailHandoff = null;
      return;
    }
    if (handoff === this.lastDetailHandoff) {
      return;
    }

    this.lastDetailHandoff = handoff;
    if (terminalId) {
      this.interactionService.showBusTerminalDetails(terminalId);
    } else if (stopId) {
      void this.interactionService.showRoutesForStop(stopId);
      if (isValidLat(lat) && isValidLon(lon)) {
        this.displayService.centerOn(
          [lon as number, lat as number],
          isValidZoom(zoom) ? (zoom as number) : 16,
        );
      }
    }
  }
}
