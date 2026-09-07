import { Service, inject } from '@angular/core';
import { LoggerService } from '@metro/shared/api';
import {
  getCanonicalRailStationName,
  getLineCodesFromColorNames,
} from '@metro/shared/utils';
import { FeatureLike } from 'ol/Feature';
import { VectorTileFeatureDetectorService } from './vector-tile-feature-detector.service';
import {
  BikeStationClusterTileData,
  BikeStationTileData,
  BusRouteTileData,
  BusStopTileData,
  RailRouteTileData,
  RailStationTileData,
} from './vector-tile-feature.types';
import { VectorTilePropertyParserService } from './vector-tile-property-parser.service';

@Service()
export class VectorTileFeatureExtractorService {
  private readonly logger = inject(LoggerService);
  private readonly detector = inject(VectorTileFeatureDetectorService);
  private readonly parser = inject(VectorTilePropertyParserService);

  extractRailStationData(feature: FeatureLike): RailStationTileData | null {
    const properties = feature.getProperties();

    this.logger.debug('extractRailStationData: raw properties', properties);
    this.logger.debug(
      'extractRailStationData: property keys',
      Object.keys(properties),
    );

    const propsWithoutGeom = { ...properties };
    delete propsWithoutGeom['geometry'];
    this.logger.debug(
      'extractRailStationData: properties (no geom)',
      propsWithoutGeom,
    );

    const featureId = this.getRailStationFeatureId(feature, properties);
    const checks = {
      hasName: 'name' in properties,
      hasAgencies: 'agencies' in properties,
      hasLines: 'lines' in properties,
      hasIdProperty: 'id' in properties,
      hasFeatureId: !!featureId,
      nameValue: properties['name'],
      agenciesValue: properties['agencies'],
      linesValue: properties['lines'],
      idPropertyValue: properties['id'],
      featureIdValue: featureId,
    };
    this.logger.debug('extractRailStationData: property checks', checks);

    if (!('name' in properties)) {
      this.logger.warn('Feature missing name property', checks);
      return null;
    }

    const agencies = this.parser.parseJsonArray(properties['agencies']);
    const lines = this.parser.parseJsonArray(properties['lines']);

    this.logger.debug('extractRailStationData: parsed arrays:', {
      agencies,
      lines,
    });

    const lineCodes = getLineCodesFromColorNames(lines);
    const canonicalName = getCanonicalRailStationName(
      String(properties['name'] || ''),
      lineCodes,
    );

    const result = {
      id: String(featureId ?? canonicalName),
      name: canonicalName,
      agencies,
      lines,
      isMerged: Boolean(properties['is_merged']),
    };

    this.logger.debug('extractRailStationData: SUCCESS', result);
    return result;
  }

  extractRailRouteData(feature: FeatureLike): RailRouteTileData | null {
    const properties = feature.getProperties();

    if (!('inferred_agency' in properties)) {
      return null;
    }

    return {
      id: Number(properties['id']),
      name: properties['name'] ? String(properties['name']) : undefined,
      lineNumber: properties['line_number']
        ? Number(properties['line_number'])
        : undefined,
      lineCode: properties['line_code']
        ? Number(properties['line_code'])
        : undefined,
      colorHex: properties['color_hex']
        ? String(properties['color_hex'])
        : undefined,
      agency: String(properties['inferred_agency']),
    };
  }

  extractBusStopData(feature: FeatureLike): BusStopTileData | null {
    const properties = feature.getProperties();
    const stopId = properties['stop_id'];
    const name = properties['stop_name'];

    if (!stopId || !name) {
      return null;
    }

    return {
      stopId: String(stopId),
      name: String(name),
      latitude: Number(properties['stop_lat'] ?? 0),
      longitude: Number(properties['stop_lon'] ?? 0),
      sourceAgency: this.toOptionalString(properties['source_agency']),
      sourceId: this.toOptionalString(properties['source_id']),
      platformCode: this.toOptionalString(properties['platform_code']),
      mergedStopIds: this.toStringArray(properties['merged_stop_ids']),
    };
  }

  extractBusRouteData(feature: FeatureLike): BusRouteTileData | null {
    const properties = feature.getProperties();
    const routeId = properties['route_id'];

    if (!routeId) {
      return null;
    }

    return {
      routeId: String(routeId),
      shortName: String(properties['route_short_name'] ?? routeId),
      longName: String(properties['route_long_name'] ?? ''),
      color: String(properties['route_color'] ?? ''),
      textColor: String(properties['route_text_color'] ?? ''),
      sourceAgency: this.toOptionalString(properties['source_agency']),
      sourceId: this.toOptionalString(properties['source_id']),
      supportsRealtime:
        typeof properties['supports_realtime'] === 'boolean'
          ? properties['supports_realtime']
          : undefined,
    };
  }

  extractBikeStationData(feature: FeatureLike): BikeStationTileData | null {
    const properties = feature.getProperties();
    const stationId = properties['station_id'];

    if (!stationId || this.detector.isBikeStationCluster(feature)) {
      return null;
    }

    return {
      stationId: String(stationId),
      latitude: Number(properties['latitude'] ?? 0),
      longitude: Number(properties['longitude'] ?? 0),
      capacity: this.toNullableNumber(properties['capacity']),
      effectiveCapacity: Number(properties['effective_capacity'] ?? 0),
      numBikesAvailable: Number(properties['num_bikes_available'] ?? 0),
      electricBikesAvailable: Number(
        properties['electric_bikes_available'] ?? 0,
      ),
    };
  }

  extractBikeStationClusterData(
    feature: FeatureLike,
  ): BikeStationClusterTileData | null {
    if (!this.detector.isBikeStationCluster(feature)) {
      return null;
    }

    const properties = feature.getProperties();

    return {
      latitude: Number(properties['latitude'] ?? 0),
      longitude: Number(properties['longitude'] ?? 0),
      capacity: this.toNullableNumber(properties['capacity']),
      effectiveCapacity: Number(properties['effective_capacity'] ?? 0),
      numBikesAvailable: Number(properties['num_bikes_available'] ?? 0),
      electricBikesAvailable: Number(
        properties['electric_bikes_available'] ?? 0,
      ),
      stationCount: Number(properties['station_count'] ?? 0),
    };
  }

  private getRailStationFeatureId(
    feature: FeatureLike,
    properties: Record<string, unknown>,
  ): string | number | undefined {
    let featureId = properties['id'] as string | number | undefined;

    if (!featureId && typeof feature.getId === 'function') {
      featureId = feature.getId();
      this.logger.debug(
        'extractRailStationData: got ID from feature.getId()',
        featureId,
      );
    }

    if (!featureId && properties['name']) {
      const name = String(properties['name']);
      featureId = Math.abs(
        name.split('').reduce((acc, char) => {
          return (acc << 5) - acc + char.charCodeAt(0);
        }, 0),
      );
      this.logger.debug(
        'extractRailStationData: generated ID from name hash',
        featureId,
      );
    }

    return featureId;
  }

  private toNullableNumber(raw: unknown): number | null {
    return raw === null || raw === undefined ? null : Number(raw);
  }

  private toOptionalString(raw: unknown): string | undefined {
    return typeof raw === 'string' && raw.trim() ? raw.trim() : undefined;
  }

  private toStringArray(raw: unknown): string[] | undefined {
    if (Array.isArray(raw)) {
      const values = raw.filter((value): value is string => typeof value === 'string');
      return values.length > 0 ? values : undefined;
    }

    if (typeof raw === 'string' && raw.trim()) {
      try {
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          const values = parsed.filter(
            (value): value is string => typeof value === 'string',
          );
          return values.length > 0 ? values : undefined;
        }
      } catch {
        const values = raw
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean);
        return values.length > 0 ? values : undefined;
      }
    }

    return undefined;
  }
}
