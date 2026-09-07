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
import { liveQuery } from 'dexie';
// eslint-disable-next-line @nx/enforce-module-boundaries
import { firebaseIdToken, firebaseUser } from '@metro/shared/firebase';
import { createEmptyFavorites } from '@metro/shared/utils';
import type { FavoriteList, FavoriteTypes } from '@metro/shared/utils';
import { firstValueFrom } from 'rxjs';
import type {
  DashboardFavoriteSelections,
  DashboardSelectionRecord,
  FavoriteMutationResult,
  FavoriteOutboxRecord,
  FavoriteRecord,
  FavoriteSnapshotResult,
  GraphqlResponse,
  UserFavoritesResult,
} from './favorites.models';
import {
  ANONYMOUS_FAVORITES_SCOPE,
  MAX_FAVORITES_PER_SCOPE,
  classifyGraphqlErrors,
  classifyFavoriteSyncError,
  favoriteTypes,
  getDashboardSelectionKey,
  getFavoriteKey,
  getFavoritesScope,
  normalizeFavoriteCodeValue,
  normalizeFavoriteSnapshot,
  replayFavoriteOperations,
  FavoriteSyncFailure,
} from './favorites.helpers';
import { FavoritesDatabase } from './favorites.database';

export {
  ANONYMOUS_FAVORITES_SCOPE,
  FAVORITE_CODE_MAX_LENGTH,
  classifyFavoriteSyncError,
  getFavoritesScope,
  replayFavoriteOperations,
} from './favorites.helpers';
export type {
  DashboardFavoriteSelections,
  FavoriteOperation,
  FavoriteOutboxRecord,
  FavoriteOutboxStatus,
  FavoriteSyncErrorInfo,
  FavoriteSyncErrorKind,
} from './favorites.models';

const FAVORITE_SYNC_ERROR_MESSAGE =
  'Não foi possível sincronizar seus favoritos. Revise os favoritos pendentes e tente novamente.';
const FAVORITE_LIMIT_ERROR_MESSAGE =
  'Você já atingiu o limite de 500 favoritos.';

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
  private readonly _syncError = signal<string | null>(null);
  readonly syncError: Signal<string | null> = this._syncError.asReadonly();
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

    void this.addFavoriteRecord(code, type).catch(() => {
      this._syncError.set(FAVORITE_SYNC_ERROR_MESSAGE);
    });
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
      (await this.db.favorites
        .where('scope')
        .equals(this.activeScope)
        .count()) > 0
    );
  }

  async retryFailedFavoriteSync(): Promise<void> {
    if (!this.db) {
      return;
    }

    const scope = this.activeScope;
    await this.db.transaction('rw', this.db.outbox, async () => {
      const failed = (await this.readOutbox(scope, true)).filter(
        (operation) => operation.status === 'dead-letter',
      );
      await this.db?.outbox.bulkPut(
        failed.map((operation) => ({
          ...operation,
          status: 'pending' as const,
          lastError: undefined,
        })),
      );
    });

    if (scope === this.activeScope) {
      this._syncError.set(null);
      this.retryAttempt = 0;
      this.syncWithServer();
    }
  }

  async discardFailedFavoriteSync(): Promise<void> {
    if (!this.db) {
      return;
    }

    const scope = this.activeScope;
    await this.db.transaction('rw', this.db.outbox, async () => {
      const failed = await this.db?.outbox
        .where('scope')
        .equals(scope)
        .filter((operation) => operation.status === 'dead-letter')
        .toArray();
      if (failed && failed.length > 0) {
        await this.db?.outbox.bulkDelete(
          failed.map((operation) => operation.operationId),
        );
      }
    });

    if (scope === this.activeScope) {
      this._syncError.set(null);
      this.syncWithServer();
    }
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
    this._syncError.set(null);
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

  private async refreshSignals(
    scope: string,
    generation: number,
  ): Promise<void> {
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
    this.favoritesSubscription = liveQuery(async () => ({
      records: await db.favorites.where('scope').equals(scope).toArray(),
      operations: await this.readOutbox(scope, true),
    })).subscribe({
      next: ({ records, operations }) => {
        if (scope === this.activeScope) {
          this._favorites.set(this.recordsToFavoriteList(records));
          if (
            operations.some((operation) => operation.status === 'dead-letter')
          ) {
            this._syncError.set(FAVORITE_SYNC_ERROR_MESSAGE);
          }
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
    const db = this.db;
    const result = await db.transaction(
      'rw',
      db.favorites,
      db.outbox,
      async () => {
        const key = getFavoriteKey(scope, type, normalizedCode);
        if (await db.favorites.get(key)) {
          return 'already-present' as const;
        }

        const count = await db.favorites.where('scope').equals(scope).count();
        if (count >= MAX_FAVORITES_PER_SCOPE) {
          return 'limit-reached' as const;
        }

        await db.favorites.put({
          key,
          scope,
          type,
          code: normalizedCode,
          updatedAt: Date.now(),
        });

        if (scope !== ANONYMOUS_FAVORITES_SCOPE) {
          await this.replacePendingOperation(scope, {
            operationId: this.createOperationId(),
            scope,
            status: 'pending',
            operation: 'add',
            type,
            code: normalizedCode,
            createdAt: Date.now(),
          });
        }

        return 'added' as const;
      },
    );

    if (result === 'limit-reached') {
      this._syncError.set(FAVORITE_LIMIT_ERROR_MESSAGE);
      return;
    }

    if (result === 'added' && scope !== ANONYMOUS_FAVORITES_SCOPE) {
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
            status: 'pending',
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
            status: 'pending',
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
      if (
        this.pauseForFailedOperations(
          await this.readOutbox(scope, true),
          scope,
          generation,
        )
      ) {
        return;
      }
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
      await this.queueAnonymousFavoritesImport(
        scope,
        generation,
        snapshot.favorites,
      );
      for (let attempt = 0; attempt < 5; attempt += 1) {
        if (scope !== this.activeScope || generation !== this.scopeGeneration) {
          return;
        }

        const pending = await this.readOutbox(scope, true);
        if (this.pauseForFailedOperations(pending, scope, generation)) {
          return;
        }
        const effective = this.applyOperations(snapshot.favorites, pending);
        await this.replaceScopeFavorites(scope, effective);

        if (pending.length === 0) {
          this.retryAttempt = 0;
          this.clearRetryTimer();
          this._syncError.set(null);
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
          throw new FavoriteSyncFailure(
            'terminal',
            'server-rejected-favorites',
          );
        }

        await this.db?.outbox.bulkDelete(
          pending.map((operation) => operation.operationId),
        );

        const remaining = await this.readOutbox(scope, true);
        if (this.pauseForFailedOperations(remaining, scope, generation)) {
          return;
        }
        await this.replaceScopeFavorites(
          scope,
          this.applyOperations(snapshot.favorites, remaining),
        );
        if (remaining.length === 0) {
          this.retryAttempt = 0;
          this.clearRetryTimer();
          this._syncError.set(null);
          return;
        }
      }

      throw new FavoriteSyncFailure('terminal', 'conflict-retry-limit-reached');
    } catch (error: unknown) {
      const failure = classifyFavoriteSyncError(error);
      if (failure.kind === 'terminal') {
        try {
          await this.quarantinePendingOperations(scope, failure.reason);
        } catch {
          // The terminal state is still exposed even if IndexedDB is itself
          // unavailable, preventing another unbounded replay attempt.
        }
        if (scope === this.activeScope && generation === this.scopeGeneration) {
          this.clearRetryTimer();
          this._syncError.set(FAVORITE_SYNC_ERROR_MESSAGE);
        }
        return;
      }

      await this.recordTransientFailure(scope, failure.reason);
      this.scheduleRetry(scope, generation);
    }
  }

  private async postGraphql<T>(body: unknown): Promise<T> {
    let response: GraphqlResponse<T>;
    try {
      response = await firstValueFrom(
        this.http.post<GraphqlResponse<T>>('/api/graphql', body),
      );
    } catch (error: unknown) {
      const failure = classifyFavoriteSyncError(error);
      throw new FavoriteSyncFailure(failure.kind, failure.reason);
    }

    if (response.errors && response.errors.length > 0) {
      throw new FavoriteSyncFailure(
        classifyGraphqlErrors(response.errors),
        'graphql-errors',
      );
    }
    if (!response.data) {
      throw new FavoriteSyncFailure('terminal', 'graphql-no-data');
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
      throw new FavoriteSyncFailure('terminal', 'invalid-favorite-snapshot');
    }

    return {
      revision: value.revision as number,
      favorites: this.normalizeFavorites(value.favorites),
    };
  }

  private pauseForFailedOperations(
    operations: FavoriteOutboxRecord[],
    scope: string,
    generation: number,
  ): boolean {
    if (scope !== this.activeScope || generation !== this.scopeGeneration) {
      return true;
    }
    if (!operations.some((operation) => operation.status === 'dead-letter')) {
      return false;
    }

    this.clearRetryTimer();
    this._syncError.set(FAVORITE_SYNC_ERROR_MESSAGE);
    return true;
  }

  private async readOutbox(
    scope: string,
    includeFailed = false,
  ): Promise<FavoriteOutboxRecord[]> {
    if (!this.db) {
      return [];
    }

    const records = (
      await this.db.outbox.where('scope').equals(scope).toArray()
    ).filter(
      (operation) => includeFailed || operation.status !== 'dead-letter',
    );
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

    const pending = await this.readOutbox(scope, true);
    const matching = pending.filter(
      (item) =>
        item.operation !== 'replace' &&
        operation.operation !== 'replace' &&
        item.type === operation.type &&
        item.code === operation.code,
    );
    if (matching.length > 0) {
      await this.db.outbox.bulkDelete(matching.map((item) => item.operationId));
    }
    await this.db.outbox.put(operation);
  }

  private async queueAnonymousFavoritesImport(
    scope: string,
    generation: number,
    serverFavorites: FavoriteList,
  ): Promise<void> {
    if (
      !this.db ||
      scope === ANONYMOUS_FAVORITES_SCOPE ||
      scope !== this.activeScope ||
      generation !== this.scopeGeneration
    ) {
      return;
    }

    await this.db.transaction(
      'rw',
      this.db.favorites,
      this.db.outbox,
      this.db.anonymousFavoritesImports,
      async () => {
        if (await this.db?.anonymousFavoritesImports.get(scope)) {
          return;
        }

        const [accountFavorites, accountOperations, anonymousFavorites] =
          await Promise.all([
            this.db?.favorites.where('scope').equals(scope).toArray() ?? [],
            this.db?.outbox.where('scope').equals(scope).toArray() ?? [],
            this.db?.favorites
              .where('scope')
              .equals(ANONYMOUS_FAVORITES_SCOPE)
              .toArray() ?? [],
          ]);

        await this.db?.anonymousFavoritesImports.put({
          scope,
          importedAt: Date.now(),
        });

        if (
          accountFavorites.length > 0 ||
          accountOperations.length > 0 ||
          this.hasFavorites(serverFavorites) ||
          anonymousFavorites.length === 0
        ) {
          return;
        }

        await this.db?.outbox.put({
          operationId: this.createOperationId(),
          scope,
          status: 'pending',
          operation: 'replace',
          favorites: this.recordsToFavoriteList(anonymousFavorites),
          createdAt: Date.now(),
        });
      },
    );
  }

  private async quarantinePendingOperations(
    scope: string,
    reason: string,
  ): Promise<void> {
    if (!this.db) {
      return;
    }

    const pending = await this.readOutbox(scope);
    if (pending.length === 0) {
      return;
    }

    await this.db.transaction('rw', this.db.outbox, async () => {
      await this.db?.outbox.bulkPut(
        pending.map((operation) => ({
          ...operation,
          status: 'dead-letter' as const,
          attempts: (operation.attempts ?? 0) + 1,
          lastError: reason.slice(0, 64),
        })),
      );
    });
  }

  private async recordTransientFailure(
    scope: string,
    reason: string,
  ): Promise<void> {
    if (!this.db) {
      return;
    }

    try {
      const pending = await this.readOutbox(scope);
      if (pending.length === 0) {
        return;
      }

      await this.db.transaction('rw', this.db.outbox, async () => {
        await this.db?.outbox.bulkPut(
          pending.map((operation) => ({
            ...operation,
            status: 'pending' as const,
            attempts: (operation.attempts ?? 0) + 1,
            lastError: reason.slice(0, 64),
          })),
        );
      });
    } catch {
      // Persistence of retry metadata must not prevent the bounded retry
      // scheduler from handling a transient IndexedDB failure.
    }
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

  private hasFavorites(favorites: FavoriteList): boolean {
    return favoriteTypes.some((type) => favorites[type].length > 0);
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
