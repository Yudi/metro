import { Service, signal, computed } from '@angular/core';
import {
  BusRouteGraphQL,
  BusStopGraphQL,
} from '../../geography/geography-graphql.service';
import {
  MapSelectionCounts,
  BikeStation,
  SelectedRoute,
  SelectedStop,
  SelectedBikeStation,
} from './map.types';
import { getBusRouteIdentity } from '@metro/shared/utils';

@Service()
export class MapStateService {
  readonly isLoading = signal(false);

  // Selection signals - cumulative user selections with metadata
  readonly selectedRoutes = signal<Map<string, SelectedRoute>>(new Map());
  readonly selectedStops = signal<Map<string, SelectedStop>>(new Map());
  readonly selectedBikeStations = signal<Map<string, SelectedBikeStation>>(
    new Map(),
  );

  // Track routes derived from stop selections (for display only, no real-time)
  readonly routesDerivedFromStops = signal<Set<string>>(new Set());

  /**
   * Track which selection caused each displayed item.
   * Maps item IDs to the set of source selections that contributed them.
   * This allows efficient cleanup when deselecting - we only remove items
   * that are no longer needed by any active selection.
   */
  private displayedStopSources = new Map<string, Set<string>>(); // stopId -> Set of sourceSelectionIds
  private displayedRouteSources = new Map<string, Set<string>>(); // route identity -> Set of source selection IDs

  // Display data - what's currently shown on map
  readonly displayedRoutes = signal<BusRouteGraphQL[]>([]);
  readonly displayedStops = signal<BusStopGraphQL[]>([]);
  readonly bikeStations = signal<BikeStation[]>([]);

  // Computed properties
  readonly hasSelections = computed(
    () =>
      this.selectedRoutes().size > 0 ||
      this.selectedStops().size > 0 ||
      this.selectedBikeStations().size > 0,
  );

  // Selection identities used by map display
  readonly selectedRouteIds = computed(
    () => new Set(this.selectedRoutes().keys()),
  );
  readonly selectedStopIds = computed(
    () => new Set(this.selectedStops().keys()),
  );
  readonly selectedBikeStationIds = computed(
    () => new Set(this.selectedBikeStations().keys()),
  );

  readonly hasDisplayedData = computed(
    () =>
      this.displayedRoutes().length > 0 || this.displayedStops().length > 0,
  );
  readonly totalDisplayedStops = computed(
    () => this.displayedStops().length,
  );
  readonly totalDisplayedRoutes = computed(() => this.displayedRoutes().length);

  // Selection Management Methods
  addRouteToSelection(route: SelectedRoute): void {
    const newRoutes = new Map(this.selectedRoutes());
    newRoutes.set(route.id, route);
    this.selectedRoutes.set(newRoutes);
  }

  addStopToSelection(stop: SelectedStop): void {
    const newStops = new Map(this.selectedStops());
    newStops.set(stop.id, stop);
    this.selectedStops.set(newStops);
  }

  addBikeStationToSelection(station: SelectedBikeStation): void {
    const newStations = new Map(this.selectedBikeStations());
    newStations.set(station.id, station);
    this.selectedBikeStations.set(newStations);
  }

  removeRouteFromSelection(routeId: string): void {
    const newRoutes = new Map(this.selectedRoutes());
    newRoutes.delete(routeId);
    this.selectedRoutes.set(newRoutes);
  }

  removeStopFromSelection(stopId: string): void {
    const newStops = new Map(this.selectedStops());
    newStops.delete(stopId);
    this.selectedStops.set(newStops);
  }

  removeBikeStationFromSelection(stationId: string): void {
    const newStations = new Map(this.selectedBikeStations());
    newStations.delete(stationId);
    this.selectedBikeStations.set(newStations);
  }

  clearAllSelections(): void {
    this.selectedRoutes.set(new Map());
    this.selectedStops.set(new Map());
    this.selectedBikeStations.set(new Map());
    this.routesDerivedFromStops.set(new Set());
    this.displayedRoutes.set([]);
    this.displayedStops.set([]);
    // Clear source tracking
    this.displayedStopSources.clear();
    this.displayedRouteSources.clear();
  }

  // Display Management Methods
  /**
   * Add a route to display, tracking which selection caused it.
   * @param route The route to display
   * @param sourceSelectionId The ID of the selection that caused this (routeId or stopId)
   * @param derivedFromStop Whether this route was derived from a stop selection
   */
  addRouteToDisplay(
    route: BusRouteGraphQL,
    sourceSelectionId?: string,
    derivedFromStop = false,
  ): void {
    this.addRoutesToDisplay([route], sourceSelectionId, derivedFromStop);
  }

  /** Publish related routes as one state update. */
  addRoutesToDisplay(
    routes: readonly BusRouteGraphQL[],
    sourceSelectionId?: string,
    derivedFromStop = false,
  ): void {
    if (routes.length === 0) {
      return;
    }

    const currentRoutes = this.displayedRoutes();
    const routeIds = new Set(currentRoutes.map(getBusRouteIdentity));
    const nextRoutes = [...currentRoutes];
    let displayChanged = false;

    const derivedRouteIds = derivedFromStop
      ? new Set(this.routesDerivedFromStops())
      : null;
    let derivedRoutesChanged = false;

    for (const route of routes) {
      const routeIdentity = getBusRouteIdentity(route);
      if (!routeIds.has(routeIdentity)) {
        routeIds.add(routeIdentity);
        nextRoutes.push(route);
        displayChanged = true;
      }

      if (sourceSelectionId) {
        const sources =
          this.displayedRouteSources.get(routeIdentity) ?? new Set<string>();
        sources.add(sourceSelectionId);
        this.displayedRouteSources.set(routeIdentity, sources);
      }

      if (derivedRouteIds && !derivedRouteIds.has(routeIdentity)) {
        derivedRouteIds.add(routeIdentity);
        derivedRoutesChanged = true;
      }
    }

    if (derivedRoutesChanged && derivedRouteIds) {
      this.routesDerivedFromStops.set(derivedRouteIds);
    }

    if (displayChanged) {
      this.displayedRoutes.set(nextRoutes);
    }
  }

  /**
   * Add a stop to display, tracking which selection caused it.
   * @param stop The stop to display
   * @param sourceSelectionId The ID of the selection that caused this (routeId or stopId)
   */
  addStopToDisplay(stop: BusStopGraphQL, sourceSelectionId?: string): void {
    const currentStops = this.displayedStops();
    const exists = currentStops.find((s) => s.id === stop.id);
    if (!exists) {
      this.displayedStops.set([...currentStops, stop]);
    }

    // Track source if provided
    if (sourceSelectionId) {
      const sources = this.displayedStopSources.get(stop.stopId) || new Set();
      sources.add(sourceSelectionId);
      this.displayedStopSources.set(stop.stopId, sources);
    }
  }

  setBikeStations(stations: BikeStation[]): void {
    this.bikeStations.set(stations);
  }

  /**
   * Remove display data sourced from a specific selection.
   * Only removes items that have no other sources still active.
   * @param sourceSelectionId The ID of the selection being removed (routeId or stopId)
   */
  removeDisplayDataBySource(sourceSelectionId: string): void {
    // Remove this source from all tracked items and collect items to remove
    const stopsToRemove: string[] = [];
    const routesToRemove: string[] = [];

    // Check stops
    this.displayedStopSources.forEach((sources, stopId) => {
      sources.delete(sourceSelectionId);
      if (sources.size === 0) {
        stopsToRemove.push(stopId);
        this.displayedStopSources.delete(stopId);
      }
    });

    // Check routes
    this.displayedRouteSources.forEach((sources, routeIdentity) => {
      sources.delete(sourceSelectionId);
      if (sources.size === 0) {
        routesToRemove.push(routeIdentity);
        this.displayedRouteSources.delete(routeIdentity);
      }
    });

    // Remove items that no longer have any sources
    if (stopsToRemove.length > 0) {
      const stopIdsToRemove = new Set(stopsToRemove);
      const currentStops = this.displayedStops();
      this.displayedStops.set(
        currentStops.filter((s) => !stopIdsToRemove.has(s.stopId)),
      );
    }

    if (routesToRemove.length > 0) {
      const routeIdsToRemove = new Set(routesToRemove);
      const currentRoutes = this.displayedRoutes();
      this.displayedRoutes.set(
        currentRoutes.filter(
          (route) => !routeIdsToRemove.has(getBusRouteIdentity(route)),
        ),
      );

      // Also update derived routes tracking
      const derived = new Set(this.routesDerivedFromStops());
      for (const routeId of routesToRemove) {
        derived.delete(routeId);
      }
      this.routesDerivedFromStops.set(derived);
    }

  }

  /**
   * Remove display data for a specific route selection.
   * Uses source tracking to only remove items that are no longer needed.
   */
  removeRouteDisplayData(routeId: string): void {
    this.removeDisplayDataBySource(routeId);
  }

  /**
   * Remove display data for a specific stop selection.
   * Uses source tracking to only remove items that are no longer needed.
   */
  removeStopDisplayData(stopId: string): void {
    this.removeDisplayDataBySource(stopId);
  }

  // Utility methods
  getSelectionCounts(): MapSelectionCounts {
    return {
      routes: this.selectedRoutes().size,
      stops: this.selectedStops().size,
      displayed:
        this.displayedRoutes().length + this.displayedStops().length,
    };
  }
}
