import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import type {
  BusTerminalDetail,
  BusTerminalSummary,
} from '@metro/shared/bus-terminal-contracts';

interface GraphqlResult<T> {
  data?: T;
  errors?: readonly { message: string }[];
}

interface BusTerminalDetailResponse {
  busTerminal: BusTerminalDetail | null;
}

interface BusTerminalSummaryResponse {
  busTerminalForStop: BusTerminalSummary | null;
}

const BUS_TERMINAL_FIELDS = `
  id
  name
  aliases
  latitude
  longitude
  stopIds
  platformCodes
`;

const BUS_TERMINAL_DETAIL_FIELDS = `
  ${BUS_TERMINAL_FIELDS}
  stops {
    stopId
    name
    description
    latitude
    longitude
    sourceAgency
    sourceId
    platformCode
    mergedStopIds
    boardingAllowed
  }
  routes {
    routeId
    shortName
    longName
    sourceAgency
    sourceId
    supportsRealtime
    color
    textColor
    destination
    directionId
    favoriteCode
    isCircular
    stopIds
  }
`;

@Injectable({ providedIn: 'root' })
export class BusTerminalsService {
  private readonly http = inject(HttpClient);
  private readonly graphqlEndpoint = '/api/graphql';

  getTerminalDetail(terminalId: string): Observable<BusTerminalDetail | null> {
    const query = `
      query BusTerminal($terminalId: String!) {
        busTerminal(terminalId: $terminalId) {
          ${BUS_TERMINAL_DETAIL_FIELDS}
        }
      }
    `;

    return this.execute<BusTerminalDetailResponse>(query, { terminalId }).pipe(
      map((data) => data.busTerminal),
    );
  }

  getTerminalForStop(stopId: string): Observable<BusTerminalSummary | null> {
    const query = `
      query BusTerminalForStop($stopId: String!) {
        busTerminalForStop(stopId: $stopId) {
          ${BUS_TERMINAL_FIELDS}
        }
      }
    `;

    return this.execute<BusTerminalSummaryResponse>(query, { stopId }).pipe(
      map((data) => data.busTerminalForStop),
    );
  }

  private execute<T>(
    query: string,
    variables: Record<string, string>,
  ): Observable<T> {
    return this.http
      .post<GraphqlResult<T>>(this.graphqlEndpoint, { query, variables })
      .pipe(
        map((response) => {
          if (response.errors?.length || response.data === undefined) {
            throw new Error('Não foi possível consultar o terminal de ônibus.');
          }
          return response.data;
        }),
      );
  }
}
