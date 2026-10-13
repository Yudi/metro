import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { Feature } from 'ol';
import type { Map as OLMap } from 'ol';
import type VectorSource from 'ol/source/Vector';
import { LoggerService } from '@metro/shared/api';
import { GeolocationService } from '@metro/shared/geolocation';
import type {
  DeviceOrientation,
  UserLocation,
} from '@metro/shared/geolocation';
import { UserLocationLayerService } from './user-location-layer.service';

const CACHED_LOCATION: UserLocation = {
  latitude: -23.55,
  longitude: -46.63,
  timestamp: 1_700_000_000_000,
};

describe('UserLocationLayerService', () => {
  let service: UserLocationLayerService;
  let location: ReturnType<typeof signal<UserLocation | null>>;
  let orientation: ReturnType<typeof signal<DeviceOrientation | null>>;
  let tracking: ReturnType<typeof signal<boolean>>;
  let startTracking: jest.MockedFunction<GeolocationService['startTracking']>;
  let stopTracking: jest.MockedFunction<GeolocationService['stopTracking']>;
  let pendingStarts: Array<(success: boolean) => void>;

  function completeStart(index: number, success: boolean): void {
    const resolve = pendingStarts[index];
    if (!resolve) throw new Error(`No pending start request at index ${index}`);
    resolve(success);
  }

  beforeEach(() => {
    location = signal<UserLocation | null>(null);
    orientation = signal<DeviceOrientation | null>(null);
    tracking = signal(false);
    pendingStarts = [];

    startTracking = jest.fn(() => {
      return new Promise<boolean>((resolve) => {
        pendingStarts.push((success) => {
          tracking.set(success);
          if (success && !location()) location.set(CACHED_LOCATION);
          resolve(success);
        });
      });
    });
    stopTracking = jest.fn(() => tracking.set(false));

    TestBed.configureTestingModule({
      providers: [
        UserLocationLayerService,
        {
          provide: GeolocationService,
          useValue: { location, orientation, isTracking: tracking, startTracking, stopTracking },
        },
        { provide: LoggerService, useValue: { debug: jest.fn() } },
      ],
    });
    service = TestBed.inject(UserLocationLayerService);
  });

  it('returns false and stays hidden when geolocation fails to start', async () => {
    const result = service.show();

    expect(service.isVisible()).toBe(true);
    expect(startTracking).toHaveBeenCalledWith({ trackOrientation: true });

    completeStart(0, false);

    await expect(result).resolves.toBe(false);
    expect(service.isVisible()).toBe(false);
    expect(tracking()).toBe(false);
  });

  it('stops a watch that starts after the user disables a pending request', async () => {
    const result = service.show();

    service.stopTracking();
    expect(service.isVisible()).toBe(false);
    expect(stopTracking).toHaveBeenCalledTimes(1);

    completeStart(0, true);

    await expect(result).resolves.toBe(false);
    expect(service.isVisible()).toBe(false);
    expect(tracking()).toBe(false);
    expect(stopTracking).toHaveBeenCalledTimes(2);
  });

  it('reuses a successful in-flight start after an off/on toggle without starting a duplicate watch', async () => {
    const canceledRequest = service.show();
    service.stopTracking();
    const currentRequest = service.show();

    expect(startTracking).toHaveBeenCalledTimes(1);
    completeStart(0, true);

    await expect(canceledRequest).resolves.toBe(false);
    await expect(currentRequest).resolves.toBe(true);
    expect(service.isVisible()).toBe(true);
    expect(tracking()).toBe(true);
    expect(startTracking).toHaveBeenCalledTimes(1);
  });

  it('retries after a canceled request fails instead of leaving the next enable waiting on it', async () => {
    const canceledRequest = service.show();
    service.stopTracking();
    const currentRequest = service.show();

    completeStart(0, false);

    await expect(canceledRequest).resolves.toBe(false);
    expect(startTracking).toHaveBeenCalledTimes(2);

    completeStart(1, true);

    await expect(currentRequest).resolves.toBe(true);
    expect(service.isVisible()).toBe(true);
    expect(tracking()).toBe(true);
    expect(startTracking).toHaveBeenCalledTimes(2);
  });

  it('keeps cached coordinates off the map until the location is enabled', async () => {
    location.set(CACHED_LOCATION);
    tracking.set(true);

    const addedLayers: unknown[] = [];
    const map = {
      addLayer: (layer: unknown) => addedLayers.push(layer),
      removeLayer: jest.fn(),
      getView: () => ({ getZoom: () => 16, on: () => jest.fn() }),
    } as unknown as OLMap;
    service.addToMap(map);

    const layer = addedLayers[0] as { getSource(): VectorSource };
    const source = layer.getSource() as VectorSource & {
      getFeatureById(id: string): Feature | null;
    };
    const features = new Map<string, Feature>();
    source.getFeatureById = jest.fn((id) => features.get(id) ?? null);
    const addFeature = jest.spyOn(source, 'addFeature').mockImplementation((feature) => {
      const id = feature.getId();
      if (id !== undefined) features.set(String(id), feature);
    });
    expect(features.size).toBe(0);

    await expect(service.show()).resolves.toBe(true);

    expect(service.isVisible()).toBe(true);
    expect(addFeature).toHaveBeenCalledTimes(1);
    expect(features.size).toBe(1);
  });
});
