import { RealtimeMessageType } from './dto/realtime.dto';
import type {
  PositionResponse,
  StopArrivalResponse,
  StopArrivalUpdate,
  VehiclePositionUpdate,
} from './dto/realtime.dto';

export type PositionCacheEntry = [
  string,
  { data: PositionResponse; timestamp: number },
];

export type StopArrivalCacheEntry = {
  data: StopArrivalResponse;
  timestamp: number;
};

export function buildVehiclePositionsMessage(
  routeShortName: string,
  cacheEntries: PositionCacheEntry[],
): {
  type: RealtimeMessageType.VEHICLE_POSITIONS;
  data: VehiclePositionUpdate;
} {
  const latestTimestamp = Math.max(
    ...cacheEntries.map(([, entry]) => entry.timestamp),
  );

  return {
    type: RealtimeMessageType.VEHICLE_POSITIONS,
    data: {
      routeShortName,
      hr: cacheEntries[0][1].data.hr,
      l: cacheEntries.flatMap(([, entry]) => entry.data.l || []),
      cacheTimestamp: latestTimestamp,
    },
  };
}

export function countVehicles(cacheEntries: PositionCacheEntry[]): number {
  return cacheEntries.reduce(
    (sum, [, entry]) =>
      sum +
      (entry.data.l?.reduce(
        (lineSum, line) => lineSum + (line.vs?.length ?? 0),
        0,
      ) ?? 0),
    0,
  );
}

export function buildStopArrivalMessage(
  stopCode: string,
  cache: StopArrivalCacheEntry,
): {
  type: RealtimeMessageType.ARRIVAL_PREDICTIONS;
  data: StopArrivalUpdate;
} {
  return {
    type: RealtimeMessageType.ARRIVAL_PREDICTIONS,
    data: {
      stopCode,
      ...cache.data,
      cacheTimestamp: cache.timestamp,
    },
  };
}
