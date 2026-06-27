import {
  Resolver,
  Query,
  Args,
  Mutation,
  ResolveField,
  Parent,
} from '@nestjs/graphql';
import { Logger, UseGuards } from '@nestjs/common';
import {
  TypesenseService,
  RouteDocument,
  StopDocument,
  LineDocument,
  StationDocument,
  BikeStationDocument,
} from '../services/typesense.service';
import { SearchService } from '../services/search.service';
import {
  SearchResult as SearchResultItem,
  SearchBusRoute as SearchBusRoute,
  SearchBusStop as SearchBusStop,
  SearchResultUnion,
} from '../entities/search.entity';
import { SearchFiltersInput } from '../dto/search.input';
import { DevelopmentOnlyGuard } from '../../shared/guards/development-only.guard';
import { DevOnly } from '../../shared/decorators/development-only.decorator';
import { GraphQLLoaders } from '../../shared/graphql/loaders.service';
import { Loaders } from '../../shared/graphql/loaders.decorator';
import {
  RAIL_LINES,
  getRailLineByCode,
  hardNormalizeString,
} from '@metro/shared/utils';

@Resolver(() => SearchResultItem)
export class SearchResolver {
  private readonly logger = new Logger(SearchResolver.name);

  constructor(
    private readonly typesenseService: TypesenseService,
    private readonly searchService: SearchService,
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

      // Search in parallel: Typesense (bus routes/stops), GeoSampa rail stations, and rail lines
      const typesenseResults = await (types.length > 0
        ? this.typesenseService.search(input.query, types, input.limit ?? 10)
        : Promise.resolve([]));

      const sortedByScore = typesenseResults.sort(
        (a, b) =>
          this.getAdjustedScore(b, input.query) -
          this.getAdjustedScore(a, input.query),
      );

      return sortedByScore.map((hit) => ({
        ...this.formatSearchDocument(hit.document, hit.type),
        score: hit.score,
        type: hit.type,
        highlights: this.formatHighlights(hit.highlights || {}),
      }));
    } catch (error) {
      this.logger.error('Search failed:', error);
      throw new Error('Search failed');
    }
  }

  @ResolveField(() => [SearchBusRoute])
  async routes(
    @Parent() stop: SearchBusStop,
    @Loaders() loaders: GraphQLLoaders,
  ): Promise<SearchBusRoute[]> {
    const stopId = stop.stop_id;

    if (!stopId) {
      return [];
    }

    return loaders.routesLoader.load(stop.stop_id);
  }

  @Mutation(() => Boolean)
  @UseGuards(DevelopmentOnlyGuard)
  @DevOnly()
  async reindexSearch(): Promise<boolean> {
    try {
      await this.searchService.indexAllData();
      return true;
    } catch (error) {
      this.logger.error('Reindexing failed:', error);
      throw new Error('Reindexing failed');
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
      this.logger.error('Clearing index failed:', error);
      throw new Error('Clearing index failed');
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
    type:
      | 'busStop'
      | 'busRoute'
      | 'railStation'
      | 'railLine'
      | 'bikeStation',
  ) {
    if (type === 'busRoute') {
      const route = document as RouteDocument;
      return {
        ...route,
        id: route.route_id,
      };
    }

    if (type === 'busStop') {
      const stop = document as StopDocument;
      return {
        ...stop,
        id: stop.stop_id,
      };
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

  private getAdjustedScore(
    hit: Awaited<ReturnType<TypesenseService['search']>>[number],
    query: string,
  ): number {
    const baseScore = hit.score ?? 0;
    const normalizedQuery = hardNormalizeString(query);

    if (hit.type === 'railLine') {
      const line = hit.document as LineDocument;
      const normalizedLineCode = hardNormalizeString(line.line_code);
      const normalizedLineId = hardNormalizeString(
        this.formatRailLineCode(line.line_code),
      );
      const normalizedFullName = hardNormalizeString(line.line_fullname);
      const lineInfo = getRailLineByCode(Number(line.line_code));
      const normalizedColorName = lineInfo
        ? hardNormalizeString(lineInfo.colorName)
        : '';

      if (
        normalizedQuery === normalizedLineCode ||
        normalizedQuery === normalizedLineId ||
        normalizedFullName === normalizedQuery ||
        normalizedColorName === normalizedQuery
      ) {
        return baseScore + 1_000_000;
      }

      if (
        normalizedFullName.includes(normalizedQuery) ||
        normalizedQuery.includes(normalizedLineId)
      ) {
        return baseScore + 50_000;
      }

      return baseScore + 10_000;
    }

    if (hit.type === 'railStation') {
      return baseScore + 1_000;
    }

    return baseScore;
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
