import { isPlatformBrowser } from '@angular/common';
import {
  PLATFORM_ID,
  Service,
  effect,
  inject,
  OnDestroy,
  signal,
} from '@angular/core';
import { Feature } from 'ol';
import { Point } from 'ol/geom';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import { Style, Icon, Text, Fill, Stroke } from 'ol/style';
import { fromLonLat } from 'ol/proj';
import { LoggerService } from '@metro/shared/api';
import {
  getRailLineByCode,
  hasExternalRailVehicles,
  type TrackedRailLineCode,
  type TrackedRailVehicle,
} from '@metro/shared/utils';
import {
  NextTrainWebsocketService,
  type NextTrainSubscriptionRelease,
} from './next-train-websocket.service';

/** Service to manage tracked rail vehicle markers on the map. */
@Service()
export class CptmVehicleLayerService implements OnDestroy {
  private readonly nextTrainService = inject(NextTrainWebsocketService);
  private readonly logger = inject(LoggerService);
  private readonly platformId = inject(PLATFORM_ID);
  private vehicleLayer: VectorLayer<VectorSource> | null = null;
  private readonly vehicleSource = new VectorSource();
  private renderedVehiclesMap: Map<
    TrackedRailLineCode,
    TrackedRailVehicle[]
  > | null = null;

  /** Offset for direction arrow from train center (in pixels at resolution 1). */
  private readonly directionAnchorOffsetPixels = 14;

  /** Currently subscribed tracked rail lines. */
  private readonly subscribedLines = signal<Set<TrackedRailLineCode>>(
    new Set(),
  );

  /** Upstream releases owned by this map layer. */
  private readonly subscriptionReleases = new Map<
    TrackedRailLineCode,
    NextTrainSubscriptionRelease
  >();

  /** Browser-only timer for the next render-ready estimate deadline. */
  private estimateExpiryTimer: number | undefined;

  /** Pre-created icons for each tracked rail line. */
  private readonly lineIcons: Record<TrackedRailLineCode, Icon>;

  constructor() {
    this.lineIcons = {
      L4: this.createLineIcon(getRailLineByCode(4)?.colorHex ?? '#007A5E'),
      L8: this.createLineIcon(getRailLineByCode(8)?.colorHex ?? '#969696'),
      L9: this.createLineIcon(getRailLineByCode(9)?.colorHex ?? '#00A78E'),
      L10: this.createLineIcon(
        getRailLineByCode(10)?.colorHex ?? '#007A5E',
      ),
      L11: this.createLineIcon(
        getRailLineByCode(11)?.colorHex ?? '#007A5E',
      ),
      L12: this.createLineIcon(
        getRailLineByCode(12)?.colorHex ?? '#007A5E',
      ),
      L13: this.createLineIcon(
        getRailLineByCode(13)?.colorHex ?? '#007A5E',
      ),
      EA: this.createLineIcon('#000000'),
      '10X': this.createLineIcon(
        getRailLineByCode(10)?.colorHex ?? '#007A5E',
      ),
    };

    this.setupLayer();
    this.watchForUpdates();
  }

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

  private setupLayer(): void {
    this.vehicleLayer = new VectorLayer({
      source: this.vehicleSource,
      style: (feature, resolution) => {
        const lineCode = feature.get('lineCode') as TrackedRailLineCode;
        const estimated = feature.get('estimatedPosition') === true;
        const destination = feature.get('destination') as string | undefined;
        const bearing = feature.get('bearing') as number | undefined;
        return this.createVehicleStyle(
          lineCode,
          estimated ? undefined : destination,
          estimated ? undefined : bearing,
          resolution,
          estimated,
        );
      },
      zIndex: 1001,
      visible: true,
      opacity: 1,
      properties: { name: 'cptm-vehicles' },
    });
  }

  private createVehicleStyle(
    lineCode: TrackedRailLineCode,
    destination?: string,
    bearing?: number,
    resolution?: number,
    estimated = false,
  ): Style[] {
    const styles: Style[] = [];

    // Estimated records intentionally pass no bearing. Actual marker styling
    // retains the existing direction arrow, including bearing 0.
    if (!estimated && bearing != null && resolution != null) {
      const bearingRad = bearing * (Math.PI / 180);
      const mathAngle = Math.PI / 2 - bearingRad;
      const anchorOffset = this.directionAnchorOffsetPixels * resolution;

      styles.push(
        new Style({
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
        }),
      );
    }

    styles.push(new Style({ image: this.lineIcons[lineCode] }));

    const label = estimated ? 'Localização estimada' : destination;
    if (label) {
      const lineCodeNumber = parseInt(lineCode.replace('L', ''), 10);
      let fillColor = getRailLineByCode(lineCodeNumber)?.colorHex ?? '#000';
      if (lineCodeNumber === 4) {
        fillColor = '#004C40';
      }

      styles.push(
        new Style({
          text: new Text({
            text: label,
            offsetY: 22,
            font: 'bold 9px sans-serif',
            fill: new Fill({ color: fillColor }),
            stroke: new Stroke({ color: '#fff', width: 2 }),
          }),
        }),
      );
    }

    return styles;
  }

  private watchForUpdates(): void {
    effect(() => {
      const vehiclesMap = this.nextTrainService.cptmVehicles();
      const connected = this.nextTrainService.connected();
      this.updateVehicleMarkers(vehiclesMap, connected);
    });
  }

  private updateVehicleMarkers(
    vehiclesMap: Map<TrackedRailLineCode, TrackedRailVehicle[]>,
    connected = this.nextTrainService.connected(),
  ): void {
    // Preserve actual feature instances while only estimate validity changes.
    if (this.renderedVehiclesMap !== vehiclesMap) {
      this.removeActualMarkers();
      for (const [lineCode, vehicles] of vehiclesMap) {
        for (const vehicle of vehicles) {
          if (vehicle.estimated === true) {
            continue;
          }
          this.vehicleSource.addFeature(
            this.createActualFeature(lineCode, vehicle),
          );
        }
      }
      this.renderedVehiclesMap = vehiclesMap;
    }

    this.removeEstimatedMarkers();
    let totalVehicles = this.vehicleSource.getFeatures().length;
    if (connected) {
      totalVehicles += this.addEstimatedMarkers(vehiclesMap);
    }
    this.scheduleEstimateExpiry(vehiclesMap, connected);

    if (totalVehicles > 0) {
      this.logger.debug(
        `Updated ${totalVehicles} tracked rail markers on map for ${vehiclesMap.size} lines`,
      );
    }
  }

  private createActualFeature(
    lineCode: TrackedRailLineCode,
    vehicle: TrackedRailVehicle,
  ): Feature {
    const feature = new Feature({
      geometry: new Point(fromLonLat([vehicle.lng, vehicle.lat])),
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
    feature.setId(`cptm-vehicle-${lineCode}-${vehicle.id || vehicle.prefix}`);
    return feature;
  }

  private addEstimatedMarkers(
    vehiclesMap: ReadonlyMap<TrackedRailLineCode, TrackedRailVehicle[]>,
  ): number {
    const now = Date.now();
    let count = 0;

    for (const [lineCode, vehicles] of vehiclesMap) {
      if (!this.subscribedLines().has(lineCode)) {
        continue;
      }
      for (const vehicle of vehicles) {
        if (
          vehicle.estimated !== true ||
          !this.isValidEstimatedVehicle(vehicle, now)
        ) {
          continue;
        }

        const vehicleId = vehicle.id || vehicle.prefix;
        const feature = new Feature({
          geometry: new Point(fromLonLat([vehicle.lng, vehicle.lat])),
          vehicleId,
          lineCode,
          estimatedPosition: true,
        });
        feature.setId(`cptm-vehicle-${lineCode}-${vehicleId}`);
        this.vehicleSource.addFeature(feature);
        count++;
      }
    }

    return count;
  }

  private isValidEstimatedVehicle(
    vehicle: TrackedRailVehicle,
    now: number,
  ): boolean {
    return (
      Number.isFinite(vehicle.lat) &&
      Number.isFinite(vehicle.lng) &&
      vehicle.lat >= -90 &&
      vehicle.lat <= 90 &&
      vehicle.lng >= -180 &&
      vehicle.lng <= 180 &&
      Number.isFinite(vehicle.validUntil) &&
      (vehicle.validUntil as number) > now
    );
  }

  subscribeToLine(lineCode: TrackedRailLineCode): void {
    if (!hasExternalRailVehicles(lineCode)) {
      this.logger.debug(`No vehicle tracking available for line ${lineCode}`);
      return;
    }
    if (this.subscribedLines().has(lineCode)) {
      return;
    }

    const release =
      this.nextTrainService.subscribeToCptmVehicles(lineCode) ??
      (() => this.nextTrainService.unsubscribeFromCptmVehicles(lineCode));
    this.subscriptionReleases.set(lineCode, release);
    this.subscribedLines.update((set) => new Set([...set, lineCode]));
    this.logger.debug(`Subscribed to tracked rail vehicles for line ${lineCode}`);
  }

  unsubscribeFromLine(lineCode: TrackedRailLineCode): void {
    if (!this.subscribedLines().has(lineCode)) {
      return;
    }

    const release = this.subscriptionReleases.get(lineCode);
    this.subscriptionReleases.delete(lineCode);
    release?.();
    this.removeMarkersForLine(lineCode);
    this.subscribedLines.update((set) => {
      const next = new Set(set);
      next.delete(lineCode);
      return next;
    });
    this.updateVehicleMarkers(
      this.nextTrainService.cptmVehicles(),
      this.nextTrainService.connected(),
    );
    this.logger.debug(
      `Unsubscribed from tracked rail vehicles for line ${lineCode}`,
    );
  }

  isLineSubscribed(lineCode: TrackedRailLineCode): boolean {
    return this.subscribedLines().has(lineCode);
  }

  getLayer(): VectorLayer<VectorSource> | null {
    return this.vehicleLayer;
  }

  getVehicleCount(): number {
    return this.vehicleSource.getFeatures().length;
  }

  clearVehicles(): void {
    this.clearEstimateExpiryTimer();
    this.vehicleSource.clear();
    this.renderedVehiclesMap = null;
  }

  ngOnDestroy(): void {
    for (const lineCode of [...this.subscribedLines()]) {
      this.unsubscribeFromLine(lineCode);
    }
    this.clearEstimateExpiryTimer();
    this.vehicleSource.clear();
    this.renderedVehiclesMap = null;
  }

  private removeActualMarkers(): void {
    for (const feature of this.vehicleSource.getFeatures()) {
      if (feature.get('estimatedPosition') !== true) {
        this.vehicleSource.removeFeature(feature);
      }
    }
  }

  private removeEstimatedMarkers(): void {
    for (const feature of this.vehicleSource.getFeatures()) {
      if (feature.get('estimatedPosition') === true) {
        this.vehicleSource.removeFeature(feature);
      }
    }
  }

  private removeMarkersForLine(lineCode: TrackedRailLineCode): void {
    for (const feature of this.vehicleSource.getFeatures()) {
      if (feature.get('lineCode') === lineCode) {
        this.vehicleSource.removeFeature(feature);
      }
    }
  }

  private scheduleEstimateExpiry(
    vehiclesMap: ReadonlyMap<TrackedRailLineCode, TrackedRailVehicle[]>,
    connected: boolean,
  ): void {
    this.clearEstimateExpiryTimer();
    if (
      !connected ||
      !isPlatformBrowser(this.platformId) ||
      this.subscriptionReleases.size === 0
    ) {
      return;
    }

    const now = Date.now();
    let nextExpiry = Number.POSITIVE_INFINITY;
    for (const [lineCode, vehicles] of vehiclesMap) {
      if (!this.subscribedLines().has(lineCode)) {
        continue;
      }
      for (const vehicle of vehicles) {
        if (
          vehicle.estimated === true &&
          Number.isFinite(vehicle.validUntil) &&
          (vehicle.validUntil as number) > now
        ) {
          nextExpiry = Math.min(nextExpiry, (vehicle.validUntil as number) + 1);
        }
      }
    }

    if (nextExpiry !== Number.POSITIVE_INFINITY) {
      this.estimateExpiryTimer = window.setTimeout(() => {
        this.updateVehicleMarkers(
          this.nextTrainService.cptmVehicles(),
          this.nextTrainService.connected(),
        );
      }, Math.max(1, nextExpiry - now));
    }
  }

  private clearEstimateExpiryTimer(): void {
    if (this.estimateExpiryTimer === undefined) {
      return;
    }
    if (isPlatformBrowser(this.platformId)) {
      window.clearTimeout(this.estimateExpiryTimer);
    }
    this.estimateExpiryTimer = undefined;
  }
}
