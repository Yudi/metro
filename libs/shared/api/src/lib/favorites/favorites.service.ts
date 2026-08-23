import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import {
  OnDestroy,
  Service,
  effect,
  inject,
  PLATFORM_ID,
  signal,
  Signal,
} from '@angular/core';
import Dexie, { liveQuery, Table } from 'dexie';
// eslint-disable-next-line @nx/enforce-module-boundaries
import { firebaseIdToken, firebaseUser } from '@metro/shared/firebase';
import {
  FavoriteList,
  FavoriteTypes,
  createEmptyFavorites,
} from '@metro/shared/utils';
import { firstValueFrom } from 'rxjs';

// Anonymous data is deliberately retained but is never merged into an
// authenticated UID automatically. A future explicit "import anonymous
// favorites" action would have to make that choice visible to the user.
export const ANONYMOUS_FAVORITES_SCOPE = 'anonymous';
export const FAVORITE_CODE_MAX_LENGTH = 128;
const MAX_FAVORITES_PER_SCOPE = 500;
const FAVORITES_DATABASE_NAME = 'metro-favorites';

const favoriteTypes: FavoriteTypes[] = [
  'bikeStation',
  'railStation',
  'railLine',
  'busStop',
  'busRoute',
];

export type FavoriteOperation = 'add' | 'remove' | 'replace';

interface FavoriteRecord {
  key: string;
  scope: string;
  type: FavoriteTypes;
  code: string;
  updatedAt: number;
}

interface LegacyFavoriteRecord {
  key: string;
  type: FavoriteTypes;
  code: string;
  updatedAt: number;
  scope?: string;
}

interface DashboardSelectionRecord {
  key: string;
  scope: string;
  values: string[];
  updatedAt: number;
}

interface LegacyDashboardSelectionRecord {
  key: string;
  values: string[];
  updatedAt: number;
  scope?: string;
}

export interface FavoriteOutboxRecord {
  operationId: string;
  scope: string;
  operation: FavoriteOperation;
  type?: FavoriteTypes;
  code?: string;
  favorites?: FavoriteList;
  createdAt: number;
}

interface GraphqlResponse<T> {
  data?: T;
  errors?: readonly unknown[];
}

interface FavoriteSnapshotResult {
  revision?: number;
  favorites?: FavoriteList;
}

interface FavoriteSyncResult extends FavoriteSnapshotResult {
  success?: boolean;
  conflict?: boolean;
  message?: string;
}

interface UserFavoritesResult {
  userFavoritesSnapshot?: FavoriteSnapshotResult;
}

interface FavoriteMutationResult {
  syncFavorites?: FavoriteSyncResult;
}

export interface DashboardFavoriteSelections {
  railStationLines: Record<string, string[]>;
  busStopRoutes: Record<string, string[]>;
}

export function getFavoritesScope(userId: string | null | undefined): string {
  return userId ? `user:${userId}` : ANONYMOUS_FAVORITES_SCOPE;
}

function getFavoriteKey(
  scope: string,
  type: FavoriteTypes,
  code: string,
): string {
  return `${scope}:${type}:${code}`;
}

function getDashboardSelectionKey(
  scope: string,
  group: keyof DashboardFavoriteSelections,
  id: string,
): string {
  return `${scope}:${group}:${id}`;
}

function isValidFavoriteCode(code: string): boolean {
  if (code.length === 0 || code.length > FAVORITE_CODE_MAX_LENGTH) {
    return false;
  }

  return Array.from(code).every((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint > 0x1f && codePoint !== 0x7f;
  });
}

function normalizeFavoriteCodeValue(code: unknown): string | null {
  if (typeof code !== 'string') {
    return null;
  }

  const normalized = code.trim();
  return isValidFavoriteCode(normalized) ? normalized : null;
}

function normalizeFavoriteSnapshot(value: unknown): FavoriteList {
  const favorites = createEmptyFavorites();

  if (!value || typeof value !== 'object') {
    return favorites;
  }

  const rawFavorites = value as Partial<Record<FavoriteTypes, unknown>>;
  let total = 0;
  for (const type of favoriteTypes) {
    const codes = rawFavorites[type];
    if (Array.isArray(codes)) {
      const normalizedCodes = Array.from(
        new Set(
          codes.flatMap((code) => {
            const normalized = normalizeFavoriteCodeValue(code);
            return normalized ? [normalized] : [];
          }),
        ),
      );
      const available = Math.max(0, MAX_FAVORITES_PER_SCOPE - total);
      favorites[type] = normalizedCodes.slice(0, available);
      total += favorites[type].length;
    }
  }

  return favorites;
}

export function replayFavoriteOperations(
  favorites: FavoriteList,
  operations: FavoriteOutboxRecord[],
): FavoriteList {
  return operations.reduce((current, operation) => {
    if (operation.operation === 'replace') {
      return operation.favorites
        ? normalizeFavoriteSnapshot(operation.favorites)
        : current;
    }
    if (!operation.type || !operation.code) {
      return current;
    }

    const next = normalizeFavoriteSnapshot(current);
    if (operation.operation === 'add') {
      next[operation.type] = Array.from(
        new Set([...next[operation.type], operation.code]),
      );
    } else {
      next[operation.type] = next[operation.type].filter(
        (code) => code !== operation.code,
      );
    }
    return next;
  }, normalizeFavoriteSnapshot(favorites));
}

class FavoritesDatabase extends Dexie {
  favorites!: Table<FavoriteRecord, string>;
  dashboardSelections!: Table<DashboardSelectionRecord, string>;
  outbox!: Table<FavoriteOutboxRecord, string>;

  constructor() {
    super(FAVORITES_DATABASE_NAME);
    this.version(1).stores({
      favorites: '&key, type, code, updatedAt',
    });
    this.version(2).stores({
      favorites: '&key, type, code, updatedAt',
      dashboardSelections: '&key, updatedAt',
    });
    this.version(3)
      .stores({
        favorites: '&key, [scope+type], scope, type, code, updatedAt',
        dashboardSelections: '&key, scope, updatedAt',
        outbox: '&operationId, scope, operation, type, code, createdAt',
      })
      .upgrade(async (tx) => {
        const favoriteTable = tx.table('favorites');
        const oldFavorites =
          (await favoriteTable.toArray()) as LegacyFavoriteRecord[];
        await favoriteTable.clear();
        if (oldFavorites.length > 0) {
          await favoriteTable.bulkPut(
            oldFavorites.map((record) => ({
              ...record,
              scope: ANONYMOUS_FAVORITES_SCOPE,
              key: getFavoriteKey(
                ANONYMOUS_FAVORITES_SCOPE,
                record.type,
                record.code,
              ),
            })),
          );
        }

        const dashboardTable = tx.table('dashboardSelections');
        const oldDashboardSelections =
          (await dashboardTable.toArray()) as LegacyDashboardSelectionRecord[];
        await dashboardTable.clear();
        if (oldDashboardSelections.length > 0) {
          await dashboardTable.bulkPut(
            oldDashboardSelections.map((record) => {
              const separatorIndex = record.key.indexOf(':');
              const group = record.key.slice(
                0,
                separatorIndex,
              ) as keyof DashboardFavoriteSelections;
              const id = record.key.slice(separatorIndex + 1);
              const scope = ANONYMOUS_FAVORITES_SCOPE;
              return {
                ...record,
                scope,
                key: getDashboardSelectionKey(scope, group, id),
              };
            }),
          );
        }
      });
  }
}

@Service()
export class FavoritesService implements OnDestroy {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly firebaseUser = firebaseUser;
  private readonly firebaseIdToken = firebaseIdToken;
  private readonly http = inject(HttpClient);
  private readonly db = isPlatformBrowser(this.platformId)
    ? new FavoritesDatabase()
    : null;
  private favoritesSubscription?: { unsubscribe(): void };
  private dashboardSelectionsSubscription?: { unsubscribe(): void };
  private readonly onlineHandler = () => {
    this.syncWithServer();
  };
  private activeScope = getFavoritesScope(this.firebaseUser()?.uid);
  private scopeGeneration = 0;
  private syncInFlight?: Promise<void>;
  private retryTimer?: ReturnType<typeof setTimeout>;
  private retryAttempt = 0;

  private readonly _favorites = signal<FavoriteList>(createEmptyFavorites());
  readonly favorites: Signal<FavoriteList> = this._favorites.asReadonly();
  private readonly _dashboardSelections = signal<DashboardFavoriteSelections>(
    this.createEmptyDashboardSelections(),
  );
  readonly dashboardSelections: Signal<DashboardFavoriteSelections> =
    this._dashboardSelections.asReadonly();

  constructor() {
    if (!isPlatformBrowser(this.platformId) || !this.db) {
      return;
    }

    this.watchFavorites(this.activeScope);
    this.watchDashboardSelections(this.activeScope);
    window.addEventListener('online', this.onlineHandler);

    effect(() => {
      const scope = getFavoritesScope(this.firebaseUser()?.uid);
      if (scope !== this.activeScope) {
        this.switchScope(scope);
      }
    });
  }

  ngOnDestroy(): void {
    this.stopSubscriptions();
    if (isPlatformBrowser(this.platformId)) {
      window.removeEventListener('online', this.onlineHandler);
    }
    this.clearRetryTimer();
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

    return this.recordsToFavoriteList(
      await this.db.favorites.where('scope').equals(this.activeScope).toArray(),
    );
  }

  async readDashboardSelectionsSnapshot(): Promise<DashboardFavoriteSelections> {
    if (!isPlatformBrowser(this.platformId) || !this.db) {
      return this.createEmptyDashboardSelections();
    }

    return this.recordsToDashboardSelections(
      await this.db.dashboardSelections
        .where('scope')
        .equals(this.activeScope)
        .toArray(),
    );
  }

  async hasStoredFavorites(): Promise<boolean> {
    if (!isPlatformBrowser(this.platformId) || !this.db) {
      return false;
    }

    return (
      (await this.db.favorites.where('scope').equals(this.activeScope).count()) >
      0
    );
  }

  isFavorite(code: string, type: FavoriteTypes): boolean {
    if (!isPlatformBrowser(this.platformId)) {
      return false;
    }

    return this._favorites()[type]?.includes(code) ?? false;
  }

  setDashboardRailStationLines(stationKey: string, lineIds: string[]): void {
    this.setDashboardSelection('railStationLines', stationKey, lineIds);
  }

  setDashboardBusStopRoutes(stopId: string, routeKeys: string[]): void {
    this.setDashboardSelection('busStopRoutes', stopId, routeKeys);
  }

  toggleDashboardRailStationLine(stationKey: string, lineId: string): void {
    const current =
      this._dashboardSelections().railStationLines[stationKey] ?? [];
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
    const user = this.firebaseUser();
    if (
      !user ||
      !this.firebaseIdToken() ||
      !this.db ||
      this.activeScope !== getFavoritesScope(user.uid) ||
      this.syncInFlight
    ) {
      return;
    }

    const scope = this.activeScope;
    const generation = this.scopeGeneration;
    const request = this.syncScope(scope, generation);
    this.syncInFlight = request;
    void request.finally(() => {
      if (generation === this.scopeGeneration) {
        this.syncInFlight = undefined;
      }
    });
  }

  private switchScope(scope: string): void {
    this.scopeGeneration += 1;
    this.syncInFlight = undefined;
    this.clearRetryTimer();
    this.retryAttempt = 0;
    this.stopSubscriptions();
    this.activeScope = scope;
    this._favorites.set(this.createEmptyFavorites());
    this._dashboardSelections.set(this.createEmptyDashboardSelections());

    if (!this.db) {
      return;
    }

    this.watchFavorites(scope);
    this.watchDashboardSelections(scope);
    void this.refreshSignals(scope, this.scopeGeneration);
  }

  private async refreshSignals(scope: string, generation: number): Promise<void> {
    if (!this.db) {
      return;
    }

    const [favorites, dashboardSelections] = await Promise.all([
      this.db.favorites.where('scope').equals(scope).toArray(),
      this.db.dashboardSelections.where('scope').equals(scope).toArray(),
    ]);

    if (scope !== this.activeScope || generation !== this.scopeGeneration) {
      return;
    }

    this._favorites.set(this.recordsToFavoriteList(favorites));
    this._dashboardSelections.set(
      this.recordsToDashboardSelections(dashboardSelections),
    );
  }

  private watchFavorites(scope: string): void {
    if (!this.db) {
      return;
    }

    const db = this.db;
    this.favoritesSubscription = liveQuery(() =>
      db.favorites.where('scope').equals(scope).toArray(),
    ).subscribe({
      next: (records) => {
        if (scope === this.activeScope) {
          this._favorites.set(this.recordsToFavoriteList(records));
        }
      },
      error: () => {
        if (scope === this.activeScope) {
          this._favorites.set(this.createEmptyFavorites());
        }
      },
    });
  }

  private watchDashboardSelections(scope: string): void {
    if (!this.db) {
      return;
    }

    const db = this.db;
    this.dashboardSelectionsSubscription = liveQuery(() =>
      db.dashboardSelections.where('scope').equals(scope).toArray(),
    ).subscribe({
      next: (records) => {
        if (scope === this.activeScope) {
          this._dashboardSelections.set(
            this.recordsToDashboardSelections(records),
          );
        }
      },
      error: () => {
        if (scope === this.activeScope) {
          this._dashboardSelections.set(this.createEmptyDashboardSelections());
        }
      },
    });
  }

  private async addFavoriteRecord(
    code: string,
    type: FavoriteTypes,
  ): Promise<void> {
    const normalizedCode = this.normalizeFavoriteCode(code);
    if (!this.db || !normalizedCode || !favoriteTypes.includes(type)) {
      return;
    }

    const scope = this.activeScope;
    const current = await this.db.favorites.get(
      getFavoriteKey(scope, type, normalizedCode),
    );
    if (current) {
      return;
    }

    await this.db.transaction(
      'rw',
      this.db.favorites,
      this.db.outbox,
      async () => {
        await this.db?.favorites.put({
          key: getFavoriteKey(scope, type, normalizedCode),
          scope,
          type,
          code: normalizedCode,
          updatedAt: Date.now(),
        });

        if (scope !== ANONYMOUS_FAVORITES_SCOPE) {
          await this.replacePendingOperation(scope, {
            operationId: this.createOperationId(),
            scope,
            operation: 'add',
            type,
            code: normalizedCode,
            createdAt: Date.now(),
          });
        }
      },
    );

    if (scope !== ANONYMOUS_FAVORITES_SCOPE) {
      this.syncWithServer();
    }
  }

  private async removeFavoriteRecord(
    code: string,
    type: FavoriteTypes,
  ): Promise<void> {
    const normalizedCode = this.normalizeFavoriteCode(code);
    if (!this.db || !normalizedCode || !favoriteTypes.includes(type)) {
      return;
    }

    const scope = this.activeScope;
    const key = getFavoriteKey(scope, type, normalizedCode);
    const current = await this.db.favorites.get(key);
    if (!current) {
      return;
    }

    await this.db.transaction(
      'rw',
      this.db.favorites,
      this.db.outbox,
      async () => {
        await this.db?.favorites.delete(key);

        if (scope !== ANONYMOUS_FAVORITES_SCOPE) {
          await this.replacePendingOperation(scope, {
            operationId: this.createOperationId(),
            scope,
            operation: 'remove',
            type,
            code: normalizedCode,
            createdAt: Date.now(),
          });
        }
      },
    );

    if (scope !== ANONYMOUS_FAVORITES_SCOPE) {
      this.syncWithServer();
    }
  }

  private async clearFavoriteRecords(
    type: FavoriteTypes | 'all',
  ): Promise<void> {
    if (!this.db) {
      return;
    }

    const scope = this.activeScope;
    const current = this.recordsToFavoriteList(
      await this.db.favorites.where('scope').equals(scope).toArray(),
    );
    const desired = this.createEmptyFavorites();
    if (type !== 'all') {
      for (const favoriteType of favoriteTypes) {
        desired[favoriteType] =
          favoriteType === type ? [] : [...current[favoriteType]];
      }
    }

    await this.db.transaction(
      'rw',
      this.db.favorites,
      this.db.outbox,
      async () => {
        if (type === 'all') {
          await this.db?.favorites.where('scope').equals(scope).delete();
        } else {
          await this.db?.favorites
            .where('[scope+type]')
            .equals([scope, type])
            .delete();
        }

        if (scope !== ANONYMOUS_FAVORITES_SCOPE) {
          await this.db?.outbox.where('scope').equals(scope).delete();
          await this.db?.outbox.put({
            operationId: this.createOperationId(),
            scope,
            operation: 'replace',
            favorites: desired,
            createdAt: Date.now(),
          });
        }
      },
    );

    if (scope !== ANONYMOUS_FAVORITES_SCOPE) {
      this.syncWithServer();
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
      new Set(
        values.filter(
          (value): value is string =>
            typeof value === 'string' && value.trim().length > 0,
        ),
      ),
    );
    const scope = this.activeScope;
    const key = getDashboardSelectionKey(scope, group, id);

    void this.db.dashboardSelections.put({
      key,
      scope,
      values: normalizedValues,
      updatedAt: Date.now(),
    });
  }

  private async syncScope(scope: string, generation: number): Promise<void> {
    try {
      const result = await this.postGraphql<UserFavoritesResult>({
        query: `
          query GetFavorites {
            userFavoritesSnapshot {
              revision
              favorites {
                bikeStation
                railStation
                railLine
                busStop
                busRoute
              }
            }
          }
        `,
      });

      if (scope !== this.activeScope || generation !== this.scopeGeneration) {
        return;
      }

      let snapshot = this.requireSnapshot(result.userFavoritesSnapshot);
      for (let attempt = 0; attempt < 5; attempt += 1) {
        if (scope !== this.activeScope || generation !== this.scopeGeneration) {
          return;
        }

        const pending = await this.readOutbox(scope);
        const effective = this.applyOperations(snapshot.favorites, pending);
        await this.replaceScopeFavorites(scope, effective);

        if (pending.length === 0) {
          this.retryAttempt = 0;
          this.clearRetryTimer();
          return;
        }

        const result = await this.postGraphql<FavoriteMutationResult>({
          query: `
            mutation SyncFavorites(
              $favorites: FavoriteListInput!
              $expectedRevision: Int!
            ) {
              syncFavorites(
                favorites: $favorites
                expectedRevision: $expectedRevision
              ) {
                success
                conflict
                message
                revision
                favorites {
                  bikeStation
                  railStation
                  railLine
                  busStop
                  busRoute
                }
              }
            }
          `,
          variables: {
            favorites: effective,
            expectedRevision: snapshot.revision,
          },
        });
        const syncResult = result.syncFavorites;
        snapshot = this.requireSnapshot(syncResult);

        if (syncResult?.conflict) {
          continue;
        }
        if (!syncResult?.success) {
          throw new Error(syncResult?.message ?? 'Favorite synchronization failed');
        }

        await this.db?.outbox.bulkDelete(
          pending.map((operation) => operation.operationId),
        );

        const remaining = await this.readOutbox(scope);
        await this.replaceScopeFavorites(
          scope,
          this.applyOperations(snapshot.favorites, remaining),
        );
        if (remaining.length === 0) {
          this.retryAttempt = 0;
          this.clearRetryTimer();
          return;
        }
      }

      throw new Error('Favorite synchronization conflict retry limit reached');
    } catch {
      this.scheduleRetry(scope, generation);
    }
  }

  private async postGraphql<T>(body: unknown): Promise<T> {
    const response = await firstValueFrom(
      this.http.post<GraphqlResponse<T>>('/api/graphql', body),
    );
    if (response.errors && response.errors.length > 0) {
      throw new Error('GraphQL request returned errors');
    }
    if (!response.data) {
      throw new Error('GraphQL request returned no data');
    }

    return response.data;
  }


  private requireSnapshot(value: FavoriteSnapshotResult | undefined): {
    revision: number;
    favorites: FavoriteList;
  } {
    if (
      !value ||
      !Number.isInteger(value.revision) ||
      (value.revision ?? -1) < 0
    ) {
      throw new Error('Favorite synchronization returned an invalid revision');
    }

    return {
      revision: value.revision as number,
      favorites: this.normalizeFavorites(value.favorites),
    };
  }

  private async readOutbox(scope: string): Promise<FavoriteOutboxRecord[]> {
    if (!this.db) {
      return [];
    }

    const records = await this.db.outbox.where('scope').equals(scope).toArray();
    return records.sort(
      (left, right) =>
        left.createdAt - right.createdAt ||
        left.operationId.localeCompare(right.operationId),
    );
  }

  private async replacePendingOperation(
    scope: string,
    operation: FavoriteOutboxRecord,
  ): Promise<void> {
    if (!this.db) {
      return;
    }

    const pending = await this.readOutbox(scope);
    const matching = pending.filter(
      (item) =>
        item.operation !== 'replace' &&
        operation.operation !== 'replace' &&
        item.type === operation.type &&
        item.code === operation.code,
    );
    if (matching.length > 0) {
      await this.db.outbox.bulkDelete(
        matching.map((item) => item.operationId),
      );
    }
    await this.db.outbox.put(operation);
  }

  private async replaceScopeFavorites(
    scope: string,
    favorites: FavoriteList,
  ): Promise<void> {
    if (!this.db) {
      return;
    }

    const now = Date.now();
    const records: FavoriteRecord[] = favoriteTypes.flatMap((type) =>
      favorites[type].map((code) => ({
        key: getFavoriteKey(scope, type, code),
        scope,
        type,
        code,
        updatedAt: now,
      })),
    );

    await this.db.transaction('rw', this.db.favorites, async () => {
      await this.db?.favorites.where('scope').equals(scope).delete();
      if (records.length > 0) {
        await this.db?.favorites.bulkPut(records);
      }
    });
  }

  private applyOperations(
    favorites: FavoriteList,
    operations: FavoriteOutboxRecord[],
  ): FavoriteList {
    return replayFavoriteOperations(favorites, operations);
  }

  private scheduleRetry(scope: string, generation: number): void {
    if (
      this.retryTimer ||
      scope !== this.activeScope ||
      generation !== this.scopeGeneration
    ) {
      return;
    }

    const delay = Math.min(30_000, 500 * 2 ** this.retryAttempt);
    this.retryAttempt = Math.min(this.retryAttempt + 1, 6);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = undefined;
      this.syncWithServer();
    }, delay);
  }

  private clearRetryTimer(): void {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = undefined;
    }
  }

  private stopSubscriptions(): void {
    this.favoritesSubscription?.unsubscribe();
    this.dashboardSelectionsSubscription?.unsubscribe();
    this.favoritesSubscription = undefined;
    this.dashboardSelectionsSubscription = undefined;
  }

  private normalizeFavoriteCode(code: string): string | null {
    return normalizeFavoriteCodeValue(code);
  }

  private recordsToFavoriteList(records: FavoriteRecord[]): FavoriteList {
    const favorites = this.createEmptyFavorites();

    for (const record of records) {
      const code = this.normalizeFavoriteCode(record.code);
      if (favoriteTypes.includes(record.type) && code) {
        favorites[record.type].push(code);
      }
    }

    return this.normalizeFavorites(favorites);
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
    return normalizeFavoriteSnapshot(value);
  }

  private createEmptyFavorites(): FavoriteList {
    return createEmptyFavorites();
  }

  private createEmptyDashboardSelections(): DashboardFavoriteSelections {
    return {
      railStationLines: {},
      busStopRoutes: {},
    };
  }

  private parseDashboardSelectionKey(
    key: string,
  ): { group: keyof DashboardFavoriteSelections; id: string } | null {
    const groups: (keyof DashboardFavoriteSelections)[] = [
      'railStationLines',
      'busStopRoutes',
    ];
    const match = groups
      .map((group) => ({
        group,
        marker: `:${group}:`,
      }))
      .map((candidate) => ({
        ...candidate,
        index: key.indexOf(candidate.marker),
      }))
      .find((candidate) => candidate.index > 0);

    if (!match || match.index <= 0) {
      return null;
    }

    const scope = key.slice(0, match.index);
    const id = key.slice(match.index + match.marker.length);
    if (!scope || id.length === 0) {
      return null;
    }

    return { group: match.group, id };
  }

  private toggleSelectionValue(current: string[], value: string): string[] {
    if (current.includes(value)) {
      return current.filter((item) => item !== value);
    }

    return [...current, value];
  }

  private createOperationId(): string {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return crypto.randomUUID();
    }

    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}
