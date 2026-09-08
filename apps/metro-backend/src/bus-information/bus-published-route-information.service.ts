import { Injectable } from '@nestjs/common';
import { GeographyServiceOptimized } from '../geography/services/geography-optimized.service';
import { BusRoute } from '../geography/entities/geography.entity';
import {
  PublishedRouteInformation,
  PublishedRouteDirection,
  PublishedServiceDay,
} from '@metro/shared/bus-itinerary-contracts';
import {
  BusPublishedRouteInformation,
  BusPublishedDirection,
  BusPublishedServiceDay,
} from './bus-published-route-information.entity';
import { BusPublishedRouteInformationClient } from './bus-published-route-information.client';
import { validateItineraryRouteId } from './bus-route-itinerary.service';

const SPTRANS_ROUTE_CODE = /^[0-9A-Z]{4}-\d{1,2}$/;

@Injectable()
export class BusPublishedRouteInformationService {
  constructor(
    private readonly geography: GeographyServiceOptimized,
    private readonly client: BusPublishedRouteInformationClient,
  ) {}

  async getInformation(routeId: string): Promise<BusPublishedRouteInformation> {
    const normalizedRouteId = validateItineraryRouteId(routeId);
    let route: BusRoute | null;
    try {
      route = await this.geography.getBusRoute(normalizedRouteId);
    } catch {
      return this.unavailable(normalizedRouteId, null);
    }

    if (!route) {
      return this.notFound(normalizedRouteId);
    }

    const routeCode = route.shortName.trim();
    if (
      route.sourceAgency.toLowerCase() !== 'sptrans' ||
      !SPTRANS_ROUTE_CODE.test(routeCode)
    ) {
      return this.unavailable(routeCode, route);
    }

    try {
      const published = await this.client.fetch(routeCode);
      return this.mapPublished(published, route);
    } catch {
      return this.unavailable(routeCode, route);
    }
  }

  private mapPublished(
    published: PublishedRouteInformation,
    route: BusRoute,
  ): BusPublishedRouteInformation {
    return {
      status: published.status,
      routeCode: published.routeCode,
      lastUpdated: published.lastUpdated,
      operatorName: published.operatorName,
      consortiumName: published.consortiumName,
      days: published.days.map((day) => this.mapDay(day)),
      route,
    };
  }

  private mapDay(day: PublishedServiceDay): BusPublishedServiceDay {
    return {
      kind: day.kind,
      directions: day.directions.map((direction) =>
        this.mapDirection(direction),
      ),
    };
  }

  private mapDirection(
    direction: PublishedRouteDirection,
  ): BusPublishedDirection {
    return {
      id: direction.id,
      headsign: direction.headsign,
      departures: direction.departures,
      streets: direction.streets.map((street) => ({
        name: street.name,
        number: street.number,
        notices: street.notices ?? [],
      })),
      travelTimes: direction.travelTimes.map((travelTime) => ({
        period: travelTime.period,
        minutes: travelTime.minutes,
      })),
      startTime: direction.startTime,
      endTime: direction.endTime,
    };
  }

  private unavailable(
    routeCode: string,
    route: BusRoute | null,
  ): BusPublishedRouteInformation {
    return {
      status: 'UNAVAILABLE',
      routeCode,
      lastUpdated: null,
      operatorName: null,
      consortiumName: null,
      days: [],
      route,
    };
  }

  private notFound(routeId: string): BusPublishedRouteInformation {
    return {
      status: 'NOT_FOUND',
      routeCode: routeId,
      lastUpdated: null,
      operatorName: null,
      consortiumName: null,
      days: [],
      route: null,
    };
  }
}
