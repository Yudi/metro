import { Circle as CircleStyle, Fill, Icon, Stroke, Style, Text } from 'ol/style';

interface BikeMarkerOptions {
  bikesAvailable: number;
  effectiveCapacity: number;
  hasElectricBikes: boolean;
  clustered?: boolean;
  stationCount?: number;
  selected?: boolean;
}

/** Shared by vector tiles, selected stations, and map previews. */
export function createBikeMarkerStyles(options: BikeMarkerOptions): Style[] {
  const label = options.effectiveCapacity > 0
    ? `${options.bikesAvailable}/${options.effectiveCapacity}`
    : String(options.bikesAvailable);
  const color = options.hasElectricBikes ? '#ffd54f' : '#2e7d32';

  if (options.clustered ?? (options.stationCount ?? 1) > 1) {
    // Leave room for aggregate counts without shrinking the text or clipping it.
    const radius = Math.max(
      26,
      Math.min(32, 20 + Math.sqrt(options.stationCount ?? 1) * 2),
      label.length * 3.5 + 5,
    );
    return [
      new Style({
        image: new CircleStyle({
          radius: radius + 3,
          fill: new Fill({ color: '#ffffff' }),
        }),
      }),
      new Style({
        image: new CircleStyle({
          radius,
          fill: new Fill({ color: '#ffffff' }),
          stroke: new Stroke({ color, width: 4 }),
        }),
        text: new Text({
          text: label,
          font: '700 12px "Inter", "Roboto", sans-serif',
          fill: new Fill({ color: '#1f1f1f' }),
          offsetY: 11,
          textAlign: 'center',
          textBaseline: 'middle',
        }),
      }),
      new Style({
        image: new Icon({
          src: options.hasElectricBikes
            ? '/app/icons/bike-electric-marker-symbol.svg'
            : '/app/icons/bike-marker-symbol.svg',
          scale: 0.8,
          displacement: [0, 9],
        }),
      }),
    ];
  }

  const scale = options.selected ? 1.12 : 1;
  const styles = [
    new Style({
      image: new Icon({
        src: options.hasElectricBikes
          ? '/app/icons/bike-electric-marker.svg'
          : '/app/icons/bike-marker.svg',
        scale,
        // The location dot anchors the pill to the station's coordinates.
        anchor: [44, 41],
        anchorXUnits: 'pixels',
        anchorYUnits: 'pixels',
      }),
      text: new Text({
        text: label,
        font: `700 ${12 * scale}px "Inter", "Roboto", sans-serif`,
        fill: new Fill({ color: '#1f1f1f' }),
        offsetX: 13 * scale,
        offsetY: -25 * scale,
        textAlign: 'center',
        textBaseline: 'middle',
      }),
      zIndex: options.selected ? 2 : 0,
    }),
  ];

  if (options.selected) {
    styles.push(new Style({
      image: new CircleStyle({
        radius: 6,
        stroke: new Stroke({ color: '#1565c0', width: 2 }),
      }),
      zIndex: 3,
    }));
  }
  return styles;
}
