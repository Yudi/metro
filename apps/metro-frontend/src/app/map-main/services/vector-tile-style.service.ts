import { Injectable, inject } from '@angular/core';
import { LoggerService } from '@metro/shared/api';
import { getRailLineByCode, TransitAgency } from '@metro/shared/utils';
import { FeatureLike } from 'ol/Feature';
import { Fill, Stroke, Style, Text, Circle as CircleStyle } from 'ol/style';
import Icon from 'ol/style/Icon';
import {
  createCenteredAgencyIconStyles,
  createCenteredStationLabelStyle,
} from '../utils/map-style.utils';
import { StationNameService } from './station-name.service';
import { VectorTileFeatureDataService } from './vector-tile-feature-data.service';
import { VectorTileLayerType } from './vector-tile-layer.config';

@Injectable({
  providedIn: 'root',
})
export class VectorTileStyleService {
  private readonly stationNameService = inject(StationNameService);
  private readonly featureData = inject(VectorTileFeatureDataService);
  private readonly logger = inject(LoggerService);

  getStyleForLayer(
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
        return this.createBikeStationStyle(feature, currentZoom);
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
        scale: 0.55,
        anchor: [0.5, 0.5],
        anchorXUnits: 'fraction',
        anchorYUnits: 'fraction',
      }),
    });
  }

  private createBikeStationStyle(
    feature: FeatureLike,
    currentZoom: number | null,
  ): Style[] {
    const bikesAvailable = Number(feature.get('num_bikes_available') ?? 0);
    const electricBikesAvailable = Number(
      feature.get('electric_bikes_available') ?? 0,
    );
    const effectiveCapacity = Number(feature.get('effective_capacity') ?? 0);
    const label =
      effectiveCapacity > 0
        ? `${bikesAvailable}/${effectiveCapacity}`
        : String(bikesAvailable);

    if (this.featureData.isBikeStationCluster(feature)) {
      const stationCount = Number(feature.get('station_count') ?? 1);
      const radius = Math.min(24, 12 + Math.sqrt(stationCount) * 3.5);

      return [
        new Style({
          image: new CircleStyle({
            radius,
            fill: new Fill({ color: '#2e7d32' }),
            stroke: new Stroke({
              color: electricBikesAvailable > 0 ? '#fdd835' : '#ffffff',
              width: electricBikesAvailable > 0 ? 3 : 2,
            }),
          }),
          text: new Text({
            text: label,
            font: '700 11px "Inter", "Roboto", sans-serif',
            fill: new Fill({ color: '#ffffff' }),
            stroke: new Stroke({ color: '#1b5e20', width: 3 }),
            textAlign: 'center',
            textBaseline: 'middle',
          }),
        }),
      ];
    }

    const iconPath =
      electricBikesAvailable > 0
        ? '/app/icons/bike-electric.svg'
        : '/app/icons/bike.svg';

    const styles = [
      new Style({
        image: new Icon({
          src: iconPath,
          scale: 0.55,
          anchor: [0.5, 0.5],
          anchorXUnits: 'fraction',
          anchorYUnits: 'fraction',
        }),
      }),
    ];

    if ((currentZoom || 0) >= 14) {
      styles.push(
        new Style({
          text: new Text({
            text: label,
            font: '600 11px "Inter", "Roboto", sans-serif',
            fill: new Fill({ color: '#1565c0' }),
            stroke: new Stroke({ color: '#ffffff', width: 3.5 }),
            offsetY: 14,
            textAlign: 'center',
            textBaseline: 'top',
          }),
        }),
      );
    }

    return styles;
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
