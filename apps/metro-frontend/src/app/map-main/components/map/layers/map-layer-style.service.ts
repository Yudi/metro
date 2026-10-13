import { Service, inject } from '@angular/core';
import { FeatureLike } from 'ol/Feature';
import { Style, Fill, Stroke, Text } from 'ol/style';
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

  private readonly bikeSelectedIcon = new Icon({
    src: '/app/icons/bike-selected.svg',
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

}
