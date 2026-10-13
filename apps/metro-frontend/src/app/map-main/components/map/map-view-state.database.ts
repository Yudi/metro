import Dexie, { Table } from 'dexie';
import type { SavedMapViewState } from './map-view-state-storage.service';
import { VectorTileLayerType } from './vector-tiles/vector-tile-layer.config';

interface MapViewStateRecord extends SavedMapViewState {
  key: string;
  updatedAt: number;
}

export class MapViewStateDatabase extends Dexie {
  mapViewStates!: Table<MapViewStateRecord, string>;

  constructor(name = 'metro-map-view-state') {
    super(name);
    this.version(1).stores({ mapViewStates: '&key, updatedAt' });
    this.version(2).stores({ mapViewStates: '&key, updatedAt' }).upgrade((transaction) =>
      transaction.table<MapViewStateRecord & { layers?: { bike?: boolean } }>('mapViewStates')
        .toCollection().modify((record) => {
          record.vectorLayers[VectorTileLayerType.BIKE_STATIONS] ??= record.layers?.bike ?? false;
          delete record.layers;
        }),
    );
  }
}
