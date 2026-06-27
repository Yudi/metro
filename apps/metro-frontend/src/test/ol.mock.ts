type Listener = (...args: unknown[]) => void;

interface OpenLayersMockOptions {
  center?: unknown;
  features?: Feature[];
  layers?: OpenLayersMockObject[];
  properties?: Record<string, unknown>;
  source?: OpenLayersMockObject;
  target?: string | HTMLElement;
  view?: View;
  visible?: boolean;
  zoom?: number;
  zIndex?: number;
}

class OpenLayersMockObject {
  private readonly properties = new globalThis.Map<string, unknown>();
  private readonly features: Feature[] = [];
  private readonly layers: OpenLayersMockObject[] = [];
  private source: OpenLayersMockObject | null = null;
  private target: string | HTMLElement | undefined;
  private view: View | null = null;
  private visible = true;
  private zIndex = 0;

  constructor(options: OpenLayersMockOptions = {}) {
    this.source = options.source ?? null;
    this.target = options.target;
    this.view = options.view ?? null;
    this.visible = options.visible ?? true;
    this.zIndex = options.zIndex ?? 0;

    options.features?.forEach((feature) => this.addFeature(feature));
    options.layers?.forEach((layer) => this.addLayer(layer));

    if (options.properties) {
      Object.entries(options.properties).forEach(([key, value]) => {
        this.properties.set(key, value);
      });
    }
  }

  get(key: string): unknown {
    if (key === 'source') {
      return this.source;
    }

    return this.properties.get(key);
  }

  set(key: string, value: unknown): void {
    this.properties.set(key, value);
  }

  getSource(): OpenLayersMockObject | null {
    return this.source;
  }

  setSource(source: OpenLayersMockObject): void {
    this.source = source;
  }

  getVisible(): boolean {
    return this.visible;
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
  }

  setZIndex(zIndex: number): void {
    this.zIndex = zIndex;
  }

  getZIndex(): number {
    return this.zIndex;
  }

  addFeature(feature: Feature): void {
    this.features.push(feature);
  }

  removeFeature(feature: Feature): void {
    const index = this.features.indexOf(feature);
    if (index >= 0) {
      this.features.splice(index, 1);
    }
  }

  clear(): void {
    this.features.splice(0);
  }

  getFeatures(): Feature[] {
    return [...this.features];
  }

  addLayer(layer: OpenLayersMockObject): void {
    this.layers.push(layer);
  }

  removeLayer(layer: OpenLayersMockObject): void {
    const index = this.layers.indexOf(layer);
    if (index >= 0) {
      this.layers.splice(index, 1);
    }
  }

  getLayers(): { getArray: () => OpenLayersMockObject[] } {
    return {
      getArray: () => [...this.layers],
    };
  }

  getTarget(): string | HTMLElement | undefined {
    return this.target;
  }

  setTarget(target: string | HTMLElement | undefined): void {
    if (target === undefined && this.target) {
      const previousTarget =
        typeof this.target === 'string'
          ? document.getElementById(this.target)
          : this.target;
      previousTarget
        ?.querySelectorAll('canvas')
        .forEach((canvas) => canvas.remove());
    }

    this.target = target;

    const targetElement =
      typeof target === 'string' ? document.getElementById(target) : target;
    if (targetElement && !targetElement.querySelector('canvas')) {
      targetElement.appendChild(document.createElement('canvas'));
    }
  }

  getView(): View {
    if (!this.view) {
      this.view = new View();
    }

    return this.view;
  }

  on(eventName: string, listener: Listener): Listener {
    void eventName;
    return listener;
  }

  un(eventName: string, listener: Listener): void {
    void eventName;
    void listener;
    return undefined;
  }

  changed(): void {
    return undefined;
  }

  refresh(): void {
    return undefined;
  }

  setStyle(style: unknown): void {
    this.properties.set('style', style);
  }

  updateSize(): void {
    return undefined;
  }

  getFeaturesAtPixel(pixel: unknown): Feature[] {
    void pixel;
    return [];
  }
}

export class View extends OpenLayersMockObject {
  private center: unknown;
  private zoom: number | undefined;

  constructor(options: OpenLayersMockOptions = {}) {
    super(options);
    this.center = options.center;
    this.zoom = options.zoom;
  }

  getZoom(): number | undefined {
    return this.zoom;
  }

  setZoom(zoom: number): void {
    this.zoom = zoom;
  }

  getCenter(): unknown {
    return this.center;
  }

  setCenter(center: unknown): void {
    this.center = center;
  }

  fit(extent: unknown, options?: unknown): void {
    void extent;
    void options;
    return undefined;
  }
}

export class Map extends OpenLayersMockObject {
  constructor(options: OpenLayersMockOptions = {}) {
    super(options);
    this.setTarget(options.target);
  }
}

export class Feature extends OpenLayersMockObject {
  private id: string | number | undefined;
  private geometry: OpenLayersMockObject | null = null;

  constructor(properties: Record<string, unknown> = {}) {
    super({ properties });
  }

  getId(): string | number | undefined {
    return this.id;
  }

  setId(id: string | number): void {
    this.id = id;
  }

  getGeometry(): OpenLayersMockObject | null {
    return this.geometry;
  }

  setGeometry(geometry: OpenLayersMockObject): void {
    this.geometry = geometry;
  }

  getProperties(): Record<string, unknown> {
    return {};
  }
}

export class Point extends OpenLayersMockObject {
  constructor(private readonly coordinates: unknown) {
    super();
  }

  getCoordinates(): unknown {
    return this.coordinates;
  }

  getType(): string {
    return 'Point';
  }
}

export class LineString extends OpenLayersMockObject {
  getType(): string {
    return 'LineString';
  }
}

export class Polygon extends OpenLayersMockObject {
  getType(): string {
    return 'Polygon';
  }
}

export class Circle extends OpenLayersMockObject {
  getType(): string {
    return 'Circle';
  }
}

export class Style extends OpenLayersMockObject {}
export class Fill extends OpenLayersMockObject {}
export class Stroke extends OpenLayersMockObject {}
export class Text extends OpenLayersMockObject {}
export class Icon extends OpenLayersMockObject {}
export class Overlay extends OpenLayersMockObject {}
export class XYZ extends OpenLayersMockObject {}
export class MVT extends OpenLayersMockObject {}

export const fromLonLat = (coordinates: unknown): unknown => coordinates;
export const toLonLat = (coordinates: unknown): unknown => coordinates;
export const createEmpty = (): number[] => [];
export const extend = (extent: unknown): unknown => extent;
export const isEmpty = (extent: unknown): boolean => {
  void extent;
  return false;
};

export default OpenLayersMockObject;
