import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { OlhoVivoApiService } from './olhovivo-api.service';

/**
 * Maps between our GTFS data and SPTrans OlhoVivo API codes
 * The API uses different identifiers than GTFS
 */
@Injectable()
export class RouteStopMappingService {
  private readonly logger = new Logger(RouteStopMappingService.name);

  // Cache for route short name -> SPTrans API line codes mapping (array for both directions)
  private routeCodeCache = new Map<string, number[] | null>();

  // Cache for stop_id -> SPTrans API stop code mapping
  private stopCodeCache = new Map<string, number | null>();
  private routeValidationCache = new Map<string, boolean>();
  private stopValidationCache = new Map<string, boolean>();

  constructor(
    private prisma: PrismaService,
    private olhoVivoApi: OlhoVivoApiService
  ) {}

  /**
   * Get SPTrans API line codes from route short name
   * Uses the SPTrans API to search for the line and returns ALL line codes (both directions)
   *
   * @param routeShortName - Route short name (e.g., "8000-10", "477A-10")
   * @returns Array of SPTrans API line codes (one per direction) or null if route doesn't support real-time
   */
  async getApiLineCodes(routeShortName: string): Promise<number[] | null> {
    // Check cache first
    if (this.routeCodeCache.has(routeShortName)) {
      return this.routeCodeCache.get(routeShortName) ?? null;
    }

    try {
      // Check if this is a subway/metro route - they don't use OlhoVivo
      if (
        routeShortName.startsWith('METRÔ') ||
        routeShortName.startsWith('CPTM')
      ) {
        this.routeCodeCache.set(routeShortName, null);
        return null;
      }

      // Extract the line number from route_short_name
      // Format is typically "8000-10" or "477A-10" where we want "8000" or "477A"
      const lineNumber = routeShortName.split('-')[0];

      this.logger.debug(
        `Searching SPTrans API for line: ${lineNumber} (from route ${routeShortName})`
      );

      // Search the SPTrans API for this line
      const searchResults = await this.olhoVivoApi.searchLines(lineNumber);

      if (!searchResults || searchResults.length === 0) {
        this.logger.warn(
          `No results found for line ${lineNumber} (route ${routeShortName})`
        );
        this.routeCodeCache.set(routeShortName, null);
        return null;
      }

      // Extract all line codes (cl field) - this includes both directions
      const lineCodes = searchResults.map((result) => result.cl);

      this.logger.debug(
        `Found ${
          lineCodes.length
        } line codes for ${lineNumber}: ${lineCodes.join(', ')}`
      );

      // Log direction details
      searchResults.forEach((result) => {
        const direction =
          result.sl === 1
            ? 'Dir 1 (Principal→Secundário)'
            : 'Dir 2 (Secundário→Principal)';
        this.logger.debug(
          `   cl=${result.cl} - ${direction} - ${result.tp} → ${result.ts}`
        );
      });

      this.routeCodeCache.set(routeShortName, lineCodes);
      return lineCodes;
    } catch (error) {
      this.logger.error(
        `Error getting API codes for route ${routeShortName}:`,
        error
      );
      this.routeCodeCache.set(routeShortName, null);
      return null;
    }
  }

  async isKnownRealtimeRoute(routeShortName: string): Promise<boolean> {
    if (!this.isSafeRouteShortName(routeShortName)) {
      return false;
    }

    if (this.routeValidationCache.has(routeShortName)) {
      return this.routeValidationCache.get(routeShortName) ?? false;
    }

    try {
      const routes = await this.prisma.$queryRaw<Array<{ route_id: string }>>`
        SELECT route_id
        FROM "SPTrans_Route"
        WHERE route_short_name = ${routeShortName}
        AND route_id NOT LIKE 'METRÔ%'
        AND route_id NOT LIKE 'CPTM%'
        LIMIT 1
      `;
      const isKnown = routes.length > 0;
      this.routeValidationCache.set(routeShortName, isKnown);
      return isKnown;
    } catch (error) {
      this.logger.error(
        `Error validating realtime route ${routeShortName}:`,
        error,
      );
      return false;
    }
  }

  /**
   * Get SPTrans API stop code from GTFS stop_id
   * Similar to routes, stop codes in the API may differ from GTFS
   *
   * @param stopId - GTFS stop_id
   * @returns SPTrans API stop code or null if not found
   */
  async getApiStopCode(stopId: string): Promise<number | null> {
    // Check cache first
    if (this.stopCodeCache.has(stopId)) {
      return this.stopCodeCache.get(stopId) ?? null;
    }

    try {
      // Check if this is a subway station - they don't use OlhoVivo
      const stops = await this.prisma.$queryRaw<Array<{ stop_id: string }>>`
        SELECT stop_id
        FROM "SPTrans_Stop"
        WHERE stop_id = ${stopId}
        LIMIT 1
      `;
      const stop = stops[0];

      if (!stop) {
        this.logger.warn(`Stop ${stopId} not found in database`);
        this.stopCodeCache.set(stopId, null);
        return null;
      }

      // Check if this stop is served by subway routes only
      const routes = await this.prisma.$queryRaw<Array<{ route_id: string }>>`
        SELECT DISTINCT r.route_id
        FROM "SPTrans_Route" r
        INNER JOIN "SPTrans_Trip" t ON t.route_id = r.route_id
        INNER JOIN "SPTrans_StopTime" st ON st.trip_id = t.trip_id
        WHERE st.stop_id = ${stopId}
        LIMIT 5
      `;

      const isSubwayOnly = routes.every(
        (r) => r.route_id.startsWith('METRÔ') || r.route_id.startsWith('CPTM')
      );

      if (isSubwayOnly) {
        this.stopCodeCache.set(stopId, null);
        return null;
      }

      // Try to parse the stop_id as a number (many SPTrans stops use numeric IDs)
      let apiStopCode: number;

      // If stop_id is already numeric, use it
      const numericStopId = parseInt(stopId, 10);
      if (!isNaN(numericStopId)) {
        apiStopCode = numericStopId;
      } else {
        // Try extracting numbers from stop_id (e.g., "STOP_123" -> 123)
        const numericPart = stopId.match(/\d+/);
        if (numericPart) {
          apiStopCode = parseInt(numericPart[0], 10);
        } else {
          this.logger.warn(
            `Cannot map non-numeric stop ID ${stopId} to API code`
          );
          this.stopCodeCache.set(stopId, null);
          return null;
        }
      }

      this.logger.debug(`Mapped stop ${stopId} to API code ${apiStopCode}`);
      this.stopCodeCache.set(stopId, apiStopCode);
      return apiStopCode;
    } catch (error) {
      this.logger.error(`Error getting API code for stop ${stopId}:`, error);
      return null;
    }
  }

  async isKnownRealtimeStop(stopId: string): Promise<boolean> {
    if (!this.isSafeStopCode(stopId)) {
      return false;
    }

    if (this.stopValidationCache.has(stopId)) {
      return this.stopValidationCache.get(stopId) ?? false;
    }

    const apiStopCode = await this.getApiStopCode(stopId);
    const isKnown = apiStopCode !== null;
    this.stopValidationCache.set(stopId, isKnown);
    return isKnown;
  }

  /**
   * Clear caches (useful for testing or if mapping changes)
   */
  clearCaches(): void {
    this.routeCodeCache.clear();
    this.stopCodeCache.clear();
    this.routeValidationCache.clear();
    this.stopValidationCache.clear();
  }

  private isSafeRouteShortName(routeShortName: string): boolean {
    return /^[A-Za-z0-9-]{1,32}$/.test(routeShortName);
  }

  private isSafeStopCode(stopCode: string): boolean {
    return /^[A-Za-z0-9_-]{1,64}$/.test(stopCode);
  }
}
