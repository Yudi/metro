import Dexie, { Transaction, Version } from 'dexie';
import { MapViewStateDatabase } from './map-view-state.database';

describe('map view database upgrade', () => {
  it('moves bike visibility into vector layers and removes legacy flags for every saved city', async () => {
    let upgrade: (transaction: Transaction) => unknown = () => undefined;
    const version: { stores: jest.Mock; upgrade: jest.Mock } = {
      stores: jest.fn(() => version),
      upgrade: jest.fn((callback: typeof upgrade) => { upgrade = callback; return version; }),
    };
    const versionSpy = jest.spyOn(Dexie.prototype, 'version').mockReturnValue(version as unknown as Version);
    const db = new MapViewStateDatabase();
    try {
      expect(versionSpy.mock.calls).toEqual([[1], [2]]);
      const view = { center: [-46, -23], zoom: 13, updatedAt: 42,
        selections: { routeIds: ['route-1'], stopIds: ['stop-1'], bikeStationIds: ['bike-1'] } };
      const records: Array<typeof view & {
        key: string;
        layers?: { bike?: boolean };
        vectorLayers: Record<string, boolean>;
      }> = [
        { ...view, key: 'last:sp', layers: { bike: true }, vectorLayers: { 'bus-stops': false } },
        { ...view, key: 'last:other', layers: { bike: false }, vectorLayers: {} },
        { ...view, key: 'last:current', layers: { bike: true }, vectorLayers: { 'bike-stations': false } },
      ];
      const table = jest.fn(() => ({ toCollection: () => ({
        modify: async (modify: (record: typeof records[number]) => void) => records.forEach(modify),
      }) }));
      await upgrade({ table } as unknown as Transaction);
      expect(table).toHaveBeenCalledWith('mapViewStates');
      expect(records.map((record) => record.vectorLayers['bike-stations'])).toEqual([true, false, false]);
      expect(records[0].vectorLayers['bus-stops']).toBe(false);
      for (const record of records) {
        expect(record).not.toHaveProperty('layers');
        expect(record).toMatchObject(view);
      }
    } finally {
      db.close();
      versionSpy.mockRestore();
    }
  });
});
