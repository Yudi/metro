import { Service, inject } from '@angular/core';
import { Feature } from 'ol';
import { FeatureLike } from 'ol/Feature';
import { Style, Fill, Stroke, Circle as CircleStyle, Text } from 'ol/style';
import Icon from 'ol/style/Icon';
import { StationNameService } from '../../../geography/station-name.service';
import { TransitAgency } from '@metro/shared/utils';
import {
  createCenteredAgencyIconStyles,
  createCenteredStationLabelStyle,
  createSelectedPointStyle,
} from './map-style.utils';

/** Owns OpenLayers styles so layer lifecycle and visual presentation stay separate. */
@Service()
export class MapLayerStyleService {
  private readonly stationNameService = inject(StationNameService);

  private readonly bikeIcon = new Icon({
    src: '/app/icons/bike.svg',
    scale: 0.55,
    anchor: [0.5, 0.5],
    anchorXUnits: 'fraction',
    anchorYUnits: 'fraction',
  });
  private readonly bikeSelectedIcon = new Icon({
    src: '/app/icons/bike-selected.svg',
    scale: 0.55,
    anchor: [0.5, 0.5],
    anchorXUnits: 'fraction',
    anchorYUnits: 'fraction',
  });
  private readonly bikeElectricIcon = new Icon({
    src: '/app/icons/bike-electric.svg',
    scale: 0.55,
    anchor: [0.5, 0.5],
    anchorXUnits: 'fraction',
    anchorYUnits: 'fraction',
  });
  private readonly bikeElectricSelectedIcon = new Icon({
    src: '/app/icons/bike-electric-selected.svg',
    scale: 0.55,
    anchor: [0.5, 0.5],
    anchorXUnits: 'fraction',
    anchorYUnits: 'fraction',
  });
  private readonly explorePinIcon = new Icon({
    src: '/app/shared/icons/pin.svg',
    scale: 0.05,
    anchor: [0.5, 1],
    anchorXUnits: 'fraction',
    anchorYUnits: 'fraction',
  });

  getClusterDistanceForZoom(zoom: number | null): number {
    if (zoom === null) return 60;
    if (zoom >= 16) return 0;
    if (zoom >= 14) return 24;
    return 60;
  }

  createSelectionStyle(feature: FeatureLike): Style | Style[] {
    const properties = feature.getProperties();
    const geometryType = feature.getGeometry()?.getType();
    if (geometryType === 'LineString') {
      const routeColor = properties['color'];
      const strokeColor =
        routeColor && routeColor !== '' ? `#${routeColor}` : '#ff9800';
      return new Style({
        stroke: new Stroke({ color: strokeColor, width: 4 }),
      });
    }

    const featureType = properties['type'];
    if (featureType === 'bike_station') {
      const bikesAvailable = Number(properties['bikesAvailable'] ?? 0);
      const effectiveCapacity = Number(properties['effectiveCapacity'] ?? 0);
      const hasElectric = Boolean(properties['hasElectricBikesAvailable']);
      const capacityLabel =
        effectiveCapacity > 0
          ? `${bikesAvailable}/${effectiveCapacity}`
          : `${bikesAvailable}`;
      const iconToUse = hasElectric
        ? this.bikeElectricSelectedIcon
        : this.bikeSelectedIcon;
      return [
        new Style({ image: iconToUse }),
        new Style({
          text: new Text({
            text: capacityLabel,
            font: '600 11px "Inter", "Roboto", sans-serif',
            fill: new Fill({ color: '#1565c0' }),
            stroke: new Stroke({ color: '#ffffff', width: 3.5 }),
            offsetY: 14,
            textAlign: 'center',
            textBaseline: 'top',
          }),
        }),
      ];
    }

    if (featureType === 'explore_location') {
      return [new Style({ image: this.explorePinIcon })];
    }
    return createSelectedPointStyle();
  }

  createSubwayStationStyle(feature: FeatureLike, zoom = 0): Style | Style[] {
    const properties = feature.getProperties();
    const showLabels = zoom >= 14;
    const agencies = (properties['agencies'] || []) as TransitAgency[];
    const styles = createCenteredAgencyIconStyles(agencies);
    if (showLabels && properties['name']) {
      const displayName = this.stationNameService.formatStationName(
        properties['name'] as string,
        true,
      );
      styles.push(createCenteredStationLabelStyle(displayName));
    }
    return styles;
  }

  createSubwayRouteStyle(feature: FeatureLike): Style {
    const routeColor = feature.getProperties()['color'];
    const strokeColor =
      routeColor && routeColor !== '' ? `#${routeColor}` : '#1976d2';
    return new Style({ stroke: new Stroke({ color: strokeColor, width: 3 }) });
  }

  createBusRouteStyle(feature: FeatureLike): Style {
    const routeColor = feature.getProperties()['color'];
    const strokeColor =
      routeColor && routeColor !== '' ? `#${routeColor}` : '#1976d2';
    return new Style({ stroke: new Stroke({ color: strokeColor, width: 2 }) });
  }

  createBusStopStyle(): Style {
    return new Style({
      image: new Icon({
        src: '/app/icons/bus-stop.svg',
        scale: 0.5,
        anchor: [0.5, 1],
        anchorXUnits: 'fraction',
        anchorYUnits: 'fraction',
      }),
    });
  }

  createBikeStyle(feature: FeatureLike): Style[] {
    const clusterMembers = feature.get('features') as Feature[] | undefined;
    if (Array.isArray(clusterMembers) && clusterMembers.length > 1) {
      return this.createClusteredBikeStyle(clusterMembers);
    }
    const baseFeature: Feature | FeatureLike =
      Array.isArray(clusterMembers) && clusterMembers.length === 1
        ? clusterMembers[0]
        : feature;
    return this.createSingleBikeStyle(baseFeature as Feature);
  }

  private createSingleBikeStyle(feature: Feature): Style[] {
    const bikesAvailable = Number(feature.get('bikesAvailable') ?? 0);
    const effectiveCapacity = Number(feature.get('effectiveCapacity') ?? 0);
    const hasElectric = Boolean(feature.get('hasElectricBikesAvailable'));
    const isSelected = Boolean(feature.get('isSelected'));
    const capacityLabel =
      effectiveCapacity > 0
        ? `${bikesAvailable}/${effectiveCapacity}`
        : `${bikesAvailable}`;
    const styles: Style[] = [];

    if (isSelected) {
      styles.push(
        new Style({
          image: new CircleStyle({
            radius: 14,
            fill: new Fill({ color: 'rgba(33, 150, 243, 0.2)' }),
            stroke: new Stroke({ color: '#2196f3', width: 2.5 }),
          }),
        }),
      );
    }

    const iconToUse = isSelected
      ? hasElectric
        ? this.bikeElectricSelectedIcon
        : this.bikeSelectedIcon
      : hasElectric
        ? this.bikeElectricIcon
        : this.bikeIcon;
    styles.push(new Style({ image: iconToUse }));
    styles.push(
      new Style({
        text: new Text({
          text: capacityLabel,
          font: '600 11px "Inter", "Roboto", sans-serif',
          fill: new Fill({ color: isSelected ? '#1565c0' : '#1b5e20' }),
          stroke: new Stroke({ color: '#ffffff', width: 3.5 }),
          offsetY: 14,
          textAlign: 'center',
          textBaseline: 'top',
        }),
      }),
    );
    return styles;
  }

  private createClusteredBikeStyle(features: Feature[]): Style[] {
    const totalBikes = features.reduce(
      (sum, feature) => sum + Number(feature.get('bikesAvailable') ?? 0),
      0,
    );
    const totalCapacity = features.reduce(
      (sum, feature) => sum + Number(feature.get('effectiveCapacity') ?? 0),
      0,
    );
    const hasElectric = features.some((feature) =>
      Boolean(feature.get('hasElectricBikesAvailable')),
    );
    const label =
      totalCapacity > 0 ? `${totalBikes}/${totalCapacity}` : `${totalBikes}`;
    const radius = Math.min(24, 12 + Math.sqrt(features.length) * 3.5);

    return [
      new Style({
        image: new CircleStyle({
          radius,
          fill: new Fill({ color: '#2e7d32' }),
          stroke: new Stroke({
            color: hasElectric ? '#ffd54f' : '#ffffff',
            width: hasElectric ? 3 : 2.5,
          }),
        }),
        text: new Text({
          text: label,
          font: '700 11px "Inter", "Roboto", sans-serif',
          fill: new Fill({ color: '#ffffff' }),
          stroke: new Stroke({ color: 'rgba(0,0,0,0.4)', width: 3 }),
        }),
      }),
    ];
  }
}
