import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RailStation } from '../entities/rail-station.entity';
import { BoundingBoxInput } from '../dto/geography.input';

/**
 * Service for GeoSampa rail stations (Metro and CPTM)
 * Queries the mvt_rail_stations materialized view
 */
@Injectable()
export class RailStationService {
  private readonly logger = new Logger(RailStationService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Get all rail stations from GeoSampa rail data
   */
  async getAllRawRailStations(): Promise<RailStation[]> {
    const stations = await this.prisma.$queryRaw<
      Array<{
        id: number;
        name: string;
        lines: string[] | null;
        agencies: string[];
        status: string | null;
        latitude: number;
        longitude: number;
      }>
    >`
      SELECT 
        id,
        name,
        lines,
        agencies,
        NULL::TEXT as status,
        ST_Y(ST_Transform(geom_3857, 4326)) as latitude,
        ST_X(ST_Transform(geom_3857, 4326)) as longitude
      FROM mvt_rail_stations
      ORDER BY name
    `;

    return stations.map((station) => ({
      id: station.id.toString(),
      name: station.name,
      lines: station.lines || [],
      agencies: station.agencies,
      status: station.status || undefined,
      latitude: station.latitude,
      longitude: station.longitude,
      geometry: {
        type: 'Point',
        coordinates: [[station.longitude, station.latitude]],
      },
    }));
  }

  async getAllRailStations(): Promise<RailStation[]> {
    try {
      const stations = await this.prisma.mergedRailStation.findMany();
      return stations.map((station) => ({
        id: station.primaryId.toString(),
        name: station.name,
        lines: station.lines,
        agencies: station.agencies,
        latitude: station.latitude,
        longitude: station.longitude,
        status: 'OPERANDO',
        geometry: {
          type: 'Point',
          coordinates: [[station.longitude, station.latitude]],
        },
      }));
    } catch (error) {
      this.logger.error('Failed to fetch merged subway stations', error);
      return [];
    }
  }

  /**
   * Get rail stations within bounding box
   */
  async getRailStationsInBounds(
    bounds: BoundingBoxInput,
  ): Promise<RailStation[]> {
    const stations = await this.prisma.$queryRaw<
      Array<{
        id: number;
        name: string;
        lines: string[];
        agencies: string[];
        status: string | null;
        latitude: number;
        longitude: number;
      }>
    >`
      SELECT 
        id,
        name,
        lines,
        agencies,
        NULL::TEXT as status,
        ST_Y(ST_Transform(geom_3857, 4326)) as latitude,
        ST_X(ST_Transform(geom_3857, 4326)) as longitude
      FROM mvt_rail_stations
      WHERE ST_Within(
        geom_3857,
        ST_Transform(
          ST_MakeEnvelope(
            ${bounds.minLng}, ${bounds.minLat},
            ${bounds.maxLng}, ${bounds.maxLat},
            4326
          ),
          3857
        )
      )
      ORDER BY name
    `;

    return stations.map((station) => ({
      id: station.id.toString(),
      name: station.name,
      lines: station.lines,
      agencies: station.agencies,
      status: station.status || undefined,
      latitude: station.latitude,
      longitude: station.longitude,
      geometry: {
        type: 'Point',
        coordinates: [[station.longitude, station.latitude]],
      },
    }));
  }

  /**
   * Get a single rail station by ID
   */
  async getRailStationById(id: string): Promise<RailStation | null> {
    const numericId = parseInt(id, 10);
    if (isNaN(numericId)) {
      return null;
    }

    const stations = await this.prisma.$queryRaw<
      Array<{
        id: number;
        name: string;
        lines: string[];
        agencies: string[];
        status: string | null;
        latitude: number;
        longitude: number;
      }>
    >`
      SELECT 
        id,
        name,
        lines,
        agencies,
        NULL::TEXT as status,
        ST_Y(ST_Transform(geom_3857, 4326)) as latitude,
        ST_X(ST_Transform(geom_3857, 4326)) as longitude
      FROM mvt_rail_stations
      WHERE id = ${numericId}
      LIMIT 1
    `;

    if (stations.length === 0) {
      return null;
    }

    return {
      id: stations[0].id.toString(),
      name: stations[0].name,
      lines: stations[0].lines,
      agencies: stations[0].agencies,
      status: stations[0].status || undefined,
      latitude: stations[0].latitude,
      longitude: stations[0].longitude,
      geometry: {
        type: 'Point',
        coordinates: [[stations[0].longitude, stations[0].latitude]],
      },
    };
  }

  /**
   * Search rail stations by name
   */
  async searchRailStations(
    searchTerm: string,
    limit = 20,
  ): Promise<RailStation[]> {
    // Use merged_rail_stations for search to show merged stations as single results
    const mergedStations = await this.prisma.$queryRaw<
      Array<{
        primaryId: number;
        name: string;
        originalName: string;
        latitude: number;
        longitude: number;
        agencies: string[];
        lines: string[];
      }>
    >`
      SELECT 
        "primaryId",
        name,
        "originalName",
        latitude,
        longitude,
        agencies,
        lines
      FROM merged_rail_stations
      WHERE name ILIKE ${`%${searchTerm}%`}
         OR "originalName" ILIKE ${`%${searchTerm}%`}
      ORDER BY name
      LIMIT ${limit}
    `;

    // Map merged stations to RailStation entities
    return mergedStations.map((station) => ({
      id: station.primaryId.toString(),
      name: station.name,
      lines: station.lines,
      agencies: station.agencies, // Combine all agencies
      latitude: station.latitude,
      longitude: station.longitude,
      status: 'OPERANDO',
    }));
  }

  /**
   * Search nearby rail stations
   */
  async searchNearbyRailStations(
    latitude: number,
    longitude: number,
    radiusMeters = 1000,
    limit = 20,
  ): Promise<RailStation[]> {
    // Use merged_rail_stations for nearby search to show merged stations as single results
    const mergedStations = await this.prisma.$queryRaw<
      Array<{
        primaryId: number;
        name: string;
        originalName: string;
        latitude: number;
        longitude: number;
        agencies: string[];
        lines: string[];
        distance: number;
      }>
    >`
      SELECT 
        "primaryId",
        name,
        "originalName",
        latitude,
        longitude,
        agencies,
        lines,
        ST_Distance(
          ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography,
          ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography
        ) as distance
      FROM merged_rail_stations
      WHERE ST_DWithin(
        ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography,
        ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography,
        ${radiusMeters}
      )
      ORDER BY distance
      LIMIT ${limit}
    `;

    // Map merged stations to RailStation entities
    return mergedStations.map((station) => ({
      id: station.primaryId.toString(),
      name: station.name,
      lines: station.lines,
      agencies: station.agencies, // Combine all agencies
      latitude: station.latitude,
      longitude: station.longitude,
      status: 'OPERANDO',
    }));
  }

  /**
   * Map database results to RailStation entities
   */
  private mapStationsToEntities(
    stations: Array<{
      id: number;
      name: string;
      lines: string[];
      agencies: string[];
      status: string | null;
      geom_3857: unknown;
    }>,
  ): RailStation[] {
    return stations.map((station) => {
      // Extract coordinates from PostGIS geometry
      const coords = this.extractCoordinates(station.geom_3857);

      return {
        id: station.id.toString(),
        name: station.name,
        lines: station.lines,
        agencies: station.agencies,
        status: station.status || undefined,
        latitude: coords.lat,
        longitude: coords.lng,
        geometry: {
          type: 'Point',
          coordinates: [[coords.lng, coords.lat]],
        },
      };
    });
  }

  /**
   * Extract latitude and longitude from PostGIS POINT geometry
   */
  private extractCoordinates(geom: unknown): { lat: number; lng: number } {
    if (!geom) {
      return { lat: 0, lng: 0 };
    }

    // If it's already parsed as an object with coordinates
    if (typeof geom === 'object' && geom !== null) {
      const geojson = geom as { coordinates?: number[] };
      if (geojson.coordinates && Array.isArray(geojson.coordinates)) {
        return this.coordinatePairToLatLng(
          geojson.coordinates[0],
          geojson.coordinates[1],
        );
      }
    }

    const buffer =
      typeof geom === 'string' && /^(?:\\x)?[\da-f]+$/i.test(geom)
        ? Buffer.from(geom.replace(/^\\x/i, ''), 'hex')
        : Buffer.isBuffer(geom)
          ? geom
          : null;

    if (!buffer || buffer.length < 21) {
      return { lat: 0, lng: 0 };
    }

    const view = new DataView(
      buffer.buffer,
      buffer.byteOffset,
      buffer.byteLength,
    );
    const littleEndian = view.getUint8(0) === 1;
    const rawGeometryType = view.getUint32(1, littleEndian);
    const hasSrid = rawGeometryType >= 0x20000000;
    const geometryType = rawGeometryType % 0x1000;

    if (geometryType !== 1) {
      return { lat: 0, lng: 0 };
    }

    const coordinateOffset = hasSrid ? 9 : 5;
    if (buffer.length < coordinateOffset + 16) {
      return { lat: 0, lng: 0 };
    }

    const srid = hasSrid ? view.getUint32(5, littleEndian) : undefined;
    const x = view.getFloat64(coordinateOffset, littleEndian);
    const y = view.getFloat64(coordinateOffset + 8, littleEndian);

    return this.coordinatePairToLatLng(x, y, srid);
  }

  private coordinatePairToLatLng(
    x: number,
    y: number,
    srid?: number,
  ): { lat: number; lng: number } {
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return { lat: 0, lng: 0 };
    }

    if (srid === 3857 || Math.abs(x) > 180 || Math.abs(y) > 90) {
      return this.webMercatorToWgs84(x, y);
    }

    return { lat: y, lng: x };
  }

  private webMercatorToWgs84(
    x: number,
    y: number,
  ): { lat: number; lng: number } {
    const earthRadiusMeters = 6378137;
    const lng = (x / earthRadiusMeters) * (180 / Math.PI);
    const lat =
      (2 * Math.atan(Math.exp(y / earthRadiusMeters)) - Math.PI / 2) *
      (180 / Math.PI);

    return { lat, lng };
  }
}
