import {
  Resolver,
  Query,
  Args,
  ID,
  Info,
  Int,
  Parent,
  ResolveField,
} from '@nestjs/graphql';
import { GraphQLResolveInfo } from 'graphql';
import { UseGuards, ValidationPipe } from '@nestjs/common';
import { GeographyServiceOptimized } from '../services/geography-optimized.service';
import {
  BusStop,
  BusRoute,
  BusShape,
  Trip,
  BoundingBox,
  StopRoutes,
  MergedSubwayStation,
  RouteFullData,
  StopFullData,
  RouteRailConnection,
} from '../entities/geography.entity';
import {
  RailStation,
  MergedRailStation,
} from '../entities/rail-station.entity';
import { RailStationService } from '../services/rail-station.service';
import { BoundingBoxInput, StopSearchInput } from '../dto/geography.input';
import { SubwayStationProcessorService } from '../../vector-tiles/services/subway-station-processor.service';
import { RailStationProcessorService } from '../../vector-tiles/services/rail-station-processor.service';
import { DevelopmentOnlyGuard } from '../../common/guards/development-only.guard';
import {
  requestedRouteFullDataOptions,
  validateIdentifier,
  validateIdentifiers,
} from './geography-resolver.utils';

const DEFAULT_BUS_STOP_LIMIT = 50_000;
const DEFAULT_BUS_ROUTE_LIMIT = 10_000;
const DEFAULT_BUS_SHAPE_LIMIT = 500;
type StopFullDataParent = Pick<StopFullData, 'stop'>;
type RouteFullDataParent = Pick<RouteFullData, 'route'> &
  Partial<Pick<RouteFullData, 'trips' | 'shapes' | 'stops'>>;

const routeTripsLoads = new WeakMap<RouteFullDataParent, Promise<Trip[]>>();
const routeShapesLoads = new WeakMap<RouteFullDataParent, Promise<BusShape[]>>();
const routeStopsLoads = new WeakMap<RouteFullDataParent, Promise<BusStop[]>>();

@Resolver(() => BusStop)
export class GeographyResolver {
  constructor(
    private readonly geographyService: GeographyServiceOptimized,
    private readonly railStationService: RailStationService,
    private readonly subwayStationProcessor: SubwayStationProcessorService,
    private readonly railStationProcessor: RailStationProcessorService,
  ) {}

  @Query(() => String)
  @UseGuards(DevelopmentOnlyGuard)
  async testDatabase(): Promise<string> {
    try {
      const result = await this.geographyService.testDatabaseConnection();
      return `Database test: tablesExist=${result.tablesExist}, stopsCount=${
        result.stopsCount
      }, hasGeometry=${result.hasGeometry}, error=${result.error || 'none'}`;
    } catch (error) {
      return `Database test failed: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`;
    }
  }

  // Bus Stops
  @Query(() => BusStop, { nullable: true })
  async busStop(
    @Args('id', { type: () => ID }) id: string,
  ): Promise<BusStop | null> {
    return this.geographyService.getBusStop(validateIdentifier(id, 'id'));
  }

  @Query(() => [BusStop])
  async busStops(
    @Args('limit', {
      type: () => Int,
      nullable: true,
      defaultValue: DEFAULT_BUS_STOP_LIMIT,
    })
    limit: number,
  ): Promise<BusStop[]> {
    return this.geographyService.getAllBusStops(limit);
  }

  @Query(() => [BusStop])
  async busStopsInBounds(
    @Args('bounds', { type: () => BoundingBoxInput }, new ValidationPipe())
    bounds: BoundingBoxInput,
    @Args('limit', {
      type: () => Int,
      nullable: true,
      defaultValue: DEFAULT_BUS_STOP_LIMIT,
    })
    limit: number,
  ): Promise<BusStop[]> {
    return this.geographyService.getBusStopsInBounds(bounds, limit);
  }

  @Query(() => [BusStop])
  async searchBusStops(
    @Args(
      'input',
      { type: () => StopSearchInput, nullable: true },
      new ValidationPipe(),
    )
    input?: StopSearchInput,
  ): Promise<BusStop[]> {
    return this.geographyService.searchBusStops(input);
  }

  @Query(() => [BusStop])
  async multipleBusStops(
    @Args('ids', { type: () => [ID] }) ids: string[],
  ): Promise<BusStop[]> {
    return this.geographyService.getMultipleBusStops(
      validateIdentifiers(ids, 'ids'),
    );
  }

  @Query(() => [BusStop])
  async subwayStations(): Promise<BusStop[]> {
    return this.geographyService.getSubwayStations();
  }

  // Bus Routes
  @Query(() => BusRoute, { nullable: true })
  async busRoute(
    @Args('id', { type: () => ID }) id: string,
  ): Promise<BusRoute | null> {
    return this.geographyService.getBusRoute(validateIdentifier(id, 'id'));
  }

  @Query(() => [BusRoute])
  async multipleBusRoutes(
    @Args('ids', { type: () => [ID] }) ids: string[],
  ): Promise<BusRoute[]> {
    return this.geographyService.getMultipleBusRoutes(
      validateIdentifiers(ids, 'ids'),
    );
  }

  @Query(() => [BusRoute])
  async busRoutes(
    @Args('limit', {
      type: () => Int,
      nullable: true,
      defaultValue: DEFAULT_BUS_ROUTE_LIMIT,
    })
    limit: number,
  ): Promise<BusRoute[]> {
    return this.geographyService.getAllBusRoutes(limit);
  }

  @Query(() => [BusRoute])
  async subwayRoutes(): Promise<BusRoute[]> {
    return this.geographyService.getSubwayRoutes();
  }

  // Bus Shapes
  @Query(() => BusShape, { nullable: true })
  async busShape(
    @Args('shapeId', { type: () => String }) shapeId: string,
  ): Promise<BusShape | null> {
    return this.geographyService.getBusShape(
      validateIdentifier(shapeId, 'shapeId'),
    );
  }

  @Query(() => [BusShape])
  async busShapes(
    @Args('limit', {
      type: () => Int,
      nullable: true,
      defaultValue: DEFAULT_BUS_SHAPE_LIMIT,
    })
    limit: number,
  ): Promise<BusShape[]> {
    return this.geographyService.getAllBusShapes(limit);
  }

  // Trips
  @Query(() => [Trip])
  async tripsForRoute(
    @Args('routeId', { type: () => String }) routeId: string,
  ): Promise<Trip[]> {
    return this.geographyService.getTripsForRoute(
      validateIdentifier(routeId, 'routeId'),
    );
  }

  // Stops along a route
  @Query(() => [BusStop])
  async stopsForRoute(
    @Args('routeId', { type: () => String }) routeId: string,
  ): Promise<BusStop[]> {
    return this.geographyService.getStopsForRoute(
      validateIdentifier(routeId, 'routeId'),
    );
  }

  // Routes through a stop
  @Query(() => [BusRoute])
  async routesForStop(
    @Args('stopId', { type: () => String }) stopId: string,
  ): Promise<BusRoute[]> {
    return this.geographyService.getRoutesForStop(
      validateIdentifier(stopId, 'stopId'),
    );
  }

  // Batch routes for multiple stops
  @Query(() => [StopRoutes])
  async batchRoutesForStops(
    @Args('stopIds', { type: () => [String] }) stopIds: string[],
  ): Promise<StopRoutes[]> {
    const routeMap = await this.geographyService.getBatchRoutesForStops(
      validateIdentifiers(stopIds, 'stopIds'),
    );
    return Array.from(routeMap.entries()).map(([stopId, routeShortNames]) => ({
      stopId,
      routeShortNames,
    }));
  }

  // Utility queries
  @Query(() => BoundingBox, { nullable: true })
  async stopsBounds(): Promise<BoundingBox | null> {
    return this.geographyService.getStopsBounds();
  }

  // Merged Subway Stations (for vector tile interactions)
  @Query(() => [MergedSubwayStation], {
    description:
      'Get all merged subway stations (pre-processed for vector tiles)',
  })
  async mergedSubwayStations(): Promise<MergedSubwayStation[]> {
    const stations = await this.subwayStationProcessor.getAllStations();
    return stations.map((s) => ({
      id: s.stopId,
      stopId: s.stopId,
      mergedStopIds: s.mergedStopIds,
      name: s.name,
      originalName: s.originalName,
      latitude: s.latitude,
      longitude: s.longitude,
      agencies: s.agencies,
      routeShortNames: s.routeShortNames,
    }));
  }

  @Query(() => MergedSubwayStation, {
    nullable: true,
    description: 'Get a merged subway station by any of its stop IDs',
  })
  async mergedSubwayStation(
    @Args('stopId', { type: () => String }) stopId: string,
  ): Promise<MergedSubwayStation | null> {
    const station = await this.subwayStationProcessor.getStationByStopId(
      validateIdentifier(stopId, 'stopId'),
    );
    if (!station) return null;

    return {
      id: station.stopId,
      stopId: station.stopId,
      mergedStopIds: station.mergedStopIds,
      name: station.name,
      originalName: station.originalName,
      latitude: station.latitude,
      longitude: station.longitude,
      agencies: station.agencies,
      routeShortNames: station.routeShortNames,
    };
  }

  // Combined data queries for efficient loading
  @Query(() => RouteFullData, {
    nullable: true,
    description:
      'Get complete route data (route info, trips, shapes, stops) in a single request',
  })
  async routeFullData(
    @Args('routeId', { type: () => String }) routeId: string,
  ): Promise<RouteFullDataParent | null> {
    const route = await this.geographyService.getBusRoute(
      validateIdentifier(routeId, 'routeId'),
    );
    return route ? { route } : null;
  }

  @Query(() => StopFullData, {
    nullable: true,
    description:
      'Get complete stop data with all routes passing through it in a single request',
  })
  async stopFullData(
    @Args('stopId', { type: () => String }) stopId: string,
  ): Promise<StopFullDataParent | null> {
    const stop = await this.geographyService.getBusStop(
      validateIdentifier(stopId, 'stopId'),
    );
    return stop ? { stop } : null;
  }

  @Query(() => [RouteRailConnection], {
    description:
      'Find GeoSampa rail stations within 200m of future stops for bus routes serving a stop',
  })
  async routeRailConnectionsForStop(
    @Args('stopId', { type: () => String }) stopId: string,
    @Args('routeIds', { type: () => [String] }) routeIds: string[],
  ): Promise<RouteRailConnection[]> {
    return this.geographyService.getRouteRailConnectionsForStop(
      validateIdentifier(stopId, 'stopId'),
      validateIdentifiers(routeIds, 'routeIds'),
    );
  }

  // GeoSampa rail stations (from mvt_rail_stations materialized view)
  @Query(() => [RailStation], {
    description: 'Get all rail stations from GeoSampa data (Metro and CPTM)',
  })
  async railStations(): Promise<RailStation[]> {
    return this.railStationService.getAllRailStations();
  }

  @Query(() => [RailStation], {
    description: 'Get rail stations within bounding box from GeoSampa data',
  })
  async railStationsInBounds(
    @Args('bounds', { type: () => BoundingBoxInput }, new ValidationPipe())
    bounds: BoundingBoxInput,
  ): Promise<RailStation[]> {
    return this.railStationService.getRailStationsInBounds(bounds);
  }

  @Query(() => RailStation, {
    nullable: true,
    description: 'Get a single rail station by ID from GeoSampa data',
  })
  async railStation(
    @Args('id', { type: () => ID }) id: string,
  ): Promise<RailStation | null> {
    return this.railStationService.getRailStationById(id);
  }

  @Query(() => [RailStation], {
    description: 'Search rail stations by name from GeoSampa data',
  })
  async searchRailStations(
    @Args('searchTerm', { type: () => String }) searchTerm: string,
    @Args('limit', { type: () => Int, nullable: true, defaultValue: 20 })
    limit?: number,
  ): Promise<RailStation[]> {
    return this.railStationService.searchRailStations(searchTerm, limit);
  }

  // Merged rail stations (GeoSampa data - for merged Metro + CPTM stations)
  @Query(() => [MergedRailStation], {
    description:
      'Get all merged rail stations (pre-processed for deduplication)',
  })
  async mergedRailStations(): Promise<MergedRailStation[]> {
    const stations = await this.railStationProcessor.getAllStations();
    return stations.map((s) => ({
      id: s.primaryId.toString(),
      primaryId: s.primaryId,
      mergedIds: s.mergedIds,
      name: s.name,
      originalName: s.originalName,
      latitude: s.latitude,
      longitude: s.longitude,
      agencies: s.agencies,
      lines: s.lines,
    }));
  }

  @Query(() => MergedRailStation, {
    nullable: true,
    description: 'Get a merged rail station by any of its IDs',
  })
  async mergedRailStation(
    @Args('id', { type: () => Int }) id: number,
  ): Promise<MergedRailStation | null> {
    const station = await this.railStationProcessor.getStationById(id);
    if (!station) return null;

    return {
      id: station.primaryId.toString(),
      primaryId: station.primaryId,
      mergedIds: station.mergedIds,
      name: station.name,
      originalName: station.originalName,
      latitude: station.latitude,
      longitude: station.longitude,
      agencies: station.agencies,
      lines: station.lines,
    };
  }
}

@Resolver(() => StopFullData)
export class StopFullDataResolver {
  constructor(private readonly geographyService: GeographyServiceOptimized) {}

  @ResolveField(() => [RouteFullData])
  async routes(
    @Parent() parent: StopFullDataParent,
    @Info() info: GraphQLResolveInfo,
  ): Promise<RouteFullData[]> {
    return this.geographyService.getStopRoutesFullData(
      parent.stop.stopId,
      requestedRouteFullDataOptions(info),
    );
  }
}

@Resolver(() => RouteFullData)
export class RouteFullDataResolver {
  constructor(private readonly geographyService: GeographyServiceOptimized) {}

  @ResolveField(() => [Trip])
  async trips(@Parent() parent: RouteFullDataParent): Promise<Trip[]> {
    if (Array.isArray(parent.trips)) return parent.trips;
    return this.loadCollection(
      routeTripsLoads,
      parent,
      () => this.geographyService.getTripsForRoute(parent.route.routeId),
    );
  }

  @ResolveField(() => [BusShape])
  async shapes(@Parent() parent: RouteFullDataParent): Promise<BusShape[]> {
    if (Array.isArray(parent.shapes)) return parent.shapes;
    return this.loadCollection(
      routeShapesLoads,
      parent,
      () => this.geographyService.getRouteShapesForRoute(parent.route.routeId),
    );
  }

  @ResolveField(() => [BusStop])
  async stops(@Parent() parent: RouteFullDataParent): Promise<BusStop[]> {
    if (Array.isArray(parent.stops)) return parent.stops;
    return this.loadCollection(
      routeStopsLoads,
      parent,
      () => this.geographyService.getStopsForRoute(parent.route.routeId),
    );
  }

  private loadCollection<T>(
    loads: WeakMap<RouteFullDataParent, Promise<T>>,
    parent: RouteFullDataParent,
    loader: () => Promise<T>,
  ): Promise<T> {
    let load = loads.get(parent);
    if (!load) {
      load = loader();
      loads.set(parent, load);
    }

    return load;
  }
}
