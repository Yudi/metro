// import {
//   Controller,
//   Get,
//   Post,
//   Query,
//   Logger,
//   UseGuards,
// } from '@nestjs/common';
// import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
// import {
//   TypesenseService,
//   RouteDocument,
//   StopDocument,
// } from './services/typesense.service';
// import { SearchService } from './services/search.service';
// import { DevelopmentOnlyGuard } from '../shared/guards/development-only.guard';
// import { DevOnly } from '../shared/decorators/development-only.decorator';

// @ApiTags('Search')
// @Controller('search')
// export class SearchController {
//   private readonly logger = new Logger(SearchController.name);

//   constructor(
//     private readonly typesenseService: TypesenseService,
//     private readonly searchService: SearchService,
//   ) {}

//   @Get()
//   @ApiOperation({
//     summary: 'Search routes and stops',
//     description:
//       'Search for routes and s  tops with typo tolerance (includes GPKG rail stations)',
//   })
//   @ApiQuery({ name: 'q', description: 'Search query' })
//   @ApiQuery({
//     name: 'type',
//     required: false,
//     description: 'Filter by type: route, stop, or both',
//   })
//   @ApiResponse({ status: 200, description: 'Search results' })
//   async search(
//     @Query('q') query: string,
//     @Query('type') type?: 'route' | 'stop',
//   ) {
//     try {
//       const types: ('route' | 'stop')[] = type ? [type] : ['route', 'stop'];

//       // Search in parallel: Typesense (bus routes/stops), GPKG (rail stations), and rail lines
//       const [typesenseResults, railStations, railLines] = await Promise.all([
//         // @ts-expect-error - TODO: Pre-refactor, change me
//         this.typesenseService.search(query, types),

//         types.includes('stop')
//           ? this.searchService.searchRailStations(query)
//           : Promise.resolve([]),
//         types.includes('route')
//           ? this.searchService.searchRailLines(query)
//           : Promise.resolve([]),
//       ]);

//       // Filter out GTFS rail results (already handled by GPKG)
//       const filteredResults = typesenseResults.filter((result) => {
//         if (result.type === 'busRoute') {
//           const route = result.document as RouteDocument;
//           return (
//             !route.route_id?.startsWith('METRÔ') &&
//             !route.route_id?.startsWith('CPTM')
//           );
//         } else if (result.type === 'busStop') {
//           const stop = result.document as StopDocument;
//           // Exclude GTFS rail stations (they have is_subway_station: true)
//           // GPKG rail stations will be added separately below
//           if (stop.is_subway_station === true) {
//             return false;
//           }
//           return true;
//         }
//         return true;
//       });

//       // Add GPKG rail stations to results
//       const railResults = railStations.map((station) => ({
//         type: 'stop' as const,
//         document: {
//           id: station.id,
//           stop_id: station.id,
//           stop_name: station.name,
//           stop_desc: [station.agencies, station.lines]
//             .filter(Boolean)
//             .join(' - '),
//           stop_lat: station.latitude,
//           stop_lon: station.longitude,
//           is_subway_station: true,
//           source: 'gpkg',
//         },
//       }));

//       // Add rail lines to results
//       const railLineResults = railLines.map((line) => ({
//         type: 'route' as const,
//         document: {
//           id: `rail-line-${line.code}`,
//           route_id: line.lineId,
//           route_short_name: line.lineId,
//           route_long_name: line.fullName,
//           route_color: line.colorHex.replace('#', ''),
//           route_text_color: '000000',
//           route_type: 1, // Rail/metro type
//           agency_id: line.agency,
//           source: 'rail',
//         },
//       }));

//       const allResults = [
//         ...railLineResults,
//         ...railResults,
//         ...filteredResults,
//       ];

//       return {
//         success: true,
//         query,
//         results: allResults,
//         total: allResults.length,
//       };
//     } catch (error) {
//       const errorMessage =
//         error instanceof Error ? error.message : 'Unknown error';
//       this.logger.error('Search failed:', errorMessage);
//       return {
//         success: false,
//         message: errorMessage,
//         results: [],
//         total: 0,
//       };
//     }
//   }

//   @Get('nearby')
//   @ApiOperation({
//     summary: 'Find nearby stops',
//     description:
//       'Find stops within a specified radius (includes GPKG rail stations)',
//   })
//   @ApiQuery({ name: 'lat', description: 'Latitude' })
//   @ApiQuery({ name: 'lon', description: 'Longitude' })
//   @ApiQuery({
//     name: 'radius',
//     required: false,
//     description: 'Radius in meters (default: 1000)',
//   })
//   @ApiResponse({ status: 200, description: 'Nearby stops' })
//   async findNearbyStops(
//     @Query('lat') lat: string,
//     @Query('lon') lon: string,
//     @Query('radius') radius?: string,
//   ) {
//     try {
//       const latitude = parseFloat(lat);
//       const longitude = parseFloat(lon);
//       const radiusMeters = radius ? parseInt(radius) : 1000;

//       if (isNaN(latitude) || isNaN(longitude)) {
//         return {
//           success: false,
//           message: 'Invalid coordinates',
//           stops: [],
//         };
//       }

//       const radius = radiusMeters / 1000;

//       // Search nearby in parallel: Typesense (bus stops) and GPKG (rail stations)
//       const [busStops, railStations] = await Promise.all([
//         this.typesenseService.searchNearbyStops(
//           latitude,
//           longitude,
//           radiusMeters,
//         ),
//         this.searchService.searchNearbyRailStations(
//           latitude,
//           longitude,
//           radiusMeters,
//         ),
//       ]);

//       // Filter out GTFS rail stops (they have is_subway_station: true)
//       // GPKG rail stations will be added separately below
//       const filteredBusStops = busStops.filter((stop) => {
//         return stop.is_subway_station !== true;
//       });

//       // Add GPKG rail stations
//       const railStopDocuments = railStations.map((station) => ({
//         id: station.id,
//         stop_id: station.id,
//         stop_name: station.name,
//         stop_desc: [station.agencies, station.lines]
//           .filter(Boolean)
//           .join(' - '),
//         stop_lat: station.latitude,
//         stop_lon: station.longitude,
//         is_subway_station: true,
//         source: 'gpkg',
//       }));

//       const allStops = [...filteredBusStops, ...railStopDocuments];

//       return {
//         success: true,
//         stops: allStops,
//         center: { lat: latitude, lon: longitude },
//         radius: radiusMeters,
//       };
//     } catch (error) {
//       const errorMessage =
//         error instanceof Error ? error.message : 'Unknown error';
//       this.logger.error('Nearby search failed:', errorMessage);
//       return {
//         success: false,
//         message: errorMessage,
//         stops: [],
//       };
//     }
//   }

//   @Post('debug/reindex')
//   @UseGuards(DevelopmentOnlyGuard)
//   @DevOnly()
//   @ApiOperation({
//     summary: 'Reindex all data',
//     description: 'Manually trigger reindexing of all routes and stops',
//   })
//   @ApiResponse({ status: 200, description: 'Reindexing completed' })
//   async reindexData() {
//     try {
//       await this.searchService.indexAllData();
//       return {
//         success: true,
//         message: 'Data reindexed successfully',
//       };
//     } catch (error) {
//       const errorMessage =
//         error instanceof Error ? error.message : 'Unknown error';
//       this.logger.error('Reindexing failed:', errorMessage);
//       return {
//         success: false,
//         message: errorMessage,
//       };
//     }
//   }
// }
