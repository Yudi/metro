import { Injectable, inject, effect } from '@angular/core';
import { Feature } from 'ol';
import { Point } from 'ol/geom';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import { Style, Icon, Text, Fill, Stroke } from 'ol/style';
import {
  RealtimeWebsocketService,
  VehiclePositionUpdate,
} from './realtime-websocket.service';
import { fromLonLat } from 'ol/proj';
import { LoggerService } from '@metro/shared/api';
import { MapStateService } from '../components/map/map-state.service';

/**
 * Service to manage real-time vehicle markers on the map
 */
@Injectable({
  providedIn: 'root',
})
export class RealtimeVehicleLayerService {
  private realtimeService = inject(RealtimeWebsocketService);
  private mapState = inject(MapStateService);
  private logger = inject(LoggerService);
  private vehicleLayer: VectorLayer<VectorSource> | null = null;
  private vehicleSource = new VectorSource();
  private iconCache = new Map<string, Icon>();

  private readonly fallbackRouteColor = '#1976d2';

  constructor() {
    this.setupLayer();
    this.watchForUpdates();
  }

  /**
   * Create the vehicle layer with proper styling
   */
  private setupLayer(): void {
    this.vehicleLayer = new VectorLayer({
      source: this.vehicleSource,
      style: (feature, resolution) => {
        const isAccessible = feature.get('accessible') as boolean;
        const vehicleId = feature.get('vehicleId') as number;
        const heading = feature.get('heading') as number | null;
        const destination = feature.get('destination') as string | undefined;
        const routeShortName = feature.get('routeShortName') as string;
        const routeColor = feature.get('routeColor') as string;

        return this.createVehicleStyle(
          isAccessible,
          vehicleId,
          heading,
          resolution,
          routeShortName,
          routeColor,
          destination,
        );
      },
      zIndex: 1000, // Above routes and stops
      visible: true,
      opacity: 1,
      properties: {
        name: 'realtime-vehicles',
      },
    });
  }

  /**
   * Create style for a vehicle marker
   */
  private readonly directionIconSrc = 'icons/bus-direction2.svg';
  private readonly directionScale = 0.75;
  private readonly directionAnchorOffsetPixels = 12;

  private createVehicleStyle(
    isAccessible: boolean,
    vehicleId: number,
    heading: number | null,
    resolution: number,
    routeShortName: string,
    routeColor: string,
    destination?: string,
  ): Style[] {
    const iconStyle = new Style({
      image: this.getBusIcon(isAccessible, routeColor),
    });

    // Add destination and line labels under the icon.
    // Based on sl field: sl=1 shows lt0 (secondary terminal), sl=2 shows lt1 (main terminal)
    let directionTextStyle: Style | null = null;
    if (destination || routeShortName) {
      // Truncate long destination names to avoid overlap
      const truncatedDest =
        destination && destination.length > 30
          ? destination.substring(0, 30) + '...'
          : destination;
      const labelLines = [
        truncatedDest,
        routeShortName ? `${routeShortName}` : null,
      ].filter((line): line is string => Boolean(line));

      directionTextStyle = new Style({
        text: new Text({
          text: labelLines.join('\n'),
          offsetY: 20,
          font: 'bold 9px sans-serif',
          fill: new Fill({ color: routeColor }),
          stroke: new Stroke({ color: '#fff', width: 2 }),
        }),
      });
    }

    if (heading == null) {
      return directionTextStyle ? [iconStyle, directionTextStyle] : [iconStyle];
    }

    // Don't display direction arrow, as it's unreliable. Keep code for reference.

    /* 
    const directionStyle = new Style({
      geometry: (feature) => {
        const center = (feature.getGeometry() as Point).getCoordinates();
        const cos = Math.cos(heading);
        const sin = Math.sin(heading);

        return new Point([
          center[0] + cos * anchorOffset,
          center[1] + sin * anchorOffset,
        ]);
      },
      image: new Icon({
        src: this.directionIconSrc,
        scale: this.directionScale,
        anchor: [0.5, 1],
        anchorXUnits: 'fraction',
        anchorYUnits: 'fraction',
        rotateWithView: true,
        rotation: heading,
      }),
    });

    // Draw the triangle first so the bus icon sits on top of the base.
    return directionTextStyle
      ? [directionStyle, iconStyle, directionTextStyle]
      : [directionStyle, iconStyle]; 

    */

    return directionTextStyle ? [iconStyle, directionTextStyle] : [iconStyle];
  }

  /**
   * Watch for real-time updates and update markers
   */
  private watchForUpdates(): void {
    effect(() => {
      const positions = this.realtimeService.vehiclePositions();
      this.updateVehicleMarkers(positions);
    });
  }

  /**
   * Update vehicle markers on the map
   */
  private updateVehicleMarkers(
    positions: Map<string, VehiclePositionUpdate>,
  ): void {
    // Clear existing markers
    this.vehicleSource.clear();

    let totalVehicles = 0;
    const activeVehicleIds = new Set<number>();

    // Add new markers for all tracked vehicles
    for (const [routeShortName, data] of positions) {
      for (const line of data.l || []) {
        for (const vehicle of line.vs || []) {
          // Convert lat/lon to map coordinates
          const coordinates = fromLonLat([vehicle.px, vehicle.py]);

          // Determine destination based on direction (sl field)
          // sl = 1: going to secondary terminal (lt0)
          // sl = 2: going to main terminal (lt1)
          const destination = line.sl === 1 ? line.lt0 : line.lt1;
          const routeColor = this.getRouteColor(routeShortName, line.c);

          const feature = new Feature({
            geometry: new Point(coordinates),
            vehicleId: vehicle.p,
            routeShortName,
            routeCode: line.c,
            accessible: vehicle.a,
            timestamp: vehicle.ta,
            destination,
            routeColor,
            origin: line.lt1,
            direction: line.sl,
            latitude: vehicle.py,
            longitude: vehicle.px,
            heading: vehicle.heading ?? null,
          });

          feature.setId(`vehicle-${vehicle.p}`);
          this.vehicleSource.addFeature(feature);
          totalVehicles++;
          activeVehicleIds.add(vehicle.p);
        }
      }
    }

    if (totalVehicles > 0) {
      this.logger.debug(
        `Updated ${totalVehicles} vehicle markers on map for ${positions.size} routes`,
      );
    }
  }

  /**
   * Get the vehicle layer to add to the map
   */
  getLayer(): VectorLayer<VectorSource> | null {
    return this.vehicleLayer;
  }

  /**
   * Get vehicle count
   */
  getVehicleCount(): number {
    return this.vehicleSource.getFeatures().length;
  }

  /**
   * Clear all vehicle markers
   */
  clearVehicles(): void {
    this.vehicleSource.clear();
  }

  private getRouteColor(routeShortName: string, routeCode: string): string {
    const matchingRoute = Array.from(
      this.mapState.selectedRoutes().values(),
    ).find(
      (route) =>
        route.shortName === routeShortName ||
        route.shortName === routeCode ||
        route.id === routeShortName ||
        route.id === routeCode,
    );

    return this.normalizeHexColor(matchingRoute?.color);
  }

  private getBusIcon(isAccessible: boolean, routeColor: string): Icon {
    const cacheKey = `${isAccessible ? 'accessible' : 'standard'}:${routeColor}`;
    const cachedIcon = this.iconCache.get(cacheKey);

    if (cachedIcon) {
      return cachedIcon;
    }

    const icon = new Icon({
      src: this.createBusIconDataUrl(routeColor),
      scale: 0.75,
      anchor: [0.5, 0.5],
      anchorXUnits: 'fraction',
      anchorYUnits: 'fraction',
    });

    this.iconCache.set(cacheKey, icon);
    return icon;
  }

  private createBusIconDataUrl(routeColor: string): string {
    const innerColor = this.lightenHexColor(routeColor, 0.82);
    const svg = `<svg width="32" height="32" enable-background="new 0 0 32 32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><circle cx="16" cy="16" fill="${routeColor}" opacity=".3" r="15"/><circle cx="16" cy="16" fill="${innerColor}" r="13" stroke="#fff" stroke-width="2"/><path d="m10.4 24.9c-.3 0-.5-.1-.7-.3s-.3-.4-.3-.6v-2c-.3-.3-.5-.7-.7-1s-.3-.8-.3-1.3v-8.9c0-1.3.6-2.2 1.8-2.8s3.1-.9 5.7-.9c2.7 0 4.6.3 5.8.9s1.7 1.5 1.7 2.9v8.9c0 .5-.1.9-.3 1.3s-.4.7-.7 1v1.9c0 .3-.1.5-.3.7s-.4.3-.7.3h-.9c-.3 0-.5-.1-.7-.3s-.3-.4-.3-.7v-1h-7.5v1c0 .3-.1.5-.3.7s-.4.3-.7.3h-.6zm0-10.3h11.2v-2.8h-11.2zm2.3 5.6c.4 0 .7-.1 1-.4s.4-.6.4-1-.1-.7-.4-1-.6-.4-1-.4-.7.1-1 .4-.4.6-.4 1 .1.7.4 1 .6.4 1 .4zm6.6 0c.4 0 .7-.1 1-.4s.4-.6.4-1-.1-.7-.4-1-.6-.4-1-.4-.7.1-1 .4-.4.6-.4 1 .1.7.4 1 .6.4 1 .4z" fill="#1f1f1f"/></svg>`;

    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  }

  private normalizeHexColor(color: string | undefined): string {
    if (!color) {
      return this.fallbackRouteColor;
    }

    const normalizedColor = color.startsWith('#') ? color : `#${color}`;

    return /^#[0-9a-fA-F]{6}$/.test(normalizedColor)
      ? normalizedColor
      : this.fallbackRouteColor;
  }

  private lightenHexColor(color: string, amount: number): string {
    const red = Number.parseInt(color.slice(1, 3), 16);
    const green = Number.parseInt(color.slice(3, 5), 16);
    const blue = Number.parseInt(color.slice(5, 7), 16);

    const lightenChannel = (channel: number) =>
      Math.round(channel + (255 - channel) * amount);

    return `#${[red, green, blue]
      .map((channel) => lightenChannel(channel).toString(16).padStart(2, '0'))
      .join('')}`;
  }
}
