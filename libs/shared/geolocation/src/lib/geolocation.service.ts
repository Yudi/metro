import {
  Injectable,
  signal,
  computed,
  inject,
  PLATFORM_ID,
  NgZone,
  OnDestroy,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { LoggerService } from '@metro/shared/api';

/** Geolocation permission states */
export type LocationPermissionState =
  | 'prompt'
  | 'granted'
  | 'denied'
  | 'unavailable';

/** User location coordinates */
export interface UserLocation {
  latitude: number;
  longitude: number;
  accuracy?: number;
  altitude?: number | null;
  altitudeAccuracy?: number | null;
  heading?: number | null; // GPS heading (direction of travel)
  speed?: number | null;
  timestamp: number;
}

/** Device orientation data */
export interface DeviceOrientation {
  /** Compass heading in degrees (0-360, 0 = North) */
  heading: number | null;
  /** Whether the heading is absolute (true compass) or relative */
  absolute: boolean;
  timestamp: number;
}

/** Geolocation request options */
export interface GeolocationRequestOptions {
  enableHighAccuracy?: boolean;
  timeout?: number;
  maximumAge?: number;
}

/** Watch options for continuous tracking */
export interface WatchOptions extends GeolocationRequestOptions {
  /** Whether to also track device orientation (compass) */
  trackOrientation?: boolean;
}

const DEFAULT_OPTIONS: GeolocationRequestOptions = {
  enableHighAccuracy: true,
  timeout: 10000,
  maximumAge: 300000, // 5 minutes
};

const WATCH_OPTIONS: GeolocationRequestOptions = {
  enableHighAccuracy: true,
  timeout: 30000,
  maximumAge: 0, // Always get fresh position when watching
};

/**
 * Shared service for managing geolocation permissions and user location.
 *
 * This service centralizes all geolocation logic to ensure consistent
 * permission handling across the application. It supports both one-time
 * location requests and continuous tracking with device orientation.
 */
@Injectable({
  providedIn: 'root',
})
export class GeolocationService implements OnDestroy {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly ngZone = inject(NgZone);
  private readonly logger = inject(LoggerService);

  /** Watch ID for position tracking */
  private watchId: number | null = null;

  /** Device orientation event handler reference */
  private orientationHandler: ((event: DeviceOrientationEvent) => void) | null =
    null;

  /** Current permission state */
  readonly permission = signal<LocationPermissionState>('prompt');

  /** Current user location (null if not available) */
  readonly location = signal<UserLocation | null>(null);

  /** Current device orientation (compass heading) */
  readonly orientation = signal<DeviceOrientation | null>(null);

  /** Whether a location request is currently in progress */
  readonly isRequesting = signal(false);

  /** Whether location tracking is active */
  readonly isTracking = signal(false);

  /** Whether device orientation tracking is active */
  readonly isTrackingOrientation = signal(false);

  /** Whether geolocation is supported in this environment */
  readonly isSupported = computed(() => {
    if (!isPlatformBrowser(this.platformId)) {
      return false;
    }
    return 'geolocation' in navigator;
  });

  /** Whether device orientation is supported */
  readonly isOrientationSupported = computed(() => {
    if (!isPlatformBrowser(this.platformId)) {
      return false;
    }
    return 'DeviceOrientationEvent' in window;
  });

  /** Whether location-based features should be disabled */
  readonly isDisabled = computed(() => {
    const permission = this.permission();
    return permission === 'denied' || permission === 'unavailable';
  });

  /** Human-readable message for current permission state */
  readonly permissionMessage = computed(() => {
    switch (this.permission()) {
      case 'denied':
        return 'Acesso à localização negado. Permita nas configurações do navegador.';
      case 'unavailable':
        return 'Localização não disponível neste dispositivo.';
      case 'granted':
        return 'Localização disponível.';
      case 'prompt':
      default:
        return 'Clique para permitir acesso à sua localização.';
    }
  });

  constructor() {
    this.initializePermissionState();
  }

  ngOnDestroy(): void {
    this.stopTracking();
  }

  /**
   * Initialize the permission state by checking the Permissions API
   * and setting up listeners for permission changes.
   */
  private async initializePermissionState(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) {
      this.permission.set('unavailable');
      return;
    }

    if (!navigator.geolocation) {
      this.permission.set('unavailable');
      return;
    }

    // Check current permission status if the Permissions API is available
    if ('permissions' in navigator) {
      try {
        const result = await navigator.permissions.query({
          name: 'geolocation',
        });

        this.ngZone.run(() => {
          this.permission.set(result.state as LocationPermissionState);
        });

        // Listen for permission changes
        result.addEventListener('change', () => {
          this.ngZone.run(() => {
            this.permission.set(result.state as LocationPermissionState);

            // Clear location if permission is revoked
            if (result.state === 'denied') {
              this.location.set(null);
            }
          });
        });
      } catch {
        // Permissions API not fully supported, keep default 'prompt' state
        this.permission.set('prompt');
      }
    }
  }

  /**
   * Request user's current location.
   *
   * This method will:
   * - Prompt the user for permission if not yet granted
   * - Return the current position if permission is granted
   * - Update the internal permission state based on user response
   *
   * @param options - Optional geolocation request options
   * @returns Promise with the user's location, or null if denied/unavailable
   */
  async requestLocation(
    options: GeolocationRequestOptions = {}
  ): Promise<UserLocation | null> {
    if (!this.isSupported()) {
      this.permission.set('unavailable');
      return null;
    }

    if (this.isRequesting()) {
      return null;
    }

    const mergedOptions = { ...DEFAULT_OPTIONS, ...options };

    this.isRequesting.set(true);

    try {
      const position = await new Promise<GeolocationPosition>(
        (resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: mergedOptions.enableHighAccuracy,
            timeout: mergedOptions.timeout,
            maximumAge: mergedOptions.maximumAge,
          });
        }
      );

      const userLocation: UserLocation = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
        timestamp: position.timestamp,
      };

      this.ngZone.run(() => {
        this.location.set(userLocation);
        this.permission.set('granted');
      });

      return userLocation;
    } catch (error) {
      const geoError = error as GeolocationPositionError;

      this.ngZone.run(() => {
        switch (geoError.code) {
          case GeolocationPositionError.PERMISSION_DENIED:
            this.permission.set('denied');
            break;
          case GeolocationPositionError.POSITION_UNAVAILABLE:
            // Keep current permission state, just log the error
            this.logger.warn('Position unavailable:', geoError.message);
            break;
          case GeolocationPositionError.TIMEOUT:
            // Keep current permission state, just log the error
            this.logger.warn('Position request timed out:', geoError.message);
            break;
        }
      });

      return null;
    } finally {
      this.ngZone.run(() => {
        this.isRequesting.set(false);
      });
    }
  }

  /**
   * Check if permission needs to be requested (is in 'prompt' state)
   * and the user hasn't been prompted yet.
   */
  needsPermissionPrompt(): boolean {
    return this.permission() === 'prompt';
  }

  /**
   * Check if we have a cached location that's still valid.
   *
   * @param maxAge - Maximum age of cached location in milliseconds (default: 5 minutes)
   */
  hasCachedLocation(maxAge = 300000): boolean {
    const loc = this.location();
    if (!loc) return false;

    const age = Date.now() - loc.timestamp;
    return age < maxAge;
  }

  /**
   * Get cached location or request a new one if needed.
   *
   * @param options - Optional geolocation request options
   * @returns Promise with the user's location
   */
  async getLocation(
    options: GeolocationRequestOptions = {}
  ): Promise<UserLocation | null> {
    // If we have a recent cached location, return it
    const maxAge = options.maximumAge ?? DEFAULT_OPTIONS.maximumAge;
    if (this.hasCachedLocation(maxAge)) {
      return this.location();
    }

    // Otherwise, request a fresh location
    return this.requestLocation(options);
  }

  /**
   * Clear the cached location.
   */
  clearLocation(): void {
    this.location.set(null);
  }

  /**
   * Start continuous location tracking.
   *
   * This uses watchPosition to continuously update the user's location.
   * Call stopTracking() when done to conserve battery.
   *
   * @param options - Watch options including whether to track orientation
   * @returns Promise that resolves when tracking starts successfully
   */
  async startTracking(options: WatchOptions = {}): Promise<boolean> {
    if (!this.isSupported()) {
      this.permission.set('unavailable');
      return false;
    }

    if (this.isTracking()) {
      return true; // Already tracking
    }

    const mergedOptions = { ...WATCH_OPTIONS, ...options };

    try {
      // First, request permission with a one-time position request
      const initialLocation = await this.requestLocation(mergedOptions);
      if (!initialLocation) {
        return false;
      }

      // Start watching position
      this.watchId = navigator.geolocation.watchPosition(
        (position) => {
          this.ngZone.run(() => {
            this.updateLocationFromPosition(position);
          });
        },
        (error) => {
          this.ngZone.run(() => {
            this.handleGeolocationError(error);
          });
        },
        {
          enableHighAccuracy: mergedOptions.enableHighAccuracy,
          timeout: mergedOptions.timeout,
          maximumAge: mergedOptions.maximumAge,
        }
      );

      this.isTracking.set(true);

      // Start orientation tracking if requested
      if (options.trackOrientation && this.isOrientationSupported()) {
        this.startOrientationTracking();
      }

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Stop continuous location tracking.
   */
  stopTracking(): void {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }

    this.isTracking.set(false);
    this.stopOrientationTracking();
  }

  /**
   * Start tracking device orientation (compass heading).
   */
  private startOrientationTracking(): void {
    if (!this.isOrientationSupported() || this.isTrackingOrientation()) {
      return;
    }

    // Check if we need to request permission (iOS 13+)
    const requestPermission = (
      DeviceOrientationEvent as unknown as {
        requestPermission?: () => Promise<string>;
      }
    ).requestPermission;

    if (typeof requestPermission === 'function') {
      // iOS 13+ requires permission
      requestPermission()
        .then((response) => {
          if (response === 'granted') {
            this.addOrientationListener();
          }
        })
        .catch((err) => this.logger.error('Orientation permission error', err));
    } else {
      // Non-iOS or older iOS
      this.addOrientationListener();
    }
  }

  /**
   * Add the device orientation event listener.
   */
  private addOrientationListener(): void {
    this.orientationHandler = (event: DeviceOrientationEvent) => {
      this.ngZone.run(() => {
        // Use webkitCompassHeading for iOS, or calculate from alpha for Android
        const webkitHeading = (
          event as DeviceOrientationEvent & { webkitCompassHeading?: number }
        ).webkitCompassHeading;

        let heading: number | null = null;

        if (webkitHeading !== undefined && webkitHeading !== null) {
          // iOS provides compass heading directly
          heading = webkitHeading;
        } else if (event.alpha !== null && event.absolute) {
          // Android with absolute orientation
          // Alpha is rotation around z-axis, 0-360 degrees
          // Convert to compass heading (0 = North)
          heading = (360 - event.alpha) % 360;
        } else if (event.alpha !== null) {
          // Relative orientation (less accurate)
          heading = (360 - event.alpha) % 360;
        }

        this.orientation.set({
          heading,
          absolute: event.absolute,
          timestamp: Date.now(),
        });
      });
    };

    window.addEventListener('deviceorientation', this.orientationHandler, true);
    this.isTrackingOrientation.set(true);
  }

  /**
   * Stop tracking device orientation.
   */
  private stopOrientationTracking(): void {
    if (this.orientationHandler) {
      window.removeEventListener(
        'deviceorientation',
        this.orientationHandler,
        true
      );
      this.orientationHandler = null;
    }
    this.isTrackingOrientation.set(false);
    this.orientation.set(null);
  }

  /**
   * Update location from a GeolocationPosition.
   */
  private updateLocationFromPosition(position: GeolocationPosition): void {
    const userLocation: UserLocation = {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy,
      altitude: position.coords.altitude,
      altitudeAccuracy: position.coords.altitudeAccuracy,
      heading: position.coords.heading,
      speed: position.coords.speed,
      timestamp: position.timestamp,
    };

    this.location.set(userLocation);
    this.permission.set('granted');
  }

  /**
   * Handle geolocation errors.
   */
  private handleGeolocationError(error: GeolocationPositionError): void {
    switch (error.code) {
      case GeolocationPositionError.PERMISSION_DENIED:
        this.permission.set('denied');
        this.stopTracking();
        break;
      case GeolocationPositionError.POSITION_UNAVAILABLE:
        this.logger.warn('Position unavailable:', error.message);
        break;
      case GeolocationPositionError.TIMEOUT:
        this.logger.warn('Position request timed out:', error.message);
        break;
    }
  }
}
