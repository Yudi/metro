import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import Dexie, { Table } from 'dexie';
import { LayerType } from './map-layer.service';
import { VectorTileLayerType } from './vector-tile-layer.service';
import { DisplayMode, NearbyCenter } from '../components/map/map.types';
import { SAO_PAULO_CITY_CENTER } from '@metro/shared/utils';

export const MAP_VIEW_STATE_RESTORE_PARAM = 'restoreMapState';

export const DEFAULT_MAP_QUERY_PARAMS: Record<string, string> = {
  subwayStations: '1',
  subwayRoutes: '0',
  bike: '0',
  lat: String(SAO_PAULO_CITY_CENTER.latitude),
  lon: String(SAO_PAULO_CITY_CENTER.longitude),
  z: '11',
};

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
  key: 'last';
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

@Injectable({
  providedIn: 'root',
})
export class MapViewStateStorageService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly db = isPlatformBrowser(this.platformId)
    ? new MapViewStateDatabase()
    : null;

  private readonly _defaultStateRequests = signal(0);
  readonly defaultStateRequests = this._defaultStateRequests.asReadonly();

  requestDefaultState(): void {
    this._defaultStateRequests.update((value) => value + 1);
  }

  getDefaultQueryParams(): Record<string, string> {
    return { ...DEFAULT_MAP_QUERY_PARAMS };
  }

  getRestoreQueryParams(): Record<string, string> {
    return { [MAP_VIEW_STATE_RESTORE_PARAM]: '1' };
  }

  async hasLastState(): Promise<boolean> {
    if (!this.db) {
      return false;
    }

    return (await this.db.mapViewStates.get('last')) !== undefined;
  }

  async readLastState(): Promise<SavedMapViewState | null> {
    if (!this.db) {
      return null;
    }

    const record = await this.db.mapViewStates.get('last');
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
      key: 'last',
      updatedAt: Date.now(),
      ...state,
    });
  }
}
