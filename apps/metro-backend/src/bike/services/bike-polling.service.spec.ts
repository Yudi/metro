import { BikePollingService } from './bike-polling.service';
import type { BikeStationDto } from '../dto/bike.dto';

describe('BikePollingService map revisions', () => {
  it('ignores fetch metadata and order but broadcasts every map-data change', async () => {
    const station = {
      stationId: 'one', latitude: -23.55, longitude: -46.63,
      capacity: 20, effectiveCapacity: 20, numBikesAvailable: 5,
      electricBikesAvailable: 1,
    } as BikeStationDto;
    let stations = [station, { ...station, stationId: 'two' }];
    let fetchedAt = 100;
    const polling = new BikePollingService({
      fetchStations: jest.fn(async () => ({ stations, fetchedAt, lastUpdated: fetchedAt, ttl: 15 })),
    } as never);
    await polling.triggerImmediatePoll();
    const revision = polling.getFullUpdatePayload()?.mapRevision;
    expect(revision).toEqual(expect.any(String));

    fetchedAt = 200;
    stations = [...stations].reverse();
    await polling.triggerImmediatePoll();
    expect(polling.getFullUpdatePayload()?.mapRevision).toBe(revision);
    expect(polling.getDeltaUpdatePayload()).toBeNull();

    for (const change of [
      { latitude: -23.56 }, { longitude: -46.64 }, { numBikesAvailable: 6 },
      { electricBikesAvailable: 2 }, { capacity: null }, { effectiveCapacity: 21 },
    ]) {
      const previous = polling.getMapRevision();
      stations = [{ ...stations[0], ...change }, stations[1]];
      await polling.triggerImmediatePoll();
      expect(polling.getMapRevision()).not.toBe(previous);
      expect(polling.getDeltaUpdatePayload()?.mapRevision).toBe(polling.getMapRevision());
    }

    const previous = polling.getMapRevision();
    stations = [stations[0]];
    await polling.triggerImmediatePoll();
    expect(polling.getMapRevision()).not.toBe(previous);
    expect(polling.getDeltaUpdatePayload()).not.toBeNull();
    await polling.onModuleDestroy();
  });
});
