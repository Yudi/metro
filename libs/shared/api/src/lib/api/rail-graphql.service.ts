import { Injectable, inject, computed, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, catchError, of, tap, shareReplay } from 'rxjs';
import {
  RailLineStatus,
  RailStatusCode,
  RailLinesStatusResponse,
  HistoricalHeadwayQuery,
  HistoricalHeadwaySnapshot,
  SpecialRailInfoCardStatus,
  SpecialRailLineStatus,
  SpecialRailService,
  getStatusColorClass,
  hasStatusIssue,
  isStatusUnavailable,
} from '@metro/shared/utils';
import { API_BASE_URL } from './api.tokens';
import { LoggerService } from './logger.service';

interface RailLinesStatusDataResponse {
  data: {
    railLinesStatus: RailLinesStatusResponse;
    railSpecialLinesStatus?: SpecialRailLineStatus[];
    railSpecialInfoCardsStatus?: SpecialRailInfoCardStatus[];
  };
}

interface RailLineStatusesResponse {
  data: {
    railLineStatuses: RailLineStatus[];
  };
}

export interface CptmStationInfo {
  stationCode: string;
  stationName: string;
  lineCode: string;
  latitude: number;
  longitude: number;
}

export interface RailNextTrainArrival {
  lineCode: string;
  stationCode: string;
  destinationCode: string;
  destinationName: string;
  trainCurrentStationCode: string;
  trainCurrentStationName: string;
  arrivalTime: string;
  isAtPlatform: boolean | null;
  updatedAt: string;
}

export interface StationNextTrains {
  stationCode: string;
  stationName: string;
  lineCode: string;
  trains: RailNextTrainArrival[];
  operationClosed?: boolean;
  outOfSchedule?: boolean;
  fetchedAt?: string;
}

interface NextTrainsResponse {
  data: {
    nextTrains: StationNextTrains | null;
  };
}

interface FindCptmStationResponse {
  data: {
    findCptmStation: CptmStationInfo | null;
  };
}

interface SpecialRailServicesResponse {
  data: {
    railSpecialServices: SpecialRailService[];
  };
}

interface HistoricalHeadwayResponse {
  data?: {
    historicalData?: {
      headwaySnapshots: HistoricalHeadwaySnapshot[];
    };
  };
}

/**
 * Shared rail status service with caching
 * Used by both home page and station dialogs
 */
@Injectable({
  providedIn: 'root',
})
export class RailGraphqlService {
  private readonly baseUrl = inject(API_BASE_URL);
  private http = inject(HttpClient);
  private logger = inject(LoggerService);
  private readonly graphqlEndpoint = this.baseUrl + '/graphql';

  // Cache configuration
  private readonly CACHE_TTL_MS = 60 * 1000; // 1 minute fresh
  private readonly STALE_TTL_MS = 10 * 60 * 1000; // 10 minutes max stale

  // Cached status as signal for reactive updates
  private readonly _linesStatus = signal<RailLinesStatusResponse | null>(null);
  private readonly _loading = signal(false);
  private readonly _error = signal<string | null>(null);
  private lastFetchTime: number | null = null;
  private fetchInProgress$: Observable<RailLinesStatusResponse> | null = null;

  /** Current rail lines status (cached) */
  readonly linesStatus = this._linesStatus.asReadonly();

  /** Loading state */
  readonly loading = this._loading.asReadonly();

  /** Error state */
  readonly error = this._error.asReadonly();
  private readonly _specialServices = signal<SpecialRailService[]>([]);
  readonly specialServices = this._specialServices.asReadonly();

  /** Map of line code to status for quick lookup */
  readonly lineStatusMap = computed(() => {
    const status = this._linesStatus();
    if (!status) return new Map<number, RailLineStatus>();
    return new Map(status.lines.map((line) => [line.code, line]));
  });

  /**
   * Check if we have any cached data
   */
  hasCachedData(): boolean {
    return this._linesStatus() !== null;
  }

  /**
   * Check if cache is fresh (< 1 minute)
   */
  isCacheFresh(): boolean {
    if (!this.lastFetchTime || !this._linesStatus()) return false;
    return Date.now() - this.lastFetchTime < this.CACHE_TTL_MS;
  }

  /**
   * Check if cache is stale but usable (< 10 minutes)
   */
  isCacheStale(): boolean {
    if (!this.lastFetchTime || !this._linesStatus()) return false;
    const age = Date.now() - this.lastFetchTime;
    return age >= this.CACHE_TTL_MS && age < this.STALE_TTL_MS;
  }

  /**
   * Get cached status synchronously (returns null if not cached)
   */
  getCachedStatus(): RailLinesStatusResponse | null {
    return this._linesStatus();
  }

  /**
   * Fetch all rail lines status from backend
   * Uses caching with background refresh
   */
  fetchLinesStatus(forceRefresh = false): Observable<RailLinesStatusResponse> {
    // Return fresh cached data immediately
    if (!forceRefresh && this.isCacheFresh()) {
      const cached = this._linesStatus();
      if (cached) return of(cached);
    }

    // If stale but valid, return cached and refresh in background
    if (!forceRefresh && this.isCacheStale()) {
      const cached = this._linesStatus();
      if (cached) {
        this.backgroundRefresh();
        return of(cached);
      }
    }

    // If already fetching, return the existing observable
    if (this.fetchInProgress$) {
      return this.fetchInProgress$;
    }

    // Start new fetch
    this._loading.set(true);
    this._error.set(null);

    this.fetchInProgress$ = this.doFetchLineStatus().pipe(
      tap(() => {
        this.fetchInProgress$ = null;
      }),
      shareReplay(1),
    );

    return this.fetchInProgress$;
  }

  /**
   * Prefetch status (fire and forget)
   */
  prefetch(): void {
    if (!this.isCacheFresh() && !this.fetchInProgress$) {
      this.fetchLinesStatus().subscribe();
    }
  }

  private backgroundRefresh(): void {
    if (!this.fetchInProgress$) {
      this.doFetchLineStatus().subscribe();
    }
  }

  private doFetchLineStatus(): Observable<RailLinesStatusResponse> {
    const query = `
      query RailLinesStatus {
        railLinesStatus {
          lines {
            code
            colorName
            colorHex
            line
            statusCode
            statusLabel
            statusColor
            description
            incidentCategory
            detail
          }
          lastUpdated
          success
          errorMessage
        }
        railSpecialLinesStatus {
          code
          colorName
          colorHex
          line
          statusCode
          statusLabel
          statusColor
          nextDepartures {
            label
            time
          }
          issues {
            code
            line
            description
          }
        }
        railSpecialInfoCardsStatus {
          id
          title
          subtitle
          badgeIcon
          badgeColorHex
          statusCode
          statusLabel
        }
      }
    `;

    return this.http
      .post<RailLinesStatusDataResponse>(this.graphqlEndpoint, { query })
      .pipe(
        map((response) => ({
          ...response.data.railLinesStatus,
          specialLines: response.data.railSpecialLinesStatus ?? [],
          specialInfoCards: response.data.railSpecialInfoCardsStatus ?? [],
          lastUpdated: new Date(response.data.railLinesStatus.lastUpdated),
        })),
        tap((status) => {
          this._linesStatus.set(status);
          this._loading.set(false);
          this.lastFetchTime = Date.now();
        }),
        catchError((err) => {
          const errorMsg = err.message || 'Failed to fetch rail lines status';
          this._error.set(errorMsg);
          this._loading.set(false);

          // Return cached data on error if available
          const cached = this._linesStatus();
          if (cached) {
            return of({
              ...cached,
              errorMessage: errorMsg,
            });
          }

          this.logger.error('Line status fetch error', err);
          return of({
            lines: [],
            specialLines: [],
            specialInfoCards: [],
            lastUpdated: new Date(),
            success: false,
            errorMessage: errorMsg,
          } as RailLinesStatusResponse);
        }),
      );
  }

  /**
   * Fetch status for specific line codes
   */
  fetchLineStatuses(codes: number[]): Observable<RailLineStatus[]> {
    if (codes.length === 0) {
      return of([]);
    }

    const query = `
      query RailLineStatuses($codes: [Int!]!) {
        railLineStatuses(codes: $codes) {
          code
          colorName
          colorHex
          line
          statusCode
          statusLabel
          statusColor
          description
          incidentCategory
          detail
        }
      }
    `;

    return this.http
      .post<RailLineStatusesResponse>(this.graphqlEndpoint, {
        query,
        variables: { codes },
      })
      .pipe(
        map((response) => response.data.railLineStatuses),
        catchError(() => of([])),
      );
  }

  fetchSpecialServices(): Observable<SpecialRailService[]> {
    const query = `
      query RailSpecialServices {
        railSpecialServices {
          code
          name
          colorHex
          textColorHex
          stations {
            stationCode
            name
            latitude
            longitude
          }
        }
      }
    `;

    return this.http
      .post<SpecialRailServicesResponse>(this.graphqlEndpoint, { query })
      .pipe(
        map((response) => response.data?.railSpecialServices ?? []),
        tap((services) => this._specialServices.set(services)),
        catchError((error) => {
          this.logger.error('Special rail services fetch error', error);
          return of(this._specialServices());
        }),
      );
  }

  /**
   * Get a line status from cache by code
   * Returns null if not cached - call fetchLinesStatus first
   */
  getLineStatus(code: number): RailLineStatus | undefined {
    return this.lineStatusMap().get(code);
  }

  /**
   * Get multiple line statuses from cache by codes
   */
  getLineStatuses(codes: number[]): RailLineStatus[] {
    const map = this.lineStatusMap();
    return codes
      .map((code) => map.get(code))
      .filter((line): line is RailLineStatus => !!line);
  }

  /**
   * Get the appropriate status color class for styling
   */
  getStatusColorClass(statusCode: RailStatusCode): string {
    return getStatusColorClass(statusCode);
  }

  /**
   * Check if the line status indicates any issues
   */
  hasIssue(statusCode: RailStatusCode): boolean {
    return hasStatusIssue(statusCode);
  }

  /**
   * Check if the line status data is unavailable
   */
  isUnavailable(statusCode: RailStatusCode): boolean {
    return isStatusUnavailable(statusCode);
  }

  nextTrains(
    lineCode: string,
    stationCode: string,
  ): Observable<StationNextTrains | null> {
    const query = `
      query NextTrains($lineCode: String!, $stationCode: String!) {
        nextTrains(lineCode: $lineCode, stationCode: $stationCode) {
          stationCode
          stationName
          lineCode
          operationClosed
          outOfSchedule
          fetchedAt
          trains {
            lineCode
            stationCode
            destinationCode
            destinationName
            trainCurrentStationCode
            trainCurrentStationName
            arrivalTime
            isAtPlatform
            updatedAt
          }
        }
      }
    `;

    return this.http
      .post<NextTrainsResponse>(this.graphqlEndpoint, {
        query,
        variables: { lineCode, stationCode },
      })
      .pipe(
        map((response) => response.data?.nextTrains ?? null),
        catchError((err) => {
          this.logger.error('Failed to fetch next trains', err);
          return of(null);
        }),
      );
  }

  /**
   * Find a CPTM station by name and line code.
   */
  findCptmStation(
    stationName: string,
    lineCode: number,
  ): Observable<CptmStationInfo | null> {
    const query = `
      query FindCptmStation($stationName: String!, $lineCode: Int!) {
        findCptmStation(stationName: $stationName, lineCode: $lineCode) {
          stationCode
          stationName
          lineCode
          latitude
          longitude
        }
      }
    `;

    return this.http
      .post<FindCptmStationResponse>(this.graphqlEndpoint, {
        query,
        variables: { stationName, lineCode },
      })
      .pipe(
        map((response) => response.data?.findCptmStation ?? null),
        catchError((err) => {
          this.logger.error('Failed to find CPTM station', err);
          return of(null);
        }),
      );
  }

  fetchHistoricalHeadwaySnapshots(
    params: HistoricalHeadwayQuery,
  ): Observable<HistoricalHeadwaySnapshot[]> {
    const query = `
      query HistoricalHeadway(
        $filter: HistoricalDataFilterInput
        $limit: Int
        $offset: Int
      ) {
        historicalData(filter: $filter, limit: $limit, offset: $offset) {
          headwaySnapshots {
            id
            observedAt
            lineCode
            agency
            stationName
            direction
            averageSeconds
            sampleCount
            bucket
            bucketLabel
            isFallback
            samples
            source
            errors
            metadata
            createdAt
          }
        }
      }
    `;

    return this.http
      .post<HistoricalHeadwayResponse>(this.graphqlEndpoint, {
        query,
        variables: {
          filter: {
            ...params.filter,
            includeIncidents: false,
            includeHeadway: true,
          },
          limit: params.limit,
          offset: params.offset,
        },
      })
      .pipe(
        map(
          (response) =>
            response.data?.historicalData?.headwaySnapshots ?? [],
        ),
      );
  }
}
