import { Style, Fill, Stroke, Circle as CircleStyle, Text } from 'ol/style';
import Icon from 'ol/style/Icon';
import {
  getAgencyIconPath,
  getFallbackIconPath,
  TransitAgency,
} from '@metro/shared/utils';

export function createSelectedPointStyle(): Style {
  return new Style({
    fill: new Fill({
      color: 'rgba(255, 152, 0, 0.3)',
    }),
    stroke: new Stroke({
      color: '#ff9800',
      width: 3,
    }),
    image: new CircleStyle({
      radius: 10,
      fill: new Fill({
        color: '#ff9800',
      }),
      stroke: new Stroke({
        color: '#ffffff',
        width: 2,
      }),
    }),
  });
}

export function createCenteredAgencyIconStyles(
  agencies: TransitAgency[],
  iconSize = 14,
  iconSpacing = 18,
): Style[] {
  if (agencies.length === 0) {
    return [createFallbackAgencyIconStyle(iconSize)];
  }

  const lastIndex = agencies.length - 1;

  return agencies.map((agency, index) => {
    const offsetX = (index - lastIndex / 2) * iconSpacing;

    return new Style({
      image: new Icon({
        src: getAgencyIconPath(agency),
        width: iconSize,
        height: iconSize,
        anchor: [0.5, 0.5],
        anchorXUnits: 'fraction',
        anchorYUnits: 'fraction',
        displacement: [offsetX, 0],
      }),
    });
  });
}

export function createInlineAgencyIconStyles(
  agencies: TransitAgency[],
  iconSize = 12,
  iconSpacing = 14,
): Style[] {
  if (agencies.length === 0) {
    return [createFallbackAgencyIconStyle(iconSize)];
  }

  return agencies.map(
    (agency, index) =>
      new Style({
        image: new Icon({
          src: getAgencyIconPath(agency),
          width: iconSize,
          height: iconSize,
          anchor: [0, 0.5],
          anchorXUnits: 'fraction',
          anchorYUnits: 'fraction',
          displacement: [index * iconSpacing, 0],
        }),
      }),
  );
}

export function createFallbackAgencyIconStyle(iconSize = 14): Style {
  return new Style({
    image: new Icon({
      src: getFallbackIconPath(),
      width: iconSize,
      height: iconSize,
      anchor: [0.5, 0.5],
      anchorXUnits: 'fraction',
      anchorYUnits: 'fraction',
    }),
  });
}

export function createCenteredStationLabelStyle(text: string): Style {
  return new Style({
    text: new Text({
      text,
      font: '500 12px "Inter", "Roboto", sans-serif',
      fill: new Fill({ color: '#1a1a1a' }),
      stroke: new Stroke({ color: '#ffffff', width: 3.5 }),
      offsetY: 16,
      textAlign: 'center',
      textBaseline: 'top',
    }),
  });
}

export function createInlineStationLabelStyle(
  text: string,
  offsetX: number,
): Style {
  return new Style({
    text: new Text({
      text,
      font: '12px Inter, sans-serif',
      fill: new Fill({ color: '#202124' }),
      stroke: new Stroke({
        color: '#ffffff',
        width: 3,
      }),
      offsetX,
      textAlign: 'left',
      textBaseline: 'middle',
    }),
  });
}
