import { HttpClient } from '@angular/common/http';
import { Service, inject } from '@angular/core';
import { API_BASE_URL } from '@metro/shared/api';
import type {
  ExtendedNextTrainLineCode,
  RailLinesStatusResponse,
} from '@metro/shared/utils';
import { catchError, firstValueFrom, map, of } from 'rxjs';
import type { LiteScheduledBusDeparture } from '../../shared/search/lite-search.service';
import type {
  BusFavoritesLookupResponse,
  MergedRailStationInsight,
  RailStatusResponse,
  RoutesForStopResponse,
  NextTrainsResponse,
} from './dashboard.types';

@Service()
export class DashboardApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);
  private readonly graphqlEndpoint = `${this.baseUrl}/graphql`;

  fetchBusFavorites(routeIds: string[], stopIds: string[]) {
    if (routeIds.length === 0 && stopIds.length === 0) {
      return of(null);
    }

    return this.http
      .post<BusFavoritesLookupResponse>(this.graphqlEndpoint, {
        query: `
          query LiteDashboardBusFavorites($routeIds: [ID!]!, $stopIds: [ID!]!) {
            multipleBusRoutes(ids: $routeIds) {
              routeId
              shortName
              longName
              color
              textColor
              sourceAgency
              sourceId
              supportsRealtime
              fares {
                price
                currency
              }
            }
            multipleBusStops(ids: $stopIds) {
              id
              stopId
              name
              latitude
              longitude
              isSubwayStation
              agencies
              routeShortNames
              sourceAgency
              sourceId
              platformCode
              mergedStopIds
            }
          }
        `,
        variables: { routeIds, stopIds },
      })
      .pipe(catchError(() => of(null)));
  }

  fetchMergedRailStations() {
    return this.http
      .post<{
        data?: {
          mergedRailStations: MergedRailStationInsight[];
        };
      }>(this.graphqlEndpoint, {
        query: `
          query LiteDashboardMergedRailStations {
            mergedRailStations {
              id
              name
              lines
            }
          }
        `,
      })
      .pipe(
        map((response) => response.data?.mergedRailStations ?? []),
        catchError(() => of([])),
      );
  }

  fetchRailStatus() {
    return this.http
      .post<RailStatusResponse>(this.graphqlEndpoint, {
        query: `
          query LiteDashboardRailStatus {
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
          }
        `,
      })
      .pipe(
        map((response) => ({
          ...(response.data?.railLinesStatus ?? {
            lines: [],
            specialLines: [],
            specialInfoCards: [],
            lastUpdated: new Date(),
            success: false,
            errorMessage: null,
          }),
          specialLines: response.data?.railSpecialLinesStatus ?? [],
          lastUpdated: new Date(
            response.data?.railLinesStatus?.lastUpdated ?? Date.now(),
          ),
        })),
        catchError(() =>
          of({
            lines: [],
            specialLines: [],
            specialInfoCards: [],
            lastUpdated: new Date(),
            success: false,
            errorMessage: 'Erro ao carregar status das linhas.',
          } satisfies RailLinesStatusResponse),
        ),
      );
  }

  fetchRoutesForStop(stopId: string) {
    return this.http
      .post<RoutesForStopResponse>(this.graphqlEndpoint, {
        query: `
          query LiteDashboardRoutesForStop($stopId: String!) {
            routesForStop(stopId: $stopId) {
              id
              routeId
              shortName
              longName
              color
              textColor
              sourceAgency
              sourceId
              supportsRealtime
              fares {
                price
                currency
              }
            }
          }
        `,
        variables: { stopId },
      })
      .pipe(
        map((response) => response.data?.routesForStop ?? []),
        catchError(() => of([])),
      );
  }

  fetchNextTrains(lineCode: ExtendedNextTrainLineCode, stationCode: string) {
    return this.http
      .post<NextTrainsResponse>(this.graphqlEndpoint, {
        query: `
          query LiteDashboardNextTrains($lineCode: String!, $stationCode: String!) {
            nextTrains(lineCode: $lineCode, stationCode: $stationCode) {
              trains {
                lineCode
                stationCode
                destinationCode
                destinationName
                arrivalTime
                isAtPlatform
              }
            }
          }
        `,
        variables: { lineCode, stationCode },
      })
      .pipe(
        map((response) => response.data?.nextTrains?.trains ?? []),
        catchError(() => of([])),
      );
  }

  fetchScheduledDepartures(
    stopId: string,
    limit = 5,
  ): Promise<LiteScheduledBusDeparture[]> {
    return firstValueFrom(
      this.http
        .post<{
          data?: {
            scheduledBusDepartures?: LiteScheduledBusDeparture[];
          };
        }>(this.graphqlEndpoint, {
          query: `
            query LiteDashboardScheduledBusDepartures($stopId: String!, $limit: Int!) {
              scheduledBusDepartures(
                stopId: $stopId
                limit: $limit
                perRouteLimit: $limit
              ) {
                routeId
                routeShortName
                tripId
                headsign
                directionId
                departureTime
                sourceAgency
                platformCode
              }
            }
          `,
          variables: { stopId, limit },
        })
        .pipe(
          map((response) => response.data?.scheduledBusDepartures ?? []),
          catchError(() => of([])),
        ),
    );
  }
}
