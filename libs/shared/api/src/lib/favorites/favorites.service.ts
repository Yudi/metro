import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Injectable, inject, PLATFORM_ID, signal, Signal } from '@angular/core';
import Dexie, { Table, liveQuery } from 'dexie';
// eslint-disable-next-line @nx/enforce-module-boundaries
import { firebaseUser } from '@metro/shared/firebase';
import { from, map, switchMap, tap } from 'rxjs';
import {
  FavoriteList,
  FavoriteTypes,
  emptyFavorites,
} from '@metro/shared/utils';

interface FavoriteRecord {
  key: string;
  type: FavoriteTypes;
  code: string;
  updatedAt: number;
}

interface DashboardSelectionRecord {
  key: string;
  values: string[];
  updatedAt: number;
}

export interface DashboardFavoriteSelections {
  railStationLines: Record<string, string[]>;
  busStopRoutes: Record<string, string[]>;
}

const favoriteTypes: FavoriteTypes[] = [
  'bikeStation',
  'railStation',
  'railLine',
  'busStop',
  'busRoute',
];

const favoriteTypeGraphqlNames: Record<FavoriteTypes, string> = {
  bikeStation: 'BikeStation',
  railStation: 'RailStation',
  railLine: 'RailLine',
  busStop: 'BusStop',
  busRoute: 'BusRoute',
};

class FavoritesDatabase extends Dexie {
  favorites!: Table<FavoriteRecord, string>;
  dashboardSelections!: Table<DashboardSelectionRecord, string>;

  constructor() {
    super('metro-favorites');
    this.version(1).stores({
      favorites: '&key, type, code, updatedAt',
    });
    this.version(2).stores({
      favorites: '&key, type, code, updatedAt',
      dashboardSelections: '&key, updatedAt',
    });
  }
}

@Injectable({
  providedIn: 'root',
})
export class FavoritesService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly firebaseUser = firebaseUser;
  private readonly http = inject(HttpClient);
  private readonly db = isPlatformBrowser(this.platformId)
    ? new FavoritesDatabase()
    : null;
  private favoritesSubscription?: { unsubscribe(): void };
  private dashboardSelectionsSubscription?: { unsubscribe(): void };
  private syncInFlight = false;

  private readonly _favorites = signal<FavoriteList>({ ...emptyFavorites });
  readonly favorites: Signal<FavoriteList> = this._favorites.asReadonly();
  private readonly _dashboardSelections = signal<DashboardFavoriteSelections>(
    this.createEmptyDashboardSelections(),
  );
  readonly dashboardSelections: Signal<DashboardFavoriteSelections> =
    this._dashboardSelections.asReadonly();

  constructor() {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    this.watchFavorites();
    this.watchDashboardSelections();
  }

  addFavorite(code: string, type: FavoriteTypes): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    void this.addFavoriteRecord(code, type);
  }

  removeFavorite(code: string, type: FavoriteTypes): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    void this.removeFavoriteRecord(code, type);
  }

  clearFavorites(type: FavoriteTypes | 'all'): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    void this.clearFavoriteRecords(type);
  }

  getFavoritesForType(type: FavoriteTypes): string[] {
    if (!isPlatformBrowser(this.platformId)) {
      throw new Error('getFavoritesForType can only be called in the browser');
    }

    return this._favorites()[type];
  }

  getAllFavorites(): FavoriteList {
    if (!isPlatformBrowser(this.platformId)) {
      throw new Error('getAllFavorites can only be called in the browser');
    }

    return this._favorites();
  }

  async readFavoritesSnapshot(): Promise<FavoriteList> {
    if (!isPlatformBrowser(this.platformId) || !this.db) {
      return this.createEmptyFavorites();
    }

    return this.recordsToFavoriteList(await this.db.favorites.toArray());
  }

  async readDashboardSelectionsSnapshot(): Promise<DashboardFavoriteSelections> {
    if (!isPlatformBrowser(this.platformId) || !this.db) {
      return this.createEmptyDashboardSelections();
    }

    return this.recordsToDashboardSelections(
      await this.db.dashboardSelections.toArray(),
    );
  }

  async hasStoredFavorites(): Promise<boolean> {
    if (!isPlatformBrowser(this.platformId) || !this.db) {
      return false;
    }

    const favoriteCount = await this.db.favorites.count();
    return favoriteCount > 0;
  }

  isFavorite(code: string, type: FavoriteTypes): boolean {
    if (!isPlatformBrowser(this.platformId)) {
      return false;
    }

    return this._favorites()[type]?.includes(code);
  }

  setDashboardRailStationLines(stationKey: string, lineIds: string[]): void {
    this.setDashboardSelection('railStationLines', stationKey, lineIds);
  }

  setDashboardBusStopRoutes(stopId: string, routeKeys: string[]): void {
    this.setDashboardSelection('busStopRoutes', stopId, routeKeys);
  }

  toggleDashboardRailStationLine(stationKey: string, lineId: string): void {
    const current = this._dashboardSelections().railStationLines[stationKey] ?? [];
    this.setDashboardRailStationLines(
      stationKey,
      this.toggleSelectionValue(current, lineId),
    );
  }

  toggleDashboardBusStopRoute(stopId: string, routeKey: string): void {
    const current = this._dashboardSelections().busStopRoutes[stopId] ?? [];
    this.setDashboardBusStopRoutes(
      stopId,
      this.toggleSelectionValue(current, routeKey),
    );
  }

  syncWithServer(): void {
    if (!this.firebaseUser() || this.syncInFlight) {
      return;
    }

    this.syncInFlight = true;
    this.http
      .post<{ data: { userFavorites: FavoriteList } }>('/api/graphql', {
        query: `
          query GetFavorites {
            userFavorites {
              bikeStation
              railStation
              railLine
              busStop
              busRoute
            }
          }
        `,
      })
      .pipe(
        map((result) => result?.data?.userFavorites),
        switchMap((serverFavorites) =>
          from(this.mergeServerFavorites(serverFavorites)),
        ),
        tap((merged) => {
          this._favorites.set(merged);
        }),
        switchMap((merged) =>
          this.http.post('/api/graphql', {
            query: `
              mutation SyncFavorites($favorites: FavoriteListInput!) {
                syncFavorites(favorites: $favorites) {
                  success
                  message
                }
              }
            `,
            variables: {
              favorites: merged,
            },
          }),
        ),
      )
      .subscribe({
        complete: () => {
          this.syncInFlight = false;
        },
        error: () => {
          this.syncInFlight = false;
        },
      });
  }

  private watchFavorites(): void {
    if (!this.db) {
      return;
    }

    const db = this.db;
    this.favoritesSubscription = liveQuery(() =>
      db.favorites.toArray(),
    ).subscribe((records) => {
      this._favorites.set(this.recordsToFavoriteList(records));
    });
  }

  private watchDashboardSelections(): void {
    if (!this.db) {
      return;
    }

    const db = this.db;
    this.dashboardSelectionsSubscription = liveQuery(() =>
      db.dashboardSelections.toArray(),
    ).subscribe((records) => {
      this._dashboardSelections.set(
        this.recordsToDashboardSelections(records),
      );
    });
  }

  private async addFavoriteRecord(
    code: string,
    type: FavoriteTypes,
  ): Promise<void> {
    if (!this.db || this._favorites()[type].includes(code)) {
      return;
    }

    await this.db.favorites.put({
      key: this.getFavoriteKey(type, code),
      type,
      code,
      updatedAt: Date.now(),
    });

    if (this.firebaseUser()) {
      this.http
        .post('/api/graphql', {
          query: `
          mutation AddFavorite($type: FavoriteType!, $code: String!) {
            addFavorite(type: $type, code: $code) {
              success
              message
            }
          }
        `,
          variables: {
            type: favoriteTypeGraphqlNames[type],
            code,
          },
        })
        .subscribe();
    }
  }

  private async removeFavoriteRecord(
    code: string,
    type: FavoriteTypes,
  ): Promise<void> {
    if (!this.db || !this._favorites()[type].includes(code)) {
      return;
    }

    await this.db.favorites.delete(this.getFavoriteKey(type, code));

    if (this.firebaseUser()) {
      this.http
        .post('/api/graphql', {
          query: `
          mutation RemoveFavorite($type: FavoriteType!, $code: String!) {
            removeFavorite(type: $type, code: $code) {
              success
              message
            }
          }
        `,
          variables: {
            type: favoriteTypeGraphqlNames[type],
            code,
          },
        })
        .subscribe();
    }
  }

  private async clearFavoriteRecords(
    type: FavoriteTypes | 'all',
  ): Promise<void> {
    if (!this.db) {
      return;
    }

    if (type === 'all') {
      await this.db.favorites.clear();
    } else {
      await this.db.favorites.where('type').equals(type).delete();
    }

    if (this.firebaseUser()) {
      await this.pushLocalFavoritesToServer();
    }
  }

  private setDashboardSelection(
    group: keyof DashboardFavoriteSelections,
    id: string,
    values: string[],
  ): void {
    if (!isPlatformBrowser(this.platformId) || !this.db) {
      return;
    }

    const normalizedValues = Array.from(
      new Set(values.filter((value) => value.trim().length > 0)),
    );
    const key = this.getDashboardSelectionKey(group, id);

    void this.db.dashboardSelections.put({
      key,
      values: normalizedValues,
      updatedAt: Date.now(),
    });
  }

  private async mergeServerFavorites(
    serverFavorites: FavoriteList | undefined,
  ): Promise<FavoriteList> {
    if (!this.db) {
      return this.createEmptyFavorites();
    }

    const localFavorites = this.recordsToFavoriteList(
      await this.db.favorites.toArray(),
    );

    if (!serverFavorites) {
      return localFavorites;
    }

    const merged = this.mergeFavorites(localFavorites, serverFavorites);
    await this.replaceFavorites(merged);
    return merged;
  }

  private async replaceFavorites(favorites: FavoriteList): Promise<void> {
    if (!this.db) {
      return;
    }

    const now = Date.now();
    const records = favoriteTypes.flatMap((type) =>
      favorites[type].map((code) => ({
        key: this.getFavoriteKey(type, code),
        type,
        code,
        updatedAt: now,
      })),
    );

    await this.db.transaction('rw', this.db.favorites, async () => {
      await this.db?.favorites.clear();
      if (records.length > 0) {
        await this.db?.favorites.bulkPut(records);
      }
    });
  }

  private async pushLocalFavoritesToServer(): Promise<void> {
    if (!this.db) {
      return;
    }

    const favorites = this.recordsToFavoriteList(
      await this.db.favorites.toArray(),
    );

    this.http
      .post('/api/graphql', {
        query: `
        mutation SyncFavorites($favorites: FavoriteListInput!) {
          syncFavorites(favorites: $favorites) {
            success
            message
          }
        }
      `,
        variables: {
          favorites,
        },
      })
      .subscribe();
  }

  private recordsToFavoriteList(records: FavoriteRecord[]): FavoriteList {
    const favorites = this.createEmptyFavorites();

    for (const record of records) {
      if (favoriteTypes.includes(record.type)) {
        favorites[record.type].push(record.code);
      }
    }

    return favorites;
  }

  private recordsToDashboardSelections(
    records: DashboardSelectionRecord[],
  ): DashboardFavoriteSelections {
    const selections = this.createEmptyDashboardSelections();

    for (const record of records) {
      const parsed = this.parseDashboardSelectionKey(record.key);

      if (!parsed) {
        continue;
      }

      selections[parsed.group][parsed.id] = Array.from(
        new Set(
          record.values.filter(
            (value): value is string => typeof value === 'string',
          ),
        ),
      );
    }

    return selections;
  }

  private normalizeFavorites(value: unknown): FavoriteList {
    const favorites = this.createEmptyFavorites();

    if (!value || typeof value !== 'object') {
      return favorites;
    }

    const rawFavorites = value as Partial<Record<FavoriteTypes, unknown>>;
    for (const type of favoriteTypes) {
      const codes = rawFavorites[type];
      if (Array.isArray(codes)) {
        favorites[type] = Array.from(
          new Set(
            codes.filter((code): code is string => typeof code === 'string'),
          ),
        );
      }
    }

    return favorites;
  }

  private createEmptyFavorites(): FavoriteList {
    return {
      bikeStation: [],
      railStation: [],
      railLine: [],
      busStop: [],
      busRoute: [],
    };
  }

  private createEmptyDashboardSelections(): DashboardFavoriteSelections {
    return {
      railStationLines: {},
      busStopRoutes: {},
    };
  }

  private getFavoriteKey(type: FavoriteTypes, code: string): string {
    return `${type}:${code}`;
  }

  private getDashboardSelectionKey(
    group: keyof DashboardFavoriteSelections,
    id: string,
  ): string {
    return `${group}:${id}`;
  }

  private parseDashboardSelectionKey(
    key: string,
  ): { group: keyof DashboardFavoriteSelections; id: string } | null {
    const separatorIndex = key.indexOf(':');

    if (separatorIndex < 1) {
      return null;
    }

    const group = key.slice(0, separatorIndex);
    const id = key.slice(separatorIndex + 1);

    if (
      (group !== 'railStationLines' && group !== 'busStopRoutes') ||
      id.length === 0
    ) {
      return null;
    }

    return { group, id };
  }

  private toggleSelectionValue(current: string[], value: string): string[] {
    if (current.includes(value)) {
      return current.filter((item) => item !== value);
    }

    return [...current, value];
  }

  private mergeFavorites(
    local: FavoriteList,
    server: FavoriteList,
  ): FavoriteList {
    const merged = this.createEmptyFavorites();

    favoriteTypes.forEach((type) => {
      merged[type] = Array.from(new Set([...local[type], ...server[type]]));
    });

    return merged;
  }
}
