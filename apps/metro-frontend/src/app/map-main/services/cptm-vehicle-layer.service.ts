import { Injectable, inject, effect, signal } from '@angular/core';
import { Feature } from 'ol';
import { Point } from 'ol/geom';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import { Style, Icon, Text, Fill, Stroke } from 'ol/style';
import { NextTrainWebsocketService } from './next-train-websocket.service';
import { fromLonLat } from 'ol/proj';
import { LoggerService } from '@metro/shared/api';
import {
  CptmLineCode,
  TrackedRailVehicle,
  getRailLineByCode,
} from '@metro/shared/utils';

/**
 * Service to manage CPTM train vehicle markers on the map
 */
@Injectable({
  providedIn: 'root',
})
export class CptmVehicleLayerService {
  private nextTrainService = inject(NextTrainWebsocketService);
  private logger = inject(LoggerService);
  private vehicleLayer: VectorLayer<VectorSource> | null = null;
  private vehicleSource = new VectorSource();

  /** Offset for direction arrow from train center (in pixels at resolution 1) */
  private readonly directionAnchorOffsetPixels = 14;

  /** Currently subscribed lines */
  private readonly subscribedLines = signal<Set<CptmLineCode>>(new Set());

  /** Pre-created icons for each CPTM line */
  private readonly lineIcons: Record<CptmLineCode, Icon>;

  constructor() {
    // Create icons for each CPTM line
    this.lineIcons = {
      L4: this.createLineIcon(getRailLineByCode(4)?.colorHex ?? '#007A5E'), // Amarela
      L10: this.createLineIcon(getRailLineByCode(10)?.colorHex ?? '#007A5E'), // Turquesa
      L11: this.createLineIcon(getRailLineByCode(11)?.colorHex ?? '#007A5E'), // Coral
      L12: this.createLineIcon(getRailLineByCode(12)?.colorHex ?? '#007A5E'), // Safira
      L13: this.createLineIcon(getRailLineByCode(13)?.colorHex ?? '#007A5E'), // Jade
      EA: this.createLineIcon('#000000'), // Expresso Aeroporto (default to black)
      '10X': this.createLineIcon(getRailLineByCode(10)?.colorHex ?? '#007A5E'), // Expresso Linha 10 (use same color as L10)
    };

    this.setupLayer();
    this.watchForUpdates();
  }

  /**
   * Create an icon for a specific line color
   */
  private createLineIcon(color: string): Icon {
    return new Icon({
      src: '/app/icons/train-marker.svg',
      scale: 1,
      anchor: [0.5, 0.5],
      anchorXUnits: 'fraction',
      anchorYUnits: 'fraction',
      color,
    });
  }

  /**
   * Create the vehicle layer with proper styling
   */
  private setupLayer(): void {
    this.vehicleLayer = new VectorLayer({
      source: this.vehicleSource,
      style: (feature, resolution) => {
        const lineCode = feature.get('lineCode') as CptmLineCode;
        const destination = feature.get('destination') as string | undefined;
        const bearing = feature.get('bearing') as number | undefined;
        return this.createVehicleStyle(
          lineCode,
          destination,
          bearing,
          resolution,
        );
      },
      zIndex: 1001, // Above bus vehicles and routes
      visible: true,
      opacity: 1,
      properties: {
        name: 'cptm-vehicles',
      },
    });
  }

  /**
   * Create style for a CPTM train marker
   */
  private createVehicleStyle(
    lineCode: CptmLineCode,
    destination?: string,
    bearing?: number,
    resolution?: number,
  ): Style[] {
    const styles: Style[] = [];

    // Add direction arrow if bearing is available
    if (bearing != null && resolution != null) {
      // Convert compass bearing (0=N, 90=E, 180=S, 270=W) to math angle for positioning
      // and to radians for icon rotation
      const bearingRad = bearing * (Math.PI / 180);
      // Math angle: π/2 - bearingRad (where 0=E, π/2=N in cartesian)
      const mathAngle = Math.PI / 2 - bearingRad;
      const anchorOffset = this.directionAnchorOffsetPixels * resolution;

      const directionStyle = new Style({
        geometry: (feature) => {
          const center = (feature.getGeometry() as Point).getCoordinates();
          const cos = Math.cos(mathAngle);
          const sin = Math.sin(mathAngle);

          return new Point([
            center[0] + cos * anchorOffset,
            center[1] + sin * anchorOffset,
          ]);
        },
        image: new Icon({
          src: '/app/icons/bus-direction2.svg',
          scale: 0.6,
          anchor: [0.5, 1],
          anchorXUnits: 'fraction',
          anchorYUnits: 'fraction',
          rotateWithView: true,
          rotation: bearingRad,
        }),
      });
      styles.push(directionStyle);
    }

    // Add train icon
    const iconStyle = new Style({
      image: this.lineIcons[lineCode],
    });
    styles.push(iconStyle);

    // Optionally add destination label
    if (destination) {
      const lineCodeNumber = parseInt(lineCode.replace('L', ''));
      let fillColor = `#${getRailLineByCode(lineCodeNumber)?.colorHex ?? '000'}`;

      if (lineCodeNumber === 4) {
        fillColor = '#004C40';
      }

      const textStyle = new Style({
        text: new Text({
          text: destination,
          offsetY: 22,
          font: 'bold 9px sans-serif',
          fill: new Fill({
            color: fillColor,
          }),
          stroke: new Stroke({ color: '#fff', width: 2 }),
        }),
      });
      styles.push(textStyle);
    }

    return styles;
  }

  /**
   * Watch for real-time updates and update markers
   */
  private watchForUpdates(): void {
    effect(() => {
      const vehiclesMap = this.nextTrainService.cptmVehicles();
      this.updateVehicleMarkers(vehiclesMap);
    });
  }

  /**
   * Update vehicle markers on the map
   */
  private updateVehicleMarkers(
    vehiclesMap: Map<CptmLineCode, TrackedRailVehicle[]>,
  ): void {
    // Clear existing markers
    this.vehicleSource.clear();

    let totalVehicles = 0;

    // Add markers for all tracked CPTM lines
    for (const [lineCode, vehicles] of vehiclesMap) {
      for (const vehicle of vehicles) {
        // Convert lat/lon to map coordinates
        const coordinates = fromLonLat([vehicle.lng, vehicle.lat]);

        const feature = new Feature({
          geometry: new Point(coordinates),
          vehicleId: vehicle.prefix,
          lineCode,
          latitude: vehicle.lat,
          longitude: vehicle.lng,
          bearing: vehicle.bearing,
          destination: vehicle.destination,
          accessible: vehicle.wheelchair,
          airconditioned: vehicle.climatized,
          lastUpdate: vehicle.lastUpdate,
          averageSpeed: vehicle.averageSpeed,
        });

        feature.setId(`cptm-vehicle-${lineCode}-${vehicle.prefix}`);
        this.vehicleSource.addFeature(feature);
        totalVehicles++;
      }
    }

    if (totalVehicles > 0) {
      this.logger.debug(
        `Updated ${totalVehicles} CPTM train markers on map for ${vehiclesMap.size} lines`,
      );
    }
  }

  /**
   * Subscribe to vehicle updates for a CPTM line
   */
  subscribeToLine(lineCode: CptmLineCode): void {
    this.nextTrainService.subscribeToCptmVehicles(lineCode);
    this.subscribedLines.update((set) => new Set([...set, lineCode]));
    this.logger.debug(`Subscribed to CPTM vehicles for line ${lineCode}`);
  }

  /**
   * Unsubscribe from vehicle updates for a CPTM line
   */
  unsubscribeFromLine(lineCode: CptmLineCode): void {
    this.nextTrainService.unsubscribeFromCptmVehicles(lineCode);
    this.subscribedLines.update((set) => {
      const newSet = new Set(set);
      newSet.delete(lineCode);
      return newSet;
    });
    this.logger.debug(`Unsubscribed from CPTM vehicles for line ${lineCode}`);
  }

  /**
   * Check if a line is currently subscribed
   */
  isLineSubscribed(lineCode: CptmLineCode): boolean {
    return this.subscribedLines().has(lineCode);
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
}
