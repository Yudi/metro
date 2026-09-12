import { PLATFORM_ID, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DEFAULT_CITY, TransitCity } from '@metro/shared/cities';
import { CityContextService } from '../../../cities/city-context.service';
import { MapViewStateStorageService, SavedMapViewState } from './map-view-state-storage.service';

const state: SavedMapViewState = {
  center: [-46, -23], zoom: 13, displayMode: 'selected',
  nearbyCenter: null, nearbyRadius: 1000, layers: {}, vectorLayers: {},
  selections: { routeIds: ['route'], stopIds: [], bikeStationIds: [] },
};

describe('city map view persistence', () => {
  const city = signal<TransitCity>(DEFAULT_CITY);
  let storage: MapViewStateStorageService;
  let records: Map<string, SavedMapViewState>;

  beforeEach(() => {
    city.set(DEFAULT_CITY);
    TestBed.configureTestingModule({ providers: [
      { provide: PLATFORM_ID, useValue: 'server' },
      { provide: CityContextService, useValue: { city, id: () => city().id } },
    ] });
    storage = TestBed.inject(MapViewStateStorageService);
    records = new Map([['last:sp', state]]);
    Object.defineProperty(storage, 'db', { value: { mapViewStates: {
      get: async (key: string) => records.get(key),
      put: async (value: SavedMapViewState & { key: string }) => records.set(value.key, value),
    } } });
  });

  it('isolates saved views by city', async () => {
    expect(await storage.readLastState()).toEqual(state);
    city.set({ ...DEFAULT_CITY, id: 'other-city' });
    expect(await storage.hasLastState()).toBe(false);
    expect(await storage.readLastState()).toBeNull();
    storage.saveLastState({ ...state, center: [10, 20] });
    expect((await storage.readLastState())?.center).toEqual([10, 20]);
    city.set(DEFAULT_CITY);
    expect((await storage.readLastState())?.center).toEqual([-46, -23]);
  });

  it('uses the selected city map defaults when resetting', () => {
    city.set({ ...DEFAULT_CITY, id: 'other-city', map: {
      center: { latitude: 20, longitude: 10 }, zoom: 8,
    } });
    expect(storage.getDefaultQueryParams()).toMatchObject({ lat: '20', lon: '10', z: '8' });
  });
});
