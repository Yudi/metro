export interface MapFeature {
  id?: string;
  geometry: {
    type: 'Point' | 'LineString' | 'Polygon' | 'Circle';
    coordinates: number[][];
    radius?: number;
  };
  properties: Record<string, unknown>;
}

export interface MapOptions {
  center?: [number, number];
  zoom?: number;
  showControls?: boolean;
  additionalLayers?: import('ol/layer/Base').default[];
}

export interface MapPointSelection {
  lat: number;
  lon: number;
}
