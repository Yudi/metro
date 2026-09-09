import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, timeout } from 'rxjs';
import type { BusFare } from '@metro/shared/utils';
import type { PublishedRouteInformation } from '@metro/shared/bus-itinerary-contracts';

export interface ItineraryPattern {
  id: string;
  directionId: number | null;
  headsign: string;
  stops: {
    id: string;
    name: string;
    sequence: number;
    latitude: number;
    longitude: number;
  }[];
  departures: string[];
  intervals: {
    startTime: string;
    endTime: string;
    headwaySeconds: number;
    exactTimes: boolean;
  }[];
  durationMinutes: number | null;
}

export interface RouteItinerary {
  status: string;
  serviceDate: string;
  operatorName: string | null;
  route: {
    routeId: string;
    shortName: string;
    longName: string;
    sourceAgency: string;
    color?: string;
    textColor?: string;
    fares: BusFare[];
  } | null;
  patterns: ItineraryPattern[];
}

@Injectable({ providedIn: 'root' })
export class ItinerariesService {
  private readonly http = inject(HttpClient);

  published(routeId: string) {
    return this.http
      .post<{
        data?: { busPublishedRouteInformation: PublishedRouteInformation };
        errors?: unknown[];
      }>('/api/graphql', {
        query: `query BusPublishedRouteInformation($routeId: String!) {
        busPublishedRouteInformation(routeId: $routeId) {
          status routeCode lastUpdated operatorName consortiumName
          days {
            kind directions {
              id headsign departures startTime endTime
              streets { name number notices }
              travelTimes { period minutes }
            }
          }
        }
      }`,
        variables: { routeId },
      })
      .pipe(
        timeout(20_000),
        map((response) => {
          if (
            response.errors?.length ||
            !response.data?.busPublishedRouteInformation
          ) {
            throw new Error('Published route information unavailable');
          }
          return response.data.busPublishedRouteInformation;
        }),
      );
  }

  load(routeId: string, serviceDate: string) {
    return this.http
      .post<{
        data?: { busRouteItinerary: RouteItinerary };
        errors?: unknown[];
      }>('/api/graphql', {
        query: `query BusRouteItinerary($routeId: String!, $serviceDate: String!) {
        busRouteItinerary(routeId: $routeId, serviceDate: $serviceDate) {
          status serviceDate operatorName
          route { routeId shortName longName sourceAgency color textColor fares { price currency } }
          patterns {
            id directionId headsign durationMinutes departures
            stops { id name sequence latitude longitude }
            intervals { startTime endTime headwaySeconds exactTimes }
          }
        }
      }`,
        variables: { routeId, serviceDate },
      })
      .pipe(
        timeout(20_000),
        map((response) => {
          if (response.errors?.length || !response.data?.busRouteItinerary) {
            throw new Error('Route itinerary unavailable');
          }
          return response.data.busRouteItinerary;
        }),
      );
  }
}
