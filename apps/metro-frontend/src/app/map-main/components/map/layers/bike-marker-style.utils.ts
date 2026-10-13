import type { FeatureLike } from 'ol/Feature';
import { createCanvasContext2D } from 'ol/dom';
import { Circle as CircleStyle, Fill, Icon, Stroke, Style, Text } from 'ol/style';

interface BikeMarkerOptions {
  bikesAvailable: number;
  effectiveCapacity: number;
  hasElectricBikes: boolean;
  clustered?: boolean;
  stationCount?: number;
  selected?: boolean;
  depth?: number;
}

/** Southern markers sit in front; longitude breaks ties along the same latitude. */
export function getBikeMarkerDepth(feature: FeatureLike): number {
  const extent = feature.getGeometry()?.getExtent();
  if (!extent || !extent.every(Number.isFinite)) return 0;
  const x = (extent[0] + extent[2]) / 2;
  const y = (extent[1] + extent[3]) / 2;
  return -y + x * 1e-9;
}

/** Shared by vector tiles, selected stations, and map previews. */
export function createBikeMarkerStyles(options: BikeMarkerOptions): Style[] {
  const label = options.effectiveCapacity > 0
    ? `${options.bikesAvailable}/${options.effectiveCapacity}`
    : String(options.bikesAvailable);
  const color = options.hasElectricBikes ? '#ffd54f' : '#2e7d32';
  const zIndex = options.depth ?? 0;

  if (options.clustered ?? (options.stationCount ?? 1) > 1) {
    // Leave room for aggregate counts without shrinking the text or clipping it.
    const clusterScale = 0.9;
    const radius = Math.max(
      26,
      Math.min(32, 20 + Math.sqrt(options.stationCount ?? 1) * 2),
      label.length * 3.5 + 5,
    );
    return [
      new Style({
        zIndex,
        image: new CircleStyle({
          radius: (radius + 3) * clusterScale,
          fill: new Fill({ color: '#ffffff' }),
        }),
      }),
      new Style({
        zIndex,
        image: new CircleStyle({
          radius: radius * clusterScale,
          fill: new Fill({ color: '#ffffff' }),
          stroke: new Stroke({ color, width: 4 * clusterScale }),
        }),
        text: new Text({
          text: label,
          font: `700 ${12 * clusterScale}px "Inter", "Roboto", sans-serif`,
          fill: new Fill({ color: '#1f1f1f' }),
          offsetY: 11 * clusterScale,
          textAlign: 'center',
          textBaseline: 'middle',
        }),
      }),
      new Style({
        zIndex,
        image: new Icon({
          src: options.hasElectricBikes
            ? '/app/icons/bike-electric-marker-symbol.svg'
            : '/app/icons/bike-marker-symbol.svg',
          scale: 0.8 * clusterScale,
          displacement: [0, 9 * clusterScale],
        }),
      }),
    ];
  }

  // Map styles are only rendered in the browser; avoid canvas access during SSR.
  if (typeof document === 'undefined') return [];

  const scale = options.selected ? 1.12 : 1;
  const font = '700 12px "Inter", "Roboto", sans-serif';
  const context = createCanvasContext2D();
  context.font = font;
  const labelWidth = Math.ceil(context.measureText(label).width);
  const labelStart = 32;
  const padding = 6;
  const width = labelStart + labelWidth + padding + 2;
  const shadowPadding = 6;
  const centerX = width / 2;
  const pixelRatio = Math.max(2, window.devicePixelRatio || 1);
  context.canvas.width = Math.ceil((width + shadowPadding * 2) * pixelRatio);
  context.canvas.height = (48 + shadowPadding * 2) * pixelRatio;
  context.scale(pixelRatio, pixelRatio);
  context.translate(shadowPadding, shadowPadding);

  // Draw the flexible pill directly, keeping static symbols on the allowed origin.
  context.fillStyle = color;
  context.beginPath();
  context.moveTo(centerX - 5, 29);
  context.lineTo(centerX + 5, 29);
  context.lineTo(centerX, 36);
  context.fill();
  context.shadowColor = options.selected ? '#17251b52' : '#17251b40';
  context.shadowOffsetY = (options.selected ? 3 : 2) * pixelRatio;
  context.shadowBlur = (options.selected ? 5 : 4) * pixelRatio;
  context.fillStyle = '#ffffff';
  context.beginPath();
  context.roundRect(2, 2, width - 4, 28, 14);
  context.fill();
  context.shadowColor = 'transparent';
  context.fillStyle = color;
  context.beginPath();
  context.arc(centerX, 41, 4, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = '#ffffff';
  context.lineWidth = 2;
  context.stroke();

  // Keep the label in the same image as its surface so overlapping pills cannot
  // interleave their backgrounds and text in OpenLayers' separate draw batches.
  context.font = font;
  context.fillStyle = '#1f1f1f';
  context.textAlign = 'left';
  context.textBaseline = 'middle';
  context.fillText(label, labelStart, 16);

  const styles = [
    new Style({
      image: new Icon({
        img: context.canvas,
        scale: scale / pixelRatio,
        // Keep the location dot centered on the station as the label width changes.
        anchor: [(centerX + shadowPadding) * pixelRatio, (41 + shadowPadding) * pixelRatio],
        anchorXUnits: 'pixels',
        anchorYUnits: 'pixels',
      }),
      zIndex,
    }),
    new Style({
      image: new Icon({
        src: options.hasElectricBikes
          ? '/app/icons/bike-electric-marker.svg'
          : '/app/icons/bike-marker.svg',
        // Reuse the original badge without stretching it with the pill.
        size: [28, 28],
        offset: [3, 2],
        scale,
        anchor: [centerX - 3, 39],
        anchorXUnits: 'pixels',
        anchorYUnits: 'pixels',
      }),
      zIndex,
    }),
  ];

  if (options.selected) {
    styles.push(new Style({
      image: new CircleStyle({
        radius: 6,
        stroke: new Stroke({ color: '#1565c0', width: 2 }),
      }),
      zIndex,
    }));
  }
  return styles;
}
