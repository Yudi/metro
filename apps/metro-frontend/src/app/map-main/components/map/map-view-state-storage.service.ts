import { CityContextService } from '../../../cities/city-context.service';
import { isPlatformBrowser } from '@angular/common';
import { Service, PLATFORM_ID, inject, signal } from '@angular/core';
import Dexie, { Table } from 'dexie';
import { LayerType } from './layers/map-layer.service';
import { VectorTileLayerType } from './vector-tiles/vector-tile-layer.service';
import { DisplayMode, NearbyCenter } from './map.types';

export const MAP_VIEW_STATE_RESTORE_PARAM = 'restoreMapState';

export interface SavedMapViewState {
  center: [number, number];
  zoom: number;
  displayMode: DisplayMode;
  nearbyCenter: NearbyCenter | null;
  nearbyRadius: number;
  layers: Partial<Record<LayerType, boolean>>;
  vectorLayers: Partial<Record<VectorTileLayerType, boolean>>;
  selections: {
    routeIds: string[];
    stopIds: string[];
    bikeStationIds: string[];
  };
}

interface MapViewStateRecord extends SavedMapViewState {
  key: string;
  updatedAt: number;
}

class MapViewStateDatabase extends Dexie {
  mapViewStates!: Table<MapViewStateRecord, string>;

  constructor() {
    super('metro-map-view-state');
    this.version(1).stores({
      mapViewStates: '&key, updatedAt',
    });
  }
}

@Service()
export class MapViewStateStorageService {
  readonly cityContext = inject(CityContextService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly db = isPlatformBrowser(this.platformId)
    ? new MapViewStateDatabase()
    : null;

  private readonly _defaultStateRequests = signal(0);
  readonly defaultStateRequests = this._defaultStateRequests.asReadonly();

  private get storageKey(): string {
    return `last:${this.cityContext.id()}`;
  }

  requestDefaultState(): void {
    this._defaultStateRequests.update((value) => value + 1);
  }

  getDefaultQueryParams(): Record<string, string> {
    const city = this.cityContext.city();
    return {
      subwayStations: '1',
      subwayRoutes: '0',
      bike: '0',
      lat: String(city.map.center.latitude),
      lon: String(city.map.center.longitude),
      z: String(city.map.zoom),
    };
  }

  getRestoreQueryParams(): Record<string, string> {
    return { [MAP_VIEW_STATE_RESTORE_PARAM]: '1' };
  }

  async hasLastState(): Promise<boolean> {
    if (!this.db) {
      return false;
    }

    return (await this.db.mapViewStates.get(this.storageKey)) !== undefined;
  }

  async readLastState(): Promise<SavedMapViewState | null> {
    if (!this.db) {
      return null;
    }

    const record = await this.db.mapViewStates.get(this.storageKey);
    if (!record) {
      return null;
    }

    return {
      center: record.center,
      zoom: record.zoom,
      displayMode: record.displayMode,
      nearbyCenter: record.nearbyCenter,
      nearbyRadius: record.nearbyRadius,
      layers: record.layers,
      vectorLayers: record.vectorLayers,
      selections: record.selections,
    };
  }

  saveLastState(state: SavedMapViewState): void {
    if (!this.db) {
      return;
    }

    void this.db.mapViewStates.put({
      key: this.storageKey,
      updatedAt: Date.now(),
      ...state,
    });
  }
}
