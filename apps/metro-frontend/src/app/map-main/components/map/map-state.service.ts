import { Injectable, signal, computed } from '@angular/core';
import {
  BusRouteGraphQL,
  BusStopGraphQL,
} from '../../services/geography-graphql.service';
import {
  BusShapeWithRoute,
  DisplayMode,
  NearbyCenter,
  MapSelectionCounts,
  BikeStation,
  SelectedRoute,
  SelectedStop,
  SelectedBikeStation,
} from './map.types';

@Injectable({
  providedIn: 'root',
})
export class MapStateService {
  // Callback to update display - will be set by the component
  private updateDisplayCallback?: () => void;

  setUpdateDisplayCallback(callback: () => void): void {
    this.updateDisplayCallback = callback;
  }

  private triggerDisplayUpdate(): void {
    if (this.updateDisplayCallback) {
      this.updateDisplayCallback();
    }
  }

  // Display mode
  readonly displayMode = signal<DisplayMode>('selected');
  readonly isLoading = signal(false);

  // Selection signals - cumulative user selections with metadata
  readonly selectedRoutes = signal<Map<string, SelectedRoute>>(new Map());
  readonly selectedStops = signal<Map<string, SelectedStop>>(new Map());
  readonly selectedBikeStations = signal<Map<string, SelectedBikeStation>>(
    new Map()
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
  private displayedShapeSources = new Map<string, Set<string>>(); // shapeId -> Set of sourceSelectionIds
  private displayedRouteSources = new Map<string, Set<string>>(); // routeId -> Set of sourceSelectionIds

  // Display data - what's currently shown on map
  readonly displayedRoutes = signal<BusRouteGraphQL[]>([]);
  readonly displayedStops = signal<BusStopGraphQL[]>([]);
  readonly displayedShapes = signal<BusShapeWithRoute[]>([]);
  readonly subwayStations = signal<BusStopGraphQL[]>([]); // Permanently displayed subway stations
  readonly bikeStations = signal<BikeStation[]>([]);

  // Nearby mode data
  readonly nearbyCenter = signal<NearbyCenter | null>(null);
  readonly nearbyRadius = signal(1000);

  // Computed properties
  readonly hasSelections = computed(
    () =>
      this.selectedRoutes().size > 0 ||
      this.selectedStops().size > 0 ||
      this.selectedBikeStations().size > 0
  );

  // Computed: Get selected route IDs as a Set (for backward compatibility)
  readonly selectedRouteIds = computed(
    () => new Set(this.selectedRoutes().keys())
  );
  readonly selectedStopIds = computed(
    () => new Set(this.selectedStops().keys())
  );
  readonly selectedBikeStationIds = computed(
    () => new Set(this.selectedBikeStations().keys())
  );

  // Combined stops for display (subway stations + regular stops)
  readonly allDisplayedStops = computed(() => [
    ...this.subwayStations(),
    ...this.displayedStops(),
  ]);
  readonly hasDisplayedData = computed(
    () =>
      this.displayedRoutes().length > 0 || this.allDisplayedStops().length > 0
  );
  readonly totalDisplayedStops = computed(
    () => this.allDisplayedStops().length
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
    this.triggerDisplayUpdate();
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
    this.triggerDisplayUpdate();
  }

  clearAllSelections(): void {
    this.selectedRoutes.set(new Map());
    this.selectedStops.set(new Map());
    this.selectedBikeStations.set(new Map());
    this.routesDerivedFromStops.set(new Set());
    this.displayedRoutes.set([]);
    this.displayedStops.set([]);
    this.displayedShapes.set([]);
    // Clear source tracking
    this.displayedStopSources.clear();
    this.displayedShapeSources.clear();
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
    derivedFromStop = false
  ): void {
    const currentRoutes = this.displayedRoutes();
    const exists = currentRoutes.find((r) => r.id === route.id);
    if (!exists) {
      this.displayedRoutes.set([...currentRoutes, route]);
      this.triggerDisplayUpdate();
    }

    // Track source if provided
    if (sourceSelectionId) {
      const sources =
        this.displayedRouteSources.get(route.routeId) || new Set();
      sources.add(sourceSelectionId);
      this.displayedRouteSources.set(route.routeId, sources);
    }

    // Track if this route was derived from a stop selection
    if (derivedFromStop) {
      const derived = new Set(this.routesDerivedFromStops());
      derived.add(route.routeId);
      this.routesDerivedFromStops.set(derived);
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
      this.triggerDisplayUpdate();
    }

    // Track source if provided
    if (sourceSelectionId) {
      const sources = this.displayedStopSources.get(stop.stopId) || new Set();
      sources.add(sourceSelectionId);
      this.displayedStopSources.set(stop.stopId, sources);
    }
  }

  addSubwayStation(station: BusStopGraphQL): void {
    const currentStations = this.subwayStations();
    const exists = currentStations.find((s) => s.id === station.id);
    if (!exists) {
      this.subwayStations.set([...currentStations, station]);
      this.triggerDisplayUpdate();
    }
  }

  /**
   * Add a shape to display, tracking which selection caused it.
   * @param shape The shape to display
   * @param sourceSelectionId The ID of the selection that caused this (routeId or stopId)
   */
  addShapeToDisplay(
    shape: BusShapeWithRoute,
    sourceSelectionId?: string
  ): void {
    const currentShapes = this.displayedShapes();
    const exists = currentShapes.find((s) => s.id === shape.id);
    if (!exists) {
      this.displayedShapes.set([...currentShapes, shape]);
      this.triggerDisplayUpdate();
    }

    // Track source if provided
    if (sourceSelectionId) {
      const sources =
        this.displayedShapeSources.get(shape.shapeId) || new Set();
      sources.add(sourceSelectionId);
      this.displayedShapeSources.set(shape.shapeId, sources);
    }
  }

  setBikeStations(stations: BikeStation[]): void {
    this.bikeStations.set(stations);
    this.triggerDisplayUpdate();
  }

  /**
   * Special source ID for nearby stops - used to distinguish them from selection-sourced stops
   */
  static readonly NEARBY_SOURCE_ID = '__nearby__';

  /**
   * Set nearby stops with proper source tracking.
   * This removes old nearby-sourced stops and adds new ones,
   * while preserving stops that were added by user selections.
   */
  setNearbyStops(stops: BusStopGraphQL[]): void {
    // First, remove all stops that only have 'nearby' as their source
    this.removeDisplayDataBySource(MapStateService.NEARBY_SOURCE_ID);

    // Add new nearby stops with source tracking
    for (const stop of stops) {
      this.addStopToDisplay(stop, MapStateService.NEARBY_SOURCE_ID);
    }

    this.triggerDisplayUpdate();
  }

  resetDisplayedData(): void {
    this.displayedRoutes.set([]);
    this.displayedStops.set([]);
    this.displayedShapes.set([]);
    this.routesDerivedFromStops.set(new Set());
    // Clear source tracking
    this.displayedStopSources.clear();
    this.displayedShapeSources.clear();
    this.displayedRouteSources.clear();
  }

  /**
   * Remove display data sourced from a specific selection.
   * Only removes items that have no other sources still active.
   * @param sourceSelectionId The ID of the selection being removed (routeId or stopId)
   */
  removeDisplayDataBySource(sourceSelectionId: string): void {
    // Remove this source from all tracked items and collect items to remove
    const stopsToRemove: string[] = [];
    const shapesToRemove: string[] = [];
    const routesToRemove: string[] = [];

    // Check stops
    this.displayedStopSources.forEach((sources, stopId) => {
      sources.delete(sourceSelectionId);
      if (sources.size === 0) {
        stopsToRemove.push(stopId);
        this.displayedStopSources.delete(stopId);
      }
    });

    // Check shapes
    this.displayedShapeSources.forEach((sources, shapeId) => {
      sources.delete(sourceSelectionId);
      if (sources.size === 0) {
        shapesToRemove.push(shapeId);
        this.displayedShapeSources.delete(shapeId);
      }
    });

    // Check routes
    this.displayedRouteSources.forEach((sources, routeId) => {
      sources.delete(sourceSelectionId);
      if (sources.size === 0) {
        routesToRemove.push(routeId);
        this.displayedRouteSources.delete(routeId);
      }
    });

    // Remove items that no longer have any sources
    if (stopsToRemove.length > 0) {
      const stopIdsToRemove = new Set(stopsToRemove);
      const currentStops = this.displayedStops();
      this.displayedStops.set(
        currentStops.filter((s) => !stopIdsToRemove.has(s.stopId))
      );
    }

    if (shapesToRemove.length > 0) {
      const shapeIdsToRemove = new Set(shapesToRemove);
      const currentShapes = this.displayedShapes();
      this.displayedShapes.set(
        currentShapes.filter((s) => !shapeIdsToRemove.has(s.shapeId))
      );
    }

    if (routesToRemove.length > 0) {
      const routeIdsToRemove = new Set(routesToRemove);
      const currentRoutes = this.displayedRoutes();
      this.displayedRoutes.set(
        currentRoutes.filter((r) => !routeIdsToRemove.has(r.routeId))
      );

      // Also update derived routes tracking
      const derived = new Set(this.routesDerivedFromStops());
      for (const routeId of routesToRemove) {
        derived.delete(routeId);
      }
      this.routesDerivedFromStops.set(derived);
    }

    this.triggerDisplayUpdate();
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
        this.displayedRoutes().length + this.allDisplayedStops().length,
    };
  }
}
