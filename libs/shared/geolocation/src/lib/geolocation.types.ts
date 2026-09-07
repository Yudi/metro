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
