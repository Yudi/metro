import { GbfsClientService } from '../gbfs/gbfs-client.service';
import {
  GbfsPricingPlansData,
  GbfsStationInformationData,
  GbfsStationStatusData,
  GbfsVehicleTypesData,
} from '../gbfs/gbfs-v3.types';
import { BikeApiService } from './bike-api.service';
import { BikePricingService } from './bike-pricing.service';

describe('BikeApiService', () => {
  it('maps GBFS v3 localized stations and ISO timestamps to the public contract', async () => {
    const feeds = {
      station_information: response<GbfsStationInformationData>({
        stations: [
          {
            station_id: '1',
            name: [
              { text: 'Largo da Batata', language: 'pt' },
              { text: 'Largo da Batata', language: 'en' },
            ],
            lat: -23.5668,
            lon: -46.6937,
            address: 'Av. Brigadeiro Faria Lima',
            capacity: null,
          },
        ],
      }),
      station_status: response<GbfsStationStatusData>({
        stations: [
          {
            station_id: '1',
            num_vehicles_available: 4,
            num_vehicles_disabled: 1,
            num_docks_available: 6,
            num_docks_disabled: 2,
            last_reported: '2026-07-26T00:40:29.792Z',
            is_installed: true,
            is_renting: true,
            is_returning: true,
            vehicle_types_available: [
              { vehicle_type_id: 'FIT', count: 3 },
              { vehicle_type_id: 'EFIT', count: 1 },
            ],
          },
        ],
      }),
      vehicle_types: response<GbfsVehicleTypesData>({
        vehicle_types: [
          {
            vehicle_type_id: 'FIT',
            form_factor: 'bicycle',
            propulsion_type: 'human',
            name: [{ text: 'FIT', language: 'pt' }],
          },
          {
            vehicle_type_id: 'EFIT',
            form_factor: 'bicycle',
            propulsion_type: 'electric_assist',
            name: [{ text: 'EFIT', language: 'pt' }],
          },
        ],
      }),
      system_pricing_plans: response<GbfsPricingPlansData>({ plans: [] }),
    };
    const gbfs = {
      fetchFeed: jest.fn((feedName: keyof typeof feeds) =>
        Promise.resolve(feeds[feedName]),
      ),
    } as unknown as GbfsClientService;
    const service = new BikeApiService(gbfs, new BikePricingService());

    const result = await service.fetchStations();

    expect(result.lastUpdated).toBe(1_785_026_257);
    expect(result.stations).toEqual([
      expect.objectContaining({
        stationId: '1',
        name: 'Largo da Batata',
        numBikesAvailable: 4,
        numBikesDisabled: 1,
        status: 'IN_SERVICE',
        lastReported: 1_785_026_429,
        lastReportedIso: '2026-07-26T00:40:29.000Z',
        effectiveCapacity: 10,
        electricBikesAvailable: 1,
        hasElectricBikesAvailable: true,
      }),
    ]);
    expect(result.stations[0].vehicleAvailability).toEqual([
      expect.objectContaining({
        vehicleTypeId: 'EFIT',
        propulsionType: 'electric_assist',
        count: 1,
      }),
      expect.objectContaining({
        vehicleTypeId: 'FIT',
        propulsionType: 'human',
        count: 3,
      }),
    ]);
  });
});

function response<T>(data: T) {
  return {
    last_updated: '2026-07-26T00:37:37Z',
    ttl: 30,
    version: '3.0' as const,
    data,
  };
}
