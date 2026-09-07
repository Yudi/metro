import { Logger } from '@nestjs/common';
import { Client } from 'typesense';
import {
  BIKE_STATIONS_COLLECTION_NAME,
  BIKE_STATIONS_SCHEMA,
  GPKG_LINES_COLLECTION_NAME,
  GPKG_LINES_SCHEMA,
  GPKG_STATIONS_COLLECTION_NAME,
  GPKG_STATIONS_SCHEMA,
  GTFS_ROUTES_COLLECTION_NAME,
  GTFS_ROUTES_SCHEMA,
  GTFS_STOPS_COLLECTION_NAME,
  GTFS_STOPS_SCHEMA,
} from './typesense-schemas';
import { formatTypesenseError } from './typesense-error.utils';
import {
  BikeStationDocument,
  LineDocument,
  RouteDocument,
  StationDocument,
  StopDocument,
} from './typesense.types';

export interface TypesenseIndexingContext {
  getClient: () => Client;
  getWriteCollectionName: (baseName: string) => string;
  isRebuilding: (baseName: string) => boolean;
  importDocuments: (
    baseName: string,
    documents: Array<Record<string, unknown>>,
  ) => Promise<void>;
  recreateCollection: (name: string, schema: unknown) => Promise<void>;
  logger: Logger;
}

/**
 * Owns document projection and collection replacement operations. The parent
 * TypesenseService remains responsible for client availability and rebuild
 * state, while this facade groups the write-side index categories together.
 */
export class TypesenseIndexingFacade {
  constructor(private readonly context: TypesenseIndexingContext) {}

  async clearRoutes(): Promise<void> {
    await this.context.recreateCollection(
      GTFS_ROUTES_COLLECTION_NAME,
      GTFS_ROUTES_SCHEMA,
    );
    this.context.logger.debug('Recreated routes collection');
  }

  async indexRoutes(routes: RouteDocument[]): Promise<void> {
    try {
      if (
        routes.length === 0 &&
        !this.context.isRebuilding(GTFS_ROUTES_COLLECTION_NAME)
      ) {
        this.context.logger.debug(
          'Skipping route indexing: no routes provided',
        );
        return;
      }

      await this.context.importDocuments(
        GTFS_ROUTES_COLLECTION_NAME,
        routes.map((route) => ({
          id: route.id,
          route_id: route.route_id,
          agency_id: route.agency_id,
          sourceAgency: route.sourceAgency,
          sourceId: route.sourceId,
          supportsRealtime: route.supportsRealtime,
          faresJson: route.faresJson,
          route_short_name: route.route_short_name,
          route_long_name: route.route_long_name,
          route_type: route.route_type,
          route_color: route.route_color,
          route_text_color: route.route_text_color,
        })),
      );
      this.context.logger.debug(`Indexed ${routes.length} routes`);
    } catch (error) {
      this.context.logger.error(
        `Failed to index routes: ${formatTypesenseError(error)}`,
      );
      throw error;
    }
  }

  async clearStops(): Promise<void> {
    await this.context.recreateCollection(
      GTFS_STOPS_COLLECTION_NAME,
      GTFS_STOPS_SCHEMA,
    );
    this.context.logger.debug('Recreated stops collection');
  }

  async indexStops(stops: StopDocument[]): Promise<void> {
    try {
      if (
        stops.length === 0 &&
        !this.context.isRebuilding(GTFS_STOPS_COLLECTION_NAME)
      ) {
        this.context.logger.debug('Skipping stop indexing: no stops provided');
        return;
      }

      await this.context.importDocuments(
        GTFS_STOPS_COLLECTION_NAME,
        stops.map((stop) => ({
          id: stop.id,
          stop_id: stop.stop_id,
          stop_name: stop.stop_name,
          stop_desc: stop.stop_desc || '',
          stop_lat: stop.stop_lat,
          stop_lon: stop.stop_lon,
          location: [stop.stop_lat, stop.stop_lon],
          is_subway_station: stop.is_subway_station,
          sourceAgency: stop.sourceAgency,
          sourceId: stop.sourceId,
          platformCode: stop.platformCode,
          mergedStopIds: stop.mergedStopIds,
          agencies: stop.agencies,
        })),
      );
      this.context.logger.debug(`Indexed ${stops.length} stops`);
    } catch (error) {
      this.context.logger.error(
        `Failed to index stops: ${formatTypesenseError(error)}`,
      );
      throw error;
    }
  }

  async deleteRoute(routeId: string): Promise<void> {
    try {
      await this.context
        .getClient()
        .collections(
          this.context.getWriteCollectionName(GTFS_ROUTES_COLLECTION_NAME),
        )
        .documents(routeId)
        .delete();
    } catch (error) {
      this.context.logger.error(
        `Failed to delete route ${routeId}: ${formatTypesenseError(error)}`,
      );
    }
  }

  async deleteStop(stopId: string): Promise<void> {
    try {
      await this.context
        .getClient()
        .collections(
          this.context.getWriteCollectionName(GTFS_STOPS_COLLECTION_NAME),
        )
        .documents(stopId)
        .delete();
    } catch (error) {
      this.context.logger.error(
        `Failed to delete stop ${stopId}: ${formatTypesenseError(error)}`,
      );
    }
  }

  async indexBikeStations(stations: BikeStationDocument[]): Promise<void> {
    try {
      if (
        stations.length === 0 &&
        !this.context.isRebuilding(BIKE_STATIONS_COLLECTION_NAME)
      ) {
        this.context.logger.debug(
          'Skipping bike station indexing: no stations provided',
        );
        return;
      }

      await this.context.importDocuments(
        BIKE_STATIONS_COLLECTION_NAME,
        stations.map((station) => ({
          id: station.id,
          station_id: station.station_id,
          station_name: station.station_name,
          location: station.location,
        })),
      );
      this.context.logger.debug(`Indexed ${stations.length} bike stations`);
    } catch (error) {
      this.context.logger.error(
        `Failed to index bike stations: ${formatTypesenseError(error)}`,
      );
      throw error;
    }
  }

  async indexRailLines(lines: LineDocument[]): Promise<void> {
    try {
      if (
        lines.length === 0 &&
        !this.context.isRebuilding(GPKG_LINES_COLLECTION_NAME)
      ) {
        this.context.logger.debug(
          'Skipping rail line indexing: no lines provided',
        );
        return;
      }

      await this.context.importDocuments(
        GPKG_LINES_COLLECTION_NAME,
        lines.map((line) => ({
          id: line.id,
          line_code: line.line_code,
          line_fullname: line.line_fullname,
          agency: line.agency,
        })),
      );
      this.context.logger.debug(`Indexed ${lines.length} rail lines`);
    } catch (error) {
      this.context.logger.error(
        `Failed to index rail lines: ${formatTypesenseError(error)}`,
      );
      throw error;
    }
  }

  async indexRailStations(stations: StationDocument[]): Promise<void> {
    try {
      if (
        stations.length === 0 &&
        !this.context.isRebuilding(GPKG_STATIONS_COLLECTION_NAME)
      ) {
        this.context.logger.debug(
          'Skipping rail station indexing: no stations provided',
        );
        return;
      }

      const documents = stations.map((station) => {
        const document: Record<string, unknown> = {
          id: station.station_code,
          station_code: station.station_code,
          station_name: station.station_name,
          station_aliases: station.station_aliases || [],
        };

        if (station.location) {
          document.location = station.location;
        }

        return document;
      });

      await this.context.importDocuments(
        GPKG_STATIONS_COLLECTION_NAME,
        documents,
      );
      this.context.logger.debug(`Indexed ${stations.length} rail stations`);
    } catch (error) {
      this.context.logger.error(
        `Failed to index rail stations: ${formatTypesenseError(error)}`,
      );
      throw error;
    }
  }

  async clearIndex(): Promise<void> {
    await Promise.all([
      this.clearRoutes(),
      this.clearStops(),
      this.clearRailLines(),
      this.clearRailStations(),
      this.clearBikeStations(),
    ]);
    this.context.logger.debug(
      'Cleared and recreated all Typesense collections',
    );
  }

  private async clearRailLines(): Promise<void> {
    await this.context.recreateCollection(
      GPKG_LINES_COLLECTION_NAME,
      GPKG_LINES_SCHEMA,
    );
  }

  private async clearRailStations(): Promise<void> {
    await this.context.recreateCollection(
      GPKG_STATIONS_COLLECTION_NAME,
      GPKG_STATIONS_SCHEMA,
    );
  }

  private async clearBikeStations(): Promise<void> {
    await this.context.recreateCollection(
      BIKE_STATIONS_COLLECTION_NAME,
      BIKE_STATIONS_SCHEMA,
    );
  }
}
