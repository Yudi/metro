import { Service, inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { firstValueFrom, Observable } from 'rxjs';
import {
  extractTrackedRailVehicleLineCode,
  getBusRouteIdentity,
  matchBusDirectionFavorite,
  parseBusDirectionFavorite,
  getRailLineById,
  isArtespRoute,
  SpecialRailService,
  supportsSptransRealtime,
} from '@metro/shared/utils';
import { LoggerService } from '@metro/shared/api';
import { BikeStationsService } from '../../geography/bike-stations.service';
import { CptmVehicleLayerService } from '../../realtime/cptm-vehicle-layer.service';
import { RealtimeWebsocketService } from '../../realtime/realtime-websocket.service';
import {
  VectorTileLayerService,
  VectorTileLayerType,
} from './vector-tiles/vector-tile-layer.service';
import { GeographyCacheService } from '../../geography/geography-cache.service';
import { GeographyGraphQLService } from '../../geography/geography-graphql.service';
import type {
  BusRouteGraphQL,
  StopFullDataSnapshot,
} from '../../geography/geography-graphql.service';
import { MapDataLoaderService } from './map-data-loader.service';
import { MapDisplayService } from './map-display.service';
import type { MapFocusRequest } from './map-camera.service';
import { MapStateService } from './map-state.service';
import { SelectedRoute, SelectedStop } from './map.types';

interface PendingStopSelection {
  canonicalStopId?: string;
}

type SelectionKind = 'route' | 'stop' | 'bike';

interface BusDirectionCandidate {
  favoriteCode: string;
  directionId: number;
  destination: string;
  sourceAgency: string;
  shortName: string;
  originLatitude: number;
  originLongitude: number;
  viaLatitude: number;
  viaLongitude: number;
  destinationLatitude: number;
  destinationLongitude: number;
  route: BusRouteGraphQL;
}

@Service()
export class MapSelectionService {
  private readonly snackBar = inject(MatSnackBar);
  private readonly mapState = inject(MapStateService);
  private readonly dataLoader = inject(MapDataLoaderService);
  private readonly displayService = inject(MapDisplayService);
  private readonly logger = inject(LoggerService);
  private readonly bikeStationsService = inject(BikeStationsService);
  private readonly cache = inject(GeographyCacheService);
  private readonly geography = inject(GeographyGraphQLService);
  private readonly realtimeService = inject(RealtimeWebsocketService);
  private readonly cptmVehicleLayer = inject(CptmVehicleLayerService);
  private readonly vectorTileService = inject(VectorTileLayerService);
  private readonly pendingStopSelections = new Map<
    string,
    PendingStopSelection
  >();
  private readonly pendingRouteSelections = new Map<string, object>();
  private readonly pendingOppositeDirectionSelections = new Map<string, object>();
  private selectionFocus: {
    kind: SelectionKind;
    ids: Set<string>;
    request: MapFocusRequest;
  } | null = null;

  focusRouteOnMap(routeId: string, isRail: boolean): void {
    const focus = this.createSelectionFocus('route', routeId);
    const coordinates = isRail
      ? this.geography.getRailLineFocusCoordinates(routeId)
      : this.geography.getRouteFocusCoordinates(routeId);
    coordinates.subscribe({
      next: (points) => {
        if (focus.isCurrent()) focus.coordinates(points);
      },
      error: (error: unknown) =>
        this.logger.warn('Could not frame route from map link', error),
    });
  }

  async addRouteToSelection(
    routeId: string,
    shouldDisplaySnackbar: boolean,
    shouldContinue?: () => boolean,
  ): Promise<void> {
    const focus = shouldDisplaySnackbar
      ? this.createSelectionFocus('route', routeId)
      : null;
    this.logger.debug('Adding route to selection', { routeId });
    const request = {};
    this.pendingRouteSelections.set(routeId, request);

    const routeResult = await firstValueFrom(this.cache.getRoute(routeId)).then(
      (route) => ({ success: true as const, route }),
      (error: unknown) => ({ success: false as const, error }),
    );
    if (
      this.pendingRouteSelections.get(routeId) !== request ||
      shouldContinue?.() === false
    ) {
      if (this.pendingRouteSelections.get(routeId) === request) {
        this.pendingRouteSelections.delete(routeId);
      }
      return;
    }
    this.pendingRouteSelections.delete(routeId);
    if (!routeResult.success) {
      this.logger.error('Failed to load route selection', routeResult.error);
      if (shouldDisplaySnackbar) {
        this.snackBar.open('Não foi possível carregar a rota', 'Fechar', {
          duration: 3000,
        });
      }
      return;
    }

    const { route } = routeResult;
    if (!route) {
      this.logger.warn('Route not found', { routeId });
      if (shouldDisplaySnackbar) {
        this.snackBar.open('Rota não encontrada', 'Fechar', {
          duration: 2000,
        });
      }
      return;
    }

    const selectionId = getBusRouteIdentity(route);
    this.addFocusIdentity(focus, selectionId);
    const currentIdentity = parseBusDirectionFavorite(selectionId);
    if (currentIdentity) {
      const candidates = [...this.mapState.selectedRoutes().values()].flatMap((selection) => {
        const identity = parseBusDirectionFavorite(selection.id);
        // A single via point cannot prove that two circular trips are the
        // same service; leave those selections independent.
        if (!identity || Math.hypot(
          identity.destinationLatitude - identity.originLatitude,
          identity.destinationLongitude - identity.originLongitude,
        ) < 0.001) return [];
        return [{
          ...identity,
          selectionId: selection.id,
          directionId: selection.directionId ?? -1,
          destination: selection.destination ?? '',
        }];
      });
      const existingDirection = matchBusDirectionFavorite(selectionId, candidates);
      if (existingDirection) {
        this.addFocusIdentity(focus, existingDirection.selectionId);
        this.focusRoute(routeId, route, focus, existingDirection.selectionId);
        return;
      }
    }

    // The lookup is asynchronous, so two callers can pass the initial
    // selection check before either one updates map state. Only the first
    // completed lookup owns the realtime route subscription.
    if (this.mapState.selectedRoutes().has(selectionId)) {
      this.focusRoute(routeId, route, focus);
      return;
    }

    const selectedRoute: SelectedRoute = {
      id: selectionId,
      routeId: route.routeId,
      shortName: route.shortName,
      longName: route.longName,
      destination: route.destination,
      isCircular: route.isCircular,
      directionId: route.directionId,
      color: route.color ?? undefined,
      textColor: route.textColor ?? undefined,
      sourceAgency: route.sourceAgency,
      supportsRealtime: route.supportsRealtime,
      fares: route.fares,
    };
    this.mapState.addRouteToSelection(selectedRoute);

    this.logger.debug('Selected routes after addition', {
      selectedRoutes: Array.from(this.mapState.selectedRoutes().keys()),
    });

    void this.dataLoader.loadRouteData(routeId, shouldDisplaySnackbar);
    this.subscribeToRouteRealtime(route);
    this.focusRoute(routeId, route, focus);

    if (shouldDisplaySnackbar) {
      this.snackBar.open(`Rota adicionada`, 'Fechar', { duration: 2000 });
    }
  }

  async addOppositeDirectionToSelection(routeId: string): Promise<void> {
    const selectedRoute = this.mapState.selectedRoutes().get(routeId);
    if (
      !selectedRoute?.routeId ||
      !parseBusDirectionFavorite(selectedRoute.id) ||
      this.pendingOppositeDirectionSelections.has(routeId)
    ) {
      return;
    }

    const request = {};
    this.pendingOppositeDirectionSelections.set(routeId, request);
    try {
      let directions: BusRouteGraphQL[];
      try {
        directions = await firstValueFrom(
          this.geography.getBusRouteDirections([selectedRoute.routeId]),
        );
      } catch (error: unknown) {
        if (!this.isCurrentOppositeDirectionSelection(routeId, selectedRoute, request)) {
          return;
        }
        this.logger.error('Failed to load opposite bus direction', error);
        this.snackBar.open('Não foi possível carregar o sentido oposto', 'Fechar', {
          duration: 3000,
        });
        return;
      }

      if (!this.isCurrentOppositeDirectionSelection(routeId, selectedRoute, request)) {
        return;
      }

      const candidates = directions.flatMap((direction) => {
        const favoriteCode = direction.favoriteCode;
        const identity = parseBusDirectionFavorite(favoriteCode ?? '');
        if (!favoriteCode || !identity || direction.routeId !== selectedRoute.routeId || direction.directionId === undefined) {
          return [];
        }

        return [
          {
            ...identity,
            favoriteCode,
            directionId: direction.directionId,
            destination: direction.destination ?? direction.longName,
            sourceAgency: identity.sourceAgency,
            shortName: identity.shortName,
            route: direction,
          },
        ];
      });

      const selectedDirection = matchBusDirectionFavorite(
        selectedRoute.id,
        candidates,
      );
      const oppositeDirections = selectedDirection
        ? candidates.filter((candidate) =>
            candidate.favoriteCode !== selectedDirection.favoriteCode &&
            areOppositeBusDirections(selectedDirection, candidate),
          )
        : [];

      if (oppositeDirections.length !== 1) {
        this.snackBar.open(
          oppositeDirections.length === 0
            ? 'Sentido oposto não encontrado'
            : 'Não foi possível identificar um único sentido oposto',
          'Fechar',
          { duration: 2500 },
        );
        return;
      }

      await this.addRouteToSelection(
        oppositeDirections[0].favoriteCode,
        false,
        () =>
          this.isCurrentOppositeDirectionSelection(
            routeId,
            selectedRoute,
            request,
          ),
      );
    } finally {
      if (this.pendingOppositeDirectionSelections.get(routeId) === request) {
        this.pendingOppositeDirectionSelections.delete(routeId);
      }
    }
  }

  addRailLineToSelection(lineId: string, shouldDisplaySnackbar = true): void {
    this.logger.debug('Adding rail line to selection', { lineId });

    const railLine = getRailLineById(lineId);
    if (!railLine) {
      this.logger.warn('Rail line not found', { lineId });
      if (shouldDisplaySnackbar) {
        this.snackBar.open('Linha não encontrada', 'Fechar', {
          duration: 2000,
        });
      }
      return;
    }

    if (this.mapState.selectedRoutes().has(railLine.lineId)) {
      if (shouldDisplaySnackbar) this.focusRailLine(railLine.lineId);
      this.logger.debug('Rail line already selected', { lineId });
      if (shouldDisplaySnackbar) {
        this.snackBar.open('Linha já selecionada', 'Fechar', {
          duration: 2000,
        });
      }
      return;
    }

    const selectedRoute: SelectedRoute = {
      id: railLine.lineId,
      shortName: railLine.lineId,
      longName: railLine.fullName,
      color: railLine.colorHex.replace('#', ''),
      textColor: 'FFFFFF',
    };
    this.mapState.addRouteToSelection(selectedRoute);
    if (shouldDisplaySnackbar) this.focusRailLine(railLine.lineId);

    this.logger.debug('Selected routes after rail line addition', {
      selectedRoutes: Array.from(this.mapState.selectedRoutes().keys()),
    });

    const vehicleLineCode = extractTrackedRailVehicleLineCode(railLine.lineId);
    if (vehicleLineCode) {
      this.cptmVehicleLayer.subscribeToLine(vehicleLineCode);
      this.logger.info(
        `Subscribed to private vehicles for line: ${vehicleLineCode}`,
      );
    }

    this.vectorTileService.setLayerVisibility(
      VectorTileLayerType.RAIL_ROUTES,
      true,
    );

    if (shouldDisplaySnackbar) {
      this.snackBar.open(`${railLine.fullName} adicionada`, 'Fechar', {
        duration: 2000,
      });
    }
  }

  addSpecialRailLineToSelection(
    service: SpecialRailService,
    shouldDisplaySnackbar = true,
  ): void {
    if (this.mapState.selectedRoutes().has(service.code)) {
      if (shouldDisplaySnackbar) {
        this.snackBar.open('Linha já selecionada', 'Fechar', {
          duration: 2000,
        });
      }
      return;
    }

    this.mapState.addRouteToSelection({
      id: service.code,
      shortName: service.code,
      longName: service.name,
      color: service.colorHex.replace('#', ''),
      textColor: service.textColorHex.replace('#', ''),
    });
    this.cptmVehicleLayer.subscribeToLine(service.code);

    if (shouldDisplaySnackbar) {
      this.snackBar.open(`${service.name} adicionada`, 'Fechar', {
        duration: 2000,
      });
    }
  }

  async addStopToSelection(
    stopId: string,
    shouldDisplaySnackbar = true,
    stopUpdates?: Observable<StopFullDataSnapshot>,
  ): Promise<void> {
    const selectedStop = this.mapState.selectedStops().get(stopId);
    if (selectedStop) {
      if (shouldDisplaySnackbar) {
        this.createSelectionFocus('stop', stopId).point([
          selectedStop.longitude, selectedStop.latitude,
        ]);
      }
      return;
    }

    const focus = shouldDisplaySnackbar
      ? this.createSelectionFocus('stop', stopId)
      : null;
    const pendingRequest: PendingStopSelection = {};
    this.pendingStopSelections.set(stopId, pendingRequest);
    try {
      const loadResult = await this.dataLoader.loadStopData(
        stopId,
        shouldDisplaySnackbar,
        stopUpdates,
        (stop) => {
          pendingRequest.canonicalStopId = stop.stopId;
          this.addFocusIdentity(focus, stop.stopId);
        },
      );
      if (!this.isCurrentStopSelection(stopId, pendingRequest)) {
        return;
      }
      if (loadResult.status !== 'loaded') {
        if (loadResult.status === 'not-found' && shouldDisplaySnackbar) {
          this.snackBar.open('Parada não encontrada', 'Fechar', {
            duration: 2000,
          });
        }
        return;
      }

      const { stop } = loadResult;
      pendingRequest.canonicalStopId = stop.stopId;
      this.addFocusIdentity(focus, stop.stopId);
      if (this.mapState.selectedStops().has(stop.stopId)) {
        focus?.point([stop.longitude, stop.latitude]);
        return;
      }

      const selectedStop: SelectedStop = {
        id: stop.stopId,
        name: stop.name,
        latitude: stop.latitude,
        longitude: stop.longitude,
        isSubwayStation: stop.isSubwayStation,
      };
      this.mapState.addStopToSelection(selectedStop);
      focus?.point([stop.longitude, stop.latitude]);

      if (shouldDisplaySnackbar) {
        this.snackBar.open(`Parada adicionada`, 'Fechar', { duration: 2000 });
      }
    } finally {
      if (this.pendingStopSelections.get(stopId) === pendingRequest) {
        this.pendingStopSelections.delete(stopId);
      }
    }
  }

  removeRouteFromSelection(routeId: string, shouldDisplaySnackbar = true): void {
    this.pendingRouteSelections.delete(routeId);
    this.pendingOppositeDirectionSelections.delete(routeId);
    const route = this.mapState.selectedRoutes().get(routeId);
    this.cancelSelectionFocus('route', routeId);
    if (route?.routeId) this.cancelSelectionFocus('route', route.routeId);
    this.unsubscribeFromRouteRealtime(route);

    this.mapState.removeRouteFromSelection(routeId);
    this.dataLoader.removeRouteDisplayData(routeId);

    if (shouldDisplaySnackbar) {
      this.snackBar.open(`Rota removida`, 'Fechar', { duration: 2000 });
    }
  }

  removeStopFromSelection(stopId: string): void {
    this.cancelSelectionFocus('stop', stopId);
    for (const [requestedStopId, pendingRequest] of this
      .pendingStopSelections) {
      if (
        requestedStopId === stopId ||
        pendingRequest.canonicalStopId === stopId
      ) {
        this.pendingStopSelections.delete(requestedStopId);
        this.dataLoader.cancelStopDataLoad(requestedStopId);
      }
    }
    this.mapState.removeStopFromSelection(stopId);
    this.dataLoader.removeStopDisplayData(stopId);

    this.snackBar.open(`Parada removida`, 'Fechar', { duration: 2000 });
  }

  addBikeStationToSelection(
    stationId: string,
    shouldDisplaySnackbar = true,
  ): void {
    const station =
      this.bikeStationsService.getStation(stationId) ??
      this.mapState.bikeStations().find((item) => item.stationId === stationId);

    if (!station) {
      this.logger.warn('Bike station not found', { stationId });
      return;
    }

    this.mapState.addBikeStationToSelection({
      id: station.stationId,
      name: station.name,
      latitude: station.latitude,
      longitude: station.longitude,
    });
    if (shouldDisplaySnackbar) {
      this.createSelectionFocus('bike', stationId).point([
        station.longitude, station.latitude,
      ], 17);
      this.snackBar.open('Estação fixada', 'Fechar', { duration: 2000 });
    }
  }

  removeBikeStationFromSelection(stationId: string): void {
    this.cancelSelectionFocus('bike', stationId);
    this.mapState.removeBikeStationFromSelection(stationId);
    this.snackBar.open('Estação removida', 'Fechar', { duration: 2000 });
  }

  clearAllSelections(shouldDisplaySnackbar = true): void {
    this.selectionFocus = null;
    this.cancelPendingSelections();
    for (const route of this.mapState.selectedRoutes().values()) {
      this.unsubscribeFromRouteRealtime(route);
    }

    this.mapState.clearAllSelections();
    this.displayService.clearSelection();

    if (shouldDisplaySnackbar) {
      this.snackBar.open(`Seleções limpas`, 'Fechar', { duration: 2000 });
    }
  }

  cancelPendingSelections(): void {
    this.pendingRouteSelections.clear();
    this.pendingOppositeDirectionSelections.clear();
    this.pendingStopSelections.clear();
    this.dataLoader.cancelPendingLoads();
  }

  cancelPendingStopSelections(): void {
    this.pendingStopSelections.clear();
    this.dataLoader.cancelStopDataLoads();
  }

  private focusRailLine(lineId: string): void {
    const focus = this.createSelectionFocus('route', lineId);
    this.geography.getRailLineFocusCoordinates(lineId).subscribe({
      next: (coordinates) => {
        if (this.mapState.selectedRoutes().has(lineId)) {
          focus.coordinates(coordinates);
        }
      },
      error: (error: unknown) =>
        this.logger.warn('Could not frame selected rail line', error),
    });
  }

  private focusRoute(
    routeId: string,
    route: BusRouteGraphQL,
    focus: MapFocusRequest | null,
    selectionId = getBusRouteIdentity(route),
  ): void {
    if (!focus?.isCurrent()) return;
    this.geography.getRouteFocusCoordinates(route.favoriteCode ?? routeId).subscribe({
      next: (coordinates) => {
        if (this.mapState.selectedRoutes().has(selectionId)) {
          focus.coordinates(coordinates);
        }
      },
      error: (error: unknown) => this.logger.warn('Could not frame selected route', error),
    });
  }

  private createSelectionFocus(kind: SelectionKind, id: string): MapFocusRequest {
    const request = this.displayService.createFocusRequest();
    this.selectionFocus = { kind, ids: new Set([id]), request };
    return request;
  }

  private addFocusIdentity(request: MapFocusRequest | null, id: string): void {
    if (request && this.selectionFocus?.request === request) {
      this.selectionFocus.ids.add(id);
    }
  }

  private cancelSelectionFocus(kind: SelectionKind, id: string): void {
    const focus = this.selectionFocus;
    if (focus?.kind !== kind || !focus.ids.has(id)) return;
    focus.request.cancel();
    this.selectionFocus = null;
  }

  private isCurrentStopSelection(
    stopId: string,
    request: PendingStopSelection,
  ): boolean {
    return this.pendingStopSelections.get(stopId) === request;
  }

  private isCurrentOppositeDirectionSelection(
    routeId: string,
    selectedRoute: SelectedRoute,
    request: object,
  ): boolean {
    return (
      this.pendingOppositeDirectionSelections.get(routeId) === request &&
      this.mapState.selectedRoutes().get(routeId) === selectedRoute
    );
  }

  private subscribeToRouteRealtime(
    route: SelectedRoute | { routeId: string; shortName: string },
  ): void {
    const shortName = route.shortName;
    const routeId =
      'id' in route ? route.routeId ?? route.id : route.routeId;
    if (!shortName) {
      return;
    }

    if (
      isArtespRoute({
        routeId,
        sourceAgency: 'sourceAgency' in route ? route.sourceAgency : undefined,
      })
    ) {
      this.realtimeService.subscribeToRoute(routeId);
      this.logger.info(`Subscribed to real-time for route: ${routeId}`);
      return;
    }

    const vehicleLineCode = extractTrackedRailVehicleLineCode(shortName);
    if (vehicleLineCode) {
      this.cptmVehicleLayer.subscribeToLine(vehicleLineCode);
      this.logger.info(
        `Subscribed to private vehicles for line: ${vehicleLineCode}`,
      );
    } else if (isRailRouteReference(shortName)) {
      this.logger.debug(
        `Tracked rail vehicles are unavailable for route: ${shortName}`,
      );
      return;
    }

    if (
      !supportsSptransRealtime({
        routeId,
        sourceAgency: 'sourceAgency' in route ? route.sourceAgency : undefined,
        supportsRealtime:
          'supportsRealtime' in route ? route.supportsRealtime : undefined,
      })
    ) {
      this.logger.debug(`Realtime unavailable for bus route: ${routeId}`);
      return;
    }

    if (!shortName.startsWith('METRÔ') && !shortName.startsWith('CPTM')) {
      this.realtimeService.subscribeToRoute(shortName);
      this.logger.info(`Subscribed to real-time for route: ${shortName}`);
    }
  }

  private unsubscribeFromRouteRealtime(route: SelectedRoute | undefined): void {
    const shortName = route?.shortName;
    const routeId = route?.routeId ?? route?.id ?? '';
    if (!shortName) {
      return;
    }

    if (isArtespRoute({ routeId, sourceAgency: route?.sourceAgency })) {
      this.realtimeService.unsubscribeFromRoute(routeId);
      this.logger.info(`Unsubscribed from real-time for route: ${routeId}`);
      return;
    }

    const vehicleLineCode = extractTrackedRailVehicleLineCode(shortName, false);
    if (vehicleLineCode) {
      this.cptmVehicleLayer.unsubscribeFromLine(vehicleLineCode);
      this.logger.info(
        `Unsubscribed from private vehicles for line: ${vehicleLineCode}`,
      );
    } else if (isRailRouteReference(shortName)) {
      this.logger.debug(
        `Tracked rail vehicles were unavailable for route: ${shortName}`,
      );
      return;
    }

    if (
      !supportsSptransRealtime({
        routeId,
        sourceAgency: route?.sourceAgency,
        supportsRealtime: route?.supportsRealtime,
      })
    ) {
      return;
    }

    if (!shortName.startsWith('METRÔ') && !shortName.startsWith('CPTM')) {
      this.realtimeService.unsubscribeFromRoute(shortName);
      this.logger.info(`Unsubscribed from real-time for route: ${shortName}`);
    }
  }
}

/** Keep disabled rail references out of the generic bus realtime fallback. */
function isRailRouteReference(shortName: string): boolean {
  return (
    shortName.startsWith('METRÔ') ||
    shortName.startsWith('CPTM') ||
    /(?:^|[^A-Za-z0-9])L(?:[1-9]|1[0-7])(?=$|[^A-Za-z0-9])/i.test(shortName)
  );
}

function areOppositeBusDirections(
  first: BusDirectionCandidate,
  second: BusDirectionCandidate,
): boolean {
  return (
    first.route.routeId === second.route.routeId &&
    first.directionId !== second.directionId &&
    first.sourceAgency === second.sourceAgency &&
    first.shortName === second.shortName &&
    distanceInMeters(
      first.originLatitude,
      first.originLongitude,
      second.destinationLatitude,
      second.destinationLongitude,
    ) <= MAX_REVERSED_ENDPOINT_DISTANCE_METERS &&
    distanceInMeters(
      first.destinationLatitude,
      first.destinationLongitude,
      second.originLatitude,
      second.originLongitude,
    ) <= MAX_REVERSED_ENDPOINT_DISTANCE_METERS
  );
}

const MAX_REVERSED_ENDPOINT_DISTANCE_METERS = 1_500;
const EARTH_RADIUS_METERS = 6_371_000;

function distanceInMeters(
  firstLatitude: number,
  firstLongitude: number,
  secondLatitude: number,
  secondLongitude: number,
): number {
  const radians = Math.PI / 180;
  const latitudeDelta = (secondLatitude - firstLatitude) * radians;
  const longitudeDelta = (secondLongitude - firstLongitude) * radians;
  const firstLatitudeRadians = firstLatitude * radians;
  const secondLatitudeRadians = secondLatitude * radians;
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(firstLatitudeRadians) *
      Math.cos(secondLatitudeRadians) *
      Math.sin(longitudeDelta / 2) ** 2;

  return (
    2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(Math.min(1, haversine)))
  );
}
