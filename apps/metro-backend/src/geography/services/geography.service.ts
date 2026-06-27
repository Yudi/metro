import { Injectable } from '@nestjs/common';
import { PostGISService } from './postgis.service';
import { BusStopService } from './bus-stop.service';
import { SubwayStationService } from './subway-station.service';
import { BusRouteService } from './bus-route.service';
import { TripService } from './trip.service';
import {
  BusStop,
  BusRoute,
  BusShape,
  Trip,
  BoundingBox,
} from '../entities/geography.entity';
import { BoundingBoxInput, StopSearchInput } from '../dto/geography.input';

@Injectable()
export class GeographyService {
  constructor(
    private postGIS: PostGISService,
    private busStopService: BusStopService,
    private subwayStationService: SubwayStationService,
    private busRouteService: BusRouteService,
    private tripService: TripService,
  ) {}

  // Debug method
  async testDatabaseConnection() {
    return this.postGIS.testDatabaseConnection();
  }

  // Bus Stops - delegated to BusStopService
  async searchBusStops(input?: StopSearchInput): Promise<BusStop[]> {
    return this.busStopService.searchBusStops(input);
  }

  async getAllBusStops(): Promise<BusStop[]> {
    return this.busStopService.getAllBusStops();
  }

  async getBusStopsInBounds(bounds: BoundingBoxInput): Promise<BusStop[]> {
    return this.busStopService.getBusStopsInBounds(bounds);
  }

  async getBusStop(id: string): Promise<BusStop | null> {
    return this.busStopService.getBusStop(id);
  }

  // Subway Stations - delegated to SubwayStationService
  async getSubwayStations(): Promise<BusStop[]> {
    return this.subwayStationService.getSubwayStations();
  }

  // Bus Routes - delegated to BusRouteService
  async getAllBusRoutes(): Promise<BusRoute[]> {
    return this.busRouteService.getAllBusRoutes();
  }

  async getSubwayRoutes(): Promise<BusRoute[]> {
    return this.busRouteService.getSubwayRoutes();
  }

  async getBusRoute(id: string): Promise<BusRoute | null> {
    return this.busRouteService.getBusRoute(id);
  }

  // Bus Shapes - delegated to BusRouteService
  async getBusShape(shapeId: string): Promise<BusShape | null> {
    return this.busRouteService.getBusShape(shapeId);
  }

  async getAllBusShapes(): Promise<BusShape[]> {
    return this.busRouteService.getAllBusShapes();
  }

  // Trips and Route-Stop relationships - delegated to TripService
  async getTripsForRoute(routeId: string): Promise<Trip[]> {
    return this.tripService.getTripsForRoute(routeId);
  }

  async getStopsForRoute(routeId: string): Promise<BusStop[]> {
    return this.tripService.getStopsForRoute(routeId);
  }

  async getRoutesForStop(stopId: string): Promise<BusRoute[]> {
    return this.tripService.getRoutesForStop(stopId);
  }

  // Utility methods
  async getStopsBounds(): Promise<BoundingBox | null> {
    return this.postGIS.getStopsBounds();
  }

  async calculateDistance(
    lng1: number,
    lat1: number,
    lng2: number,
    lat2: number,
  ): Promise<number> {
    return this.postGIS.calculateDistance(lng1, lat1, lng2, lat2);
  }
}
