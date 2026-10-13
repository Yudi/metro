import { Service, inject } from '@angular/core';
import { LoggerService } from '@metro/shared/api';
import { getRailLineByCode, TransitAgency } from '@metro/shared/utils';
import { FeatureLike } from 'ol/Feature';
import { Stroke, Style } from 'ol/style';
import Icon from 'ol/style/Icon';
import {
  createCenteredAgencyIconStyles,
  createCenteredStationLabelStyle,
} from '../layers/map-style.utils';
import { StationNameService } from '../../../geography/station-name.service';
import { VectorTileFeatureDataService } from './vector-tile-feature-data.service';
import { VectorTileLayerType } from './vector-tile-layer.config';
import { createBikeMarkerStyles } from '../layers/bike-marker-style.utils';

@Service()
export class VectorTileStyleService {
  private readonly stationNameService = inject(StationNameService);
  private readonly featureData = inject(VectorTileFeatureDataService);
  private readonly logger = inject(LoggerService);

  // Tile features are immutable snapshots. Weak keys release styles with evicted tiles.
  private readonly stylesWithoutLabels = new WeakMap<FeatureLike, Style | Style[]>();
  private readonly stylesWithLabels = new WeakMap<FeatureLike, Style | Style[]>();
  private readonly busStopStyle = this.createBusStopStyle();

  getStyleForLayer(
    layerType: VectorTileLayerType,
    feature: FeatureLike,
    currentZoom: number | null,
  ): Style | Style[] {
    if (layerType === VectorTileLayerType.BUS_STOPS) return this.busStopStyle;
    const cache = (currentZoom ?? 0) >= 14
      ? this.stylesWithLabels
      : this.stylesWithoutLabels;
    const cached = cache.get(feature);
    if (cached) return cached;

    const style = this.createStyleForLayer(layerType, feature, currentZoom);
    cache.set(feature, style);
    return style;
  }

  private createStyleForLayer(
    layerType: VectorTileLayerType,
    feature: FeatureLike,
    currentZoom: number | null,
  ): Style | Style[] {
    switch (layerType) {
      case VectorTileLayerType.RAIL_STATIONS:
        return this.createRailStationStyle(feature, currentZoom);
      case VectorTileLayerType.RAIL_ROUTES:
        return this.createRailRouteStyle(feature);
      case VectorTileLayerType.BUS_ROUTES:
        return this.createBusRouteStyle(feature);
      case VectorTileLayerType.BUS_STOPS:
        return this.createBusStopStyle();
      case VectorTileLayerType.BIKE_STATIONS:
        return this.createBikeStationStyle(feature);
      default:
        return new Style();
    }
  }

  private createRailStationStyle(
    feature: FeatureLike,
    currentZoom: number | null,
  ): Style | Style[] {
    const showLabels = (currentZoom || 0) >= 14;
    const agencies = this.parseTransitAgencies(feature.get('agencies'));
    const styles = createCenteredAgencyIconStyles(agencies);

    if (showLabels) {
      const name = feature.get('name') as string;
      if (name) {
        const displayName = this.stationNameService.formatStationName(
          name,
          true,
        );

        styles.push(createCenteredStationLabelStyle(displayName));
      }
    }

    return styles;
  }

  private createRailRouteStyle(feature: FeatureLike): Style {
    const lineCode = Number(
      feature.get('line_code') ?? feature.get('line_number'),
    );
    const colorHex =
      (Number.isFinite(lineCode)
        ? getRailLineByCode(lineCode)?.colorHex
        : undefined) ?? (feature.get('color_hex') as string | undefined);
    const defaultColor = '#1976d2';
    const strokeColor = colorHex || defaultColor;

    return new Style({
      stroke: new Stroke({
        color: strokeColor,
        width: 3,
      }),
    });
  }

  private createBusRouteStyle(feature: FeatureLike): Style {
    const color = String(feature.get('route_color') || '1976d2').replace(
      '#',
      '',
    );

    return new Style({
      stroke: new Stroke({
        color: `#${color}`,
        width: 3,
      }),
    });
  }

  private createBusStopStyle(): Style {
    return new Style({
      image: new Icon({
        src: '/app/icons/bus-stop.svg',
        scale: 0.32,
        anchor: [0.5, 0.5],
        anchorXUnits: 'fraction',
        anchorYUnits: 'fraction',
      }),
    });
  }

  private createBikeStationStyle(
    feature: FeatureLike,
  ): Style[] {
    return createBikeMarkerStyles({
      bikesAvailable: Number(feature.get('num_bikes_available') ?? 0),
      effectiveCapacity: Number(feature.get('effective_capacity') ?? 0),
      hasElectricBikes: Number(feature.get('electric_bikes_available') ?? 0) > 0,
      clustered: this.featureData.isBikeStationCluster(feature),
      stationCount: Number(feature.get('station_count') ?? 1),
    });
  }

  private parseTransitAgencies(raw: unknown): TransitAgency[] {
    if (Array.isArray(raw)) {
      return raw
        .map((agencyStr: string) => this.toTransitAgency(agencyStr))
        .filter((agency): agency is TransitAgency => agency !== null);
    }

    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return parsed
            .map((agencyStr: string) => this.toTransitAgency(agencyStr))
            .filter((agency): agency is TransitAgency => agency !== null);
        }
      } catch (error) {
        this.logger.warn('Failed to parse agencies JSON:', raw, error);
      }
    }

    return [];
  }

  private toTransitAgency(agencyStr: string): TransitAgency | null {
    const agencyEnum = agencyStr as TransitAgency;
    return Object.values(TransitAgency).includes(agencyEnum)
      ? agencyEnum
      : null;
  }
}
