import type { GeolocationRequestOptions } from './geolocation.types';

export const DEFAULT_OPTIONS: GeolocationRequestOptions = {
  enableHighAccuracy: true,
  timeout: 10000,
  maximumAge: 300000, // 5 minutes
};

export const WATCH_OPTIONS: GeolocationRequestOptions = {
  enableHighAccuracy: true,
  timeout: 30000,
  maximumAge: 0, // Always get fresh position when watching
};
