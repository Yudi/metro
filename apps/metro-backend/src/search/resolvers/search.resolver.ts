import {
  formatBusRouteDocument,
  formatBusStopDocument,
} from '../services/bus-search-document';
import {
  Resolver,
  Query,
  Args,
  Mutation,
  ResolveField,
  Parent,
  Info,
} from '@nestjs/graphql';
import {
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import {
  formatTypesenseError,
  TypesenseService,
  RouteDocument,
  StopDocument,
  LineDocument,
  StationDocument,
  BikeStationDocument,
} from '../services/typesense.service';
import { SearchService } from '../services/search.service';
import { BusTerminalService } from '../../bus-terminals/bus-terminal.service';
import {
  aggregateTerminalSearchHits,
  TerminalAwareSearchHit,
} from '../services/terminal-search.utils';
import {
  SearchResult as SearchResultItem,
  SearchBusRoute as SearchBusRoute,
  SearchBusStop as SearchBusStop,
  SearchResultUnion,
} from '../entities/search.entity';
import { SearchFiltersInput } from '../dto/search.input';
import { BusDirectionService } from '../../geography/services/bus-direction.service';
import { DevelopmentOnlyGuard } from '../../common/guards/development-only.guard';
import { DevOnly } from '../../common/decorators/development-only.decorator';
import type { GraphQLLoaders } from '../../common/graphql/loaders.service';
import { Loaders } from '../../common/graphql/loaders.decorator';
import type { GraphQLResolveInfo } from 'graphql';
import { requestsAnyField } from '../../geography/resolvers/geography-resolver.utils';
import {
  RAIL_LINES,
  getRailLineByCode,
  hardNormalizeString,
} from '@metro/shared/utils';

const NORMALIZED_RAIL_LINE_METADATA = new Set(
  RAIL_LINES.flatMap((line) => [
    String(line.code),
    line.lineId,
    line.colorName,
    line.fullName,
  ]).map(hardNormalizeString),
);

@Resolver(() => SearchResultItem)
export class SearchResolver {
  private readonly logger = new Logger(SearchResolver.name);

  constructor(
    private readonly typesenseService: TypesenseService,
    private readonly searchService: SearchService,
    private readonly directions: BusDirectionService,
    private readonly terminals?: BusTerminalService,
  ) {}

  @Query(() => [SearchResultUnion])
  async search(
    @Args('input') input: SearchFiltersInput,
  ): Promise<SearchResultItem[]> {
    try {
      const includeBusRoutes = input.includeBusRoutes ?? true;
      const includeBusStops = input.includeBusStops ?? true;
      const includeRailLines = input.includeRailLines ?? true;
      const includeRailStations = input.includeRailStations ?? true;
      const includeBikeStations = input.includeBikeStations ?? true;

      const types: (
        | 'busStop'
        | 'busRoute'
        | 'railStation'
        | 'railLine'
        | 'bikeStation'
      )[] = [];

      if (includeBusRoutes) {
        types.push('busRoute');
      }
      if (includeBusStops) {
        types.push('busStop');
      }

      if (includeRailLines) {
        types.push('railLine');
      }

      if (includeRailStations) {
        types.push('railStation');
      }
      if (includeBikeStations) {
        types.push('bikeStation');
      }

      // Typesense provides the base results; directions are optional enrichment.
      const typesenseResults = await (types.length > 0
        ? this.typesenseService.search(
          input.query, types, includeBusStops && input.includeBusTerminals ? 100 : input.limit ?? 10,
        )
        : Promise.resolve([]));

      let terminalAwareResults: TerminalAwareSearchHit[] = typesenseResults;
      if (includeBusStops && input.includeBusTerminals && this.terminals) {
        try {
          terminalAwareResults = aggregateTerminalSearchHits(
            typesenseResults, await this.terminals.getCatalog(), input.query,
          );
        } catch {
          // Without current verified membership, retain the original stops.
          this.logger.warn('Terminal catalog unavailable; returning individual stops');
        }
      }
      const sortedByRelevance = [...terminalAwareResults].sort((a, b) =>
        this.compareSearchResults(a, b, input.query),
      );

      const hits = sortedByRelevance.slice(0, input.limit ?? 10);
      const directions = await this.getSearchDirections(
        hits.flatMap((hit) => hit.type === 'busRoute' ? [(hit.document as RouteDocument).route_id] : []),
      );
      return hits.flatMap<SearchResultItem>((hit) => {
        if (hit.type === 'busTerminal') {
          return [{ ...hit.document, type: 'busTerminal', score: hit.score, highlights: [] }];
        }
        const base = {
          ...this.formatSearchDocument(hit.document, hit.type),
          score: hit.score,
          type: hit.type,
          highlights: this.formatHighlights(hit.highlights || {}),
        };
        if (hit.type !== 'busRoute') return [base];
        const routeId = (hit.document as RouteDocument).route_id;
        const matches = directions.filter((direction) => direction.routeId === routeId);
        // Missing direction data stays explicitly unavailable rather than inventing terminals.
        return matches.length ? matches.map((direction) => ({
          ...base,
          id: direction.favoriteCode,
          favoriteCode: direction.favoriteCode,
          destination: direction.destination,
          isCircular: direction.isCircular,
          directionId: direction.directionId,
        })) : [base];
      });
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        throw error;
      }

      throw new InternalServerErrorException('Search failed');
    }
  }

  @ResolveField(() => [SearchBusRoute])
  async routes(
    @Parent() stop: SearchBusStop,
    @Loaders() loaders: GraphQLLoaders,
    @Info() info?: GraphQLResolveInfo,
  ): Promise<SearchBusRoute[]> {
    const stopId = stop.stop_id;

    if (!stopId) {
      return [];
    }

    const routes = await loaders.routesLoader.load(stop.stop_id);
    if (info && !requestsAnyField(info, ['favoriteCode', 'destination', 'isCircular', 'directionId'])) {
      return routes;
    }
    const directions = await this.getSearchDirections(routes.map((route) => route.route_id), stopId);
    return routes.flatMap((route) => {
      const matches = directions.filter((direction) => direction.routeId === route.route_id);
      return matches.length ? matches.map((direction) => ({
        ...route,
        id: direction.favoriteCode,
        favoriteCode: direction.favoriteCode,
        destination: direction.destination,
        isCircular: direction.isCircular,
        directionId: direction.directionId,
      })) : [route];
    });
  }

  private async getSearchDirections(routeIds: string[], stopId?: string) {
    if (routeIds.length === 0) return [];

    try {
      return await this.directions.forRoutes([...new Set(routeIds)], stopId);
    } catch {
      this.logger.warn('Bus directions unavailable; returning base search routes');
      return [];
    }
  }

  @Mutation(() => Boolean)
  @UseGuards(DevelopmentOnlyGuard)
  @DevOnly()
  async reindexSearch(): Promise<boolean> {
    try {
      await this.searchService.indexAllData();
      return true;
    } catch (error) {
      this.logger.error(`Reindexing failed: ${formatTypesenseError(error)}`);
      if (error instanceof ServiceUnavailableException) {
        throw error;
      }

      throw new InternalServerErrorException('Reindexing failed');
    }
  }

  @Mutation(() => Boolean)
  @UseGuards(DevelopmentOnlyGuard)
  @DevOnly()
  async clearSearchIndex(): Promise<boolean> {
    try {
      await this.searchService.clearIndex();
      return true;
    } catch (error) {
      this.logger.error(
        `Clearing index failed: ${formatTypesenseError(error)}`,
      );
      if (error instanceof ServiceUnavailableException) {
        throw error;
      }

      throw new InternalServerErrorException('Clearing index failed');
    }
  }

  private formatHighlights(highlights: Record<string, unknown>) {
    if (Array.isArray(highlights)) {
      return highlights.map((value, index) => ({
        field: this.getHighlightField(value, index.toString()),
        snippet: this.getHighlightSnippet(value),
      }));
    }

    return Object.entries(highlights).map(([field, value]) => ({
      field,
      snippet: this.getHighlightSnippet(value),
    }));
  }

  private getHighlightField(value: unknown, fallback: string): string {
    if (!value || typeof value !== 'object') {
      return fallback;
    }

    const field = (value as Record<string, unknown>).field;
    return field !== undefined ? String(field) : fallback;
  }

  private getHighlightSnippet(value: unknown): string {
    if (Array.isArray(value)) {
      return value.length > 0 ? this.getHighlightSnippet(value[0]) : '';
    }

    if (value && typeof value === 'object') {
      const highlight = value as Record<string, unknown>;

      if (highlight.snippet !== undefined) {
        return String(highlight.snippet);
      }

      if (highlight.value !== undefined) {
        return String(highlight.value);
      }
    }

    return value === undefined || value === null ? '' : String(value);
  }

  private formatSearchDocument(
    document:
      | RouteDocument
      | StopDocument
      | LineDocument
      | StationDocument
      | BikeStationDocument,
    type: 'busStop' | 'busRoute' | 'railStation' | 'railLine' | 'bikeStation',
  ) {
    if (type === 'busRoute') {
      const route = document as RouteDocument;
      return formatBusRouteDocument(route);
    }

    if (type === 'busStop') {
      const stop = document as StopDocument;
      return formatBusStopDocument(stop);
    }

    if (type === 'railLine') {
      const railLine = document as LineDocument;
      return {
        ...railLine,
        id: railLine.line_code,
      };
    }

    if (type === 'bikeStation') {
      const bikeStation = document as BikeStationDocument;
      return {
        ...bikeStation,
        id: bikeStation.station_id,
        latitude: bikeStation.location[0],
        longitude: bikeStation.location[1],
      };
    }

    if (type === 'railStation') {
      const railStation = document as StationDocument;
      const stationAliases = this.getRailStationAliases(railStation);

      if (!railStation.location) {
        return {
          ...railStation,
          id: railStation.station_code,
          station_aliases: stationAliases,
        };
      }

      return {
        ...railStation,
        id: railStation.station_code,
        station_aliases: stationAliases,
        latitude: railStation.location[0],
        longitude: railStation.location[1],
      };
    }

    return document;
  }

  private compareSearchResults(
    hit: TerminalAwareSearchHit,
    other: TerminalAwareSearchHit,
    query: string,
  ): number {
    const normalizedQuery = hardNormalizeString(query);
    const exactMatchOrder =
      Number(this.isExactIdentity(other, normalizedQuery)) -
      Number(this.isExactIdentity(hit, normalizedQuery));
    if (exactMatchOrder !== 0) {
      return exactMatchOrder;
    }

    // A terminal overview is the primary result for a broad terminal name search.
    const terminalOrder = Number(other.type === 'busTerminal') - Number(hit.type === 'busTerminal');
    if (terminalOrder !== 0) return terminalOrder;

    const scoreOrder = (other.score ?? 0) - (hit.score ?? 0);
    if (scoreOrder !== 0) {
      return scoreOrder;
    }

    const identityOrder = this.compareStableValues(
      this.getSearchResultIdentity(hit),
      this.getSearchResultIdentity(other),
    );
    return identityOrder;
  }

  private isExactIdentity(
    hit: TerminalAwareSearchHit,
    normalizedQuery: string,
  ): boolean {
    if (!normalizedQuery) {
      return false;
    }

    let candidates: string[] = [];
    switch (hit.type) {
      case 'busTerminal':
        candidates = [hit.document.name, ...hit.document.aliases];
        break;
      case 'busRoute': {
        const route = hit.document as RouteDocument;
        candidates = [
          route.route_id,
          route.sourceId ?? '',
          route.route_short_name,
          route.route_long_name,
        ];
        break;
      }
      case 'busStop': {
        const stop = hit.document as StopDocument;
        candidates = [stop.stop_id, stop.sourceId ?? '', stop.stop_name];
        break;
      }
      case 'railLine': {
        const line = hit.document as LineDocument;
        candidates = [
          line.line_code,
          this.formatRailLineCode(line.line_code),
          line.line_fullname,
          getRailLineByCode(Number(line.line_code))?.colorName ?? '',
        ];
        break;
      }
      case 'railStation': {
        const station = hit.document as StationDocument;
        candidates = [
          station.station_code,
          station.station_name,
          ...(station.station_aliases ?? []).filter(
            (alias) =>
              !NORMALIZED_RAIL_LINE_METADATA.has(hardNormalizeString(alias)),
          ),
        ];
        break;
      }
      case 'bikeStation': {
        const station = hit.document as BikeStationDocument;
        candidates = [station.station_id, station.station_name];
        break;
      }
    }

    return candidates.some(
      (candidate) => hardNormalizeString(candidate) === normalizedQuery,
    );
  }

  private getSearchResultIdentity(
    hit: TerminalAwareSearchHit,
  ): string {
    let id = hit.document.id;
    switch (hit.type) {
      case 'busRoute':
        id = (hit.document as RouteDocument).route_id;
        break;
      case 'busStop':
        id = (hit.document as StopDocument).stop_id;
        break;
      case 'railLine':
        id = (hit.document as LineDocument).line_code;
        break;
      case 'railStation':
        id = (hit.document as StationDocument).station_code;
        break;
      case 'bikeStation':
        id = (hit.document as BikeStationDocument).station_id;
        break;
    }

    return `${hit.type}:${id}`;
  }

  private compareStableValues(left: string, right: string): number {
    return left < right ? -1 : left > right ? 1 : 0;
  }

  private formatRailLineCode(lineCode: string): string {
    const match = lineCode.match(/\d+/);
    return match ? `L${parseInt(match[0], 10)}` : lineCode;
  }

  private getRailStationAliases(railStation: StationDocument): string[] {
    const aliases = new Set(railStation.station_aliases ?? []);
    const normalizedNames = [
      railStation.station_name,
      ...(railStation.station_aliases ?? []),
    ].map(hardNormalizeString);

    for (const line of RAIL_LINES) {
      const hasStation = line.stations.some((station) => {
        const stationNames = [
          station.name,
          ...(station.alternativeNames ?? []),
        ].map(hardNormalizeString);

        return stationNames.some((stationName) =>
          normalizedNames.includes(stationName),
        );
      });

      if (hasStation) {
        aliases.add(line.colorName);
        aliases.add(line.lineId);
        aliases.add(line.fullName);
      }
    }

    return Array.from(aliases);
  }
}
