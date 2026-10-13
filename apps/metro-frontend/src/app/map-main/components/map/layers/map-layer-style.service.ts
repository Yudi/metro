import { Service, inject } from '@angular/core';
import { FeatureLike } from 'ol/Feature';
import { Style, Stroke } from 'ol/style';
import Icon from 'ol/style/Icon';
import { StationNameService } from '../../../geography/station-name.service';
import { TransitAgency } from '@metro/shared/utils';
import {
  createCenteredAgencyIconStyles,
  createCenteredStationLabelStyle,
  createSelectedPointStyle,
} from './map-style.utils';
import { createBikeMarkerStyles } from './bike-marker-style.utils';

/** Owns OpenLayers styles so layer lifecycle and visual presentation stay separate. */
@Service()
export class MapLayerStyleService {
  private readonly stationNameService = inject(StationNameService);

  private readonly addressPinIcon = new Icon({
    src: '/app/shared/icons/pin.svg',
    scale: 0.05,
    anchor: [0.5, 1],
    anchorXUnits: 'fraction',
    anchorYUnits: 'fraction',
  });

  private readonly selectedBusStopStyle = new Style({
    image: new Icon({
      src: '/app/icons/bus-stop.svg',
      scale: 0.55,
      anchor: [0.5, 0.5],
      anchorXUnits: 'fraction',
      anchorYUnits: 'fraction',
    }),
  });

  createSelectionStyle(feature: FeatureLike, zoom = 0): Style | Style[] {
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
    if (featureType === 'stop' && !properties['isSubwayStation']) {
      return zoom >= 12 ? this.selectedBusStopStyle : [];
    }
    if (featureType === 'bike_station') {
      return createBikeMarkerStyles({
        bikesAvailable: Number(properties['bikesAvailable'] ?? 0),
        effectiveCapacity: Number(properties['effectiveCapacity'] ?? 0),
        hasElectricBikes: Boolean(properties['hasElectricBikesAvailable']),
        selected: true,
      });
    }

    if (featureType === 'address_location') {
      return [new Style({ image: this.addressPinIcon })];
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

}
