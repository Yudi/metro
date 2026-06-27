import { Injectable, inject, effect } from '@angular/core';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import { Feature } from 'ol';
import { Map as OLMap } from 'ol';
import { Point, Circle as CircleGeom } from 'ol/geom';
import { fromLonLat } from 'ol/proj';
import { Style, Fill, Stroke, Circle as CircleStyle, Icon } from 'ol/style';
import { GeolocationService } from '@metro/shared/geolocation';
import { LoggerService } from '@metro/shared/api';

/** Z-index for user location layer (above most features but below popups) */
// const USER_LOCATION_Z_INDEX = 1000;
const USER_LOCATION_Z_INDEX = 10;

/** Minimum zoom level to show accuracy circle */
const MIN_ZOOM_FOR_ACCURACY = 14;

/** User location dot colors (Apple Maps style blue) */
const LOCATION_DOT_COLOR = '#007AFF';
const LOCATION_DOT_BORDER_COLOR = '#FFFFFF';
const ACCURACY_CIRCLE_COLOR = 'rgba(0, 122, 255, 0.15)';
const ACCURACY_CIRCLE_BORDER_COLOR = 'rgba(0, 122, 255, 0.3)';

/**
 * Service that manages displaying the user's current location on the map.
 *
 * Features:
 * - Blue dot showing current position (Apple Maps style)
 * - Direction indicator showing device orientation (compass heading)
 * - Accuracy circle that's visible only at appropriate zoom levels
 * - Live updates as the user moves
 */
@Injectable({
  providedIn: 'root',
})
export class UserLocationLayerService {
  private readonly geolocationService = inject(GeolocationService);
  private readonly logger = inject(LoggerService);

  private map: OLMap | null = null;
  private layer: VectorLayer<VectorSource> | null = null;
  private source: VectorSource | null = null;

  /** Feature IDs */
  private readonly ACCURACY_CIRCLE_ID = 'user-location-accuracy';
  private readonly LOCATION_DOT_ID = 'user-location-dot';
  private readonly DIRECTION_CONE_ID = 'user-location-direction';

  /** Current zoom level */
  private currentZoom: number | null = null;

  /** Whether the location layer should be visible */
  private isVisible = false;

  /** SVG for direction cone indicator */
  private readonly directionConeSvg = this.createDirectionConeSvg();

  constructor() {
    // Set up effect to update location on map when it changes
    effect(() => {
      const location = this.geolocationService.location();
      const orientation = this.geolocationService.orientation();

      if (location && this.source && this.isVisible) {
        this.updateLocationFeatures(location, orientation?.heading ?? null);
      }
    });
  }

  /**
   * Add the user location layer to the map.
   */
  addToMap(map: OLMap): void {
    if (this.layer) {
      this.removeFromMap();
    }

    this.map = map;
    this.source = new VectorSource();

    this.layer = new VectorLayer({
      source: this.source,
      zIndex: USER_LOCATION_Z_INDEX,
      updateWhileAnimating: true,
      updateWhileInteracting: true,
    });

    map.addLayer(this.layer);

    // Track zoom level changes
    map.getView().on('change:resolution', () => {
      this.currentZoom = map.getView().getZoom() ?? null;
      this.updateAccuracyCircleVisibility();
    });

    this.currentZoom = map.getView().getZoom() ?? null;

    // If we already have a location, show it
    const location = this.geolocationService.location();
    if (location) {
      const orientation = this.geolocationService.orientation();
      this.updateLocationFeatures(location, orientation?.heading ?? null);
    }

    this.logger.debug('User location layer added to map');
  }

  /**
   * Remove the user location layer from the map.
   */
  removeFromMap(): void {
    if (this.layer && this.map) {
      this.map.removeLayer(this.layer);
    }
    this.layer = null;
    this.source = null;
    this.map = null;
  }

  /**
   * Start tracking and displaying user location.
   */
  async startTracking(): Promise<boolean> {
    this.isVisible = true;
    const success = await this.geolocationService.startTracking({
      trackOrientation: true,
    });

    if (success) {
      this.logger.info('User location tracking started');
      // Immediately show location if available
      const location = this.geolocationService.location();
      if (location) {
        const orientation = this.geolocationService.orientation();
        this.updateLocationFeatures(location, orientation?.heading ?? null);
      }
    }

    return success;
  }

  /**
   * Stop tracking user location and hide features.
   */
  stopTracking(): void {
    this.geolocationService.stopTracking();
    this.hide();
    this.logger.info('User location tracking stopped');
  }

  /**
   * Show the user location layer (starts tracking if not already).
   */
  async show(): Promise<boolean> {
    this.isVisible = true;

    // Start geolocation tracking if not already
    if (!this.geolocationService.isTracking()) {
      return this.geolocationService.startTracking({ trackOrientation: true });
    }

    // If already have location, show it
    const location = this.geolocationService.location();
    if (location && this.source) {
      const orientation = this.geolocationService.orientation();
      this.updateLocationFeatures(location, orientation?.heading ?? null);
    }

    return true;
  }

  /**
   * Hide the user location layer without stopping tracking.
   */
  hide(): void {
    this.isVisible = false;
    this.clearFeatures();
  }

  /**
   * Check if tracking is currently active.
   */
  isTracking(): boolean {
    return this.geolocationService.isTracking();
  }

  /**
   * Center the map on the user's current location.
   * If location is not available, requests it first.
   * @returns true if centered successfully, false if location unavailable
   */
  async centerOnUser(zoom?: number): Promise<boolean> {
    let location = this.geolocationService.location();

    // If no location, request it first
    if (!location) {
      const result = await this.geolocationService.requestLocation();
      if (!result) {
        this.logger.warn('Could not get user location for centering');
        return false;
      }
      location = result;
    }

    if (!this.map) return false;

    const view = this.map.getView();
    view.animate({
      center: fromLonLat([location.longitude, location.latitude]),
      zoom: zoom ?? view.getZoom(),
      duration: 500,
    });

    return true;
  }

  /**
   * Update all location features on the map.
   */
  private updateLocationFeatures(
    location: {
      latitude: number;
      longitude: number;
      accuracy?: number;
    },
    heading: number | null,
  ): void {
    if (!this.source) return;

    const coordinates = fromLonLat([location.longitude, location.latitude]);

    // Update or create accuracy circle
    this.updateAccuracyCircle(coordinates, location.accuracy);

    // Update or create direction cone
    this.updateDirectionCone(coordinates, heading);

    // Update or create location dot (on top)
    this.updateLocationDot(coordinates);
  }

  /**
   * Update the accuracy circle feature.
   */
  private updateAccuracyCircle(
    coordinates: number[],
    accuracy: number | undefined,
  ): void {
    if (!this.source || !accuracy) return;

    let feature = this.source.getFeatureById(
      this.ACCURACY_CIRCLE_ID,
    ) as Feature | null;

    // Calculate radius in map units (meters at the equator, adjusted for latitude)
    const radiusInMeters = accuracy;

    if (!feature) {
      // Create new feature
      const circle = new CircleGeom(coordinates, radiusInMeters);
      feature = new Feature({
        geometry: circle,
        name: 'accuracy-circle',
      });
      feature.setId(this.ACCURACY_CIRCLE_ID);
      feature.setStyle(this.createAccuracyCircleStyle());
      this.source.addFeature(feature);
    } else {
      // Update existing feature
      const geom = feature.getGeometry() as CircleGeom;
      geom.setCenter(coordinates);
      geom.setRadius(radiusInMeters);
    }

    this.updateAccuracyCircleVisibility();
  }

  /**
   * Update accuracy circle visibility based on zoom level.
   */
  private updateAccuracyCircleVisibility(): void {
    if (!this.source) return;

    const feature = this.source.getFeatureById(
      this.ACCURACY_CIRCLE_ID,
    ) as Feature | null;
    if (!feature) return;

    const geom = feature.getGeometry() as CircleGeom | null;
    if (!geom) return;

    const radiusInMeters = geom.getRadius();
    const zoom = this.currentZoom ?? 0;

    // Calculate if the circle would be meaningfully visible at current zoom
    // At zoom 14, roughly 10m per pixel, so 100m radius = 10px
    // Show circle if it would be at least 20px radius on screen
    const metersPerPixel = this.getMetersPerPixel(zoom);
    const radiusInPixels = radiusInMeters / metersPerPixel;

    // Show if radius is between 20px and 200px (reasonable visual range)
    const shouldShow =
      radiusInPixels >= 20 &&
      radiusInPixels <= 200 &&
      zoom >= MIN_ZOOM_FOR_ACCURACY;

    const currentStyle = feature.getStyle();
    if (shouldShow && !currentStyle) {
      feature.setStyle(this.createAccuracyCircleStyle());
    } else if (!shouldShow && currentStyle) {
      feature.setStyle(undefined);
    }
  }

  /**
   * Get approximate meters per pixel at a given zoom level.
   */
  private getMetersPerPixel(zoom: number): number {
    // At zoom 0, the whole world (40075km) fits in 256px
    // Each zoom level doubles the resolution
    const worldWidthMeters = 40075016.686;
    const tileSize = 256;
    return worldWidthMeters / (tileSize * Math.pow(2, zoom));
  }

  /**
   * Update the direction cone feature.
   */
  private updateDirectionCone(
    coordinates: number[],
    heading: number | null,
  ): void {
    if (!this.source) return;

    let feature = this.source.getFeatureById(
      this.DIRECTION_CONE_ID,
    ) as Feature | null;

    if (heading === null) {
      // No heading available, remove cone if exists
      if (feature) {
        this.source.removeFeature(feature);
      }
      return;
    }

    if (!feature) {
      // Create new feature
      feature = new Feature({
        geometry: new Point(coordinates),
        name: 'direction-cone',
      });
      feature.setId(this.DIRECTION_CONE_ID);
      this.source.addFeature(feature);
    } else {
      // Update position
      (feature.getGeometry() as Point).setCoordinates(coordinates);
    }

    // Update style with rotation
    feature.setStyle(this.createDirectionConeStyle(heading));
  }

  /**
   * Update the location dot feature.
   */
  private updateLocationDot(coordinates: number[]): void {
    if (!this.source) return;

    let feature = this.source.getFeatureById(
      this.LOCATION_DOT_ID,
    ) as Feature | null;

    if (!feature) {
      // Create new feature
      feature = new Feature({
        geometry: new Point(coordinates),
        name: 'location-dot',
      });
      feature.setId(this.LOCATION_DOT_ID);
      feature.setStyle(this.createLocationDotStyle());
      this.source.addFeature(feature);
    } else {
      // Update position
      (feature.getGeometry() as Point).setCoordinates(coordinates);
    }
  }

  /**
   * Clear all location features from the map.
   */
  private clearFeatures(): void {
    if (!this.source) return;
    this.source.clear();
  }

  /**
   * Create style for the accuracy circle.
   */
  private createAccuracyCircleStyle(): Style {
    return new Style({
      fill: new Fill({
        color: ACCURACY_CIRCLE_COLOR,
      }),
      stroke: new Stroke({
        color: ACCURACY_CIRCLE_BORDER_COLOR,
        width: 1,
      }),
    });
  }

  /**
   * Create style for the location dot.
   */
  private createLocationDotStyle(): Style {
    return new Style({
      image: new CircleStyle({
        radius: 8,
        fill: new Fill({
          color: LOCATION_DOT_COLOR,
        }),
        stroke: new Stroke({
          color: LOCATION_DOT_BORDER_COLOR,
          width: 3,
        }),
      }),
    });
  }

  /**
   * Create style for the direction cone.
   */
  private createDirectionConeStyle(heading: number): Style {
    return new Style({
      image: new Icon({
        src: this.directionConeSvg,
        scale: 1,
        rotation: (heading * Math.PI) / 180, // Convert degrees to radians
        rotateWithView: false,
        anchor: [0.5, 0.5],
        anchorXUnits: 'fraction',
        anchorYUnits: 'fraction',
      }),
    });
  }

  /**
   * Create an SVG data URL for the direction cone.
   */
  private createDirectionConeSvg(): string {
    // Create a cone/wedge shape pointing up (will be rotated by heading)
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="60" height="60" viewBox="0 0 60 60">
        <defs>
          <linearGradient id="coneGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" style="stop-color:rgba(0,122,255,0.6);stop-opacity:1" />
            <stop offset="100%" style="stop-color:rgba(0,122,255,0);stop-opacity:1" />
          </linearGradient>
        </defs>
        <path d="M30,30 L15,5 A25,25 0 0,1 45,5 Z" fill="url(#coneGradient)" />
      </svg>
    `;

    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg.trim());
  }
}
