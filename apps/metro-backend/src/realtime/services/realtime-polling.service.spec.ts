import type { BusVehiclePosition } from '@metro/shared/bus-itinerary-contracts';
import { RealtimePollingService } from './realtime-polling.service';

const artespRouteId = 'artesp:route-2148';
const sptransRouteName = '477A-10';
const routeLabel = '125';
const samplePosition: BusVehiclePosition = {
  plate: 'ABC1234',
  latitude: -23.5,
  longitude: -46.6,
  recordedAt: '2026-09-28T12:30:00.000Z',
};

function createService(
  getVehiclePositions: (routeCode: string) => Promise<BusVehiclePosition[]>,
) {
  const line = {
    c: sptransRouteName,
    cl: 1,
    sl: 1,
    lt0: 'Destino A',
    lt1: 'Destino B',
    qv: 0,
    vs: [],
  };
  const api = {
    getAllPositions: jest.fn().mockResolvedValue({ hr: '12:30', l: [line] }),
    getStopArrivals: jest.fn(),
    searchLines: jest.fn(),
  };
  const mapping = {
    getApiStopCode: jest.fn(),
    getArtespRouteShortName: jest.fn().mockResolvedValue(routeLabel),
  };
  const vehicleDirection = {
    addHeadingsToPositionResponse: jest.fn(),
    cleanupStaleVehicles: jest.fn(),
  };
  const client = { getVehiclePositions };
  const service = new RealtimePollingService(
    api as never,
    mapping as never,
    vehicleDirection as never,
    client as never,
  );

  return { service, api, mapping, client };
}

async function waitUntil(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (predicate()) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
}

describe('RealtimePollingService ARTESP positions', () => {
  it('keeps SPTrans polling and cache updates independent while ARTESP is pending', async () => {
    let resolvePositions!: (positions: BusVehiclePosition[]) => void;
    const pendingPositions = new Promise<BusVehiclePosition[]>((resolve) => {
      resolvePositions = resolve;
    });
    const requestedRouteCodes: string[] = [];
    const { service, api } = createService((routeCode) => {
      requestedRouteCodes.push(routeCode);
      return pendingPositions;
    });

    service.subscribeToRoute(artespRouteId);
    service.subscribeToRoute(sptransRouteName);

    try {
      await waitUntil(() =>
        service.getVehiclePositionsCache().has(`${sptransRouteName}-dir1`),
      );
      expect(
        service.getVehiclePositionsCache().has(`${sptransRouteName}-dir1`),
      ).toBe(true);
      expect(api.getAllPositions).toHaveBeenCalled();
      expect(requestedRouteCodes).toEqual([routeLabel]);
      expect(service.getRouteToDirectionsIndex().has(artespRouteId)).toBe(
        false,
      );
    } finally {
      resolvePositions([]);
      await service.onModuleDestroy();
    }
  });

  it('does not cache an in-flight response after the route is unsubscribed', async () => {
    let resolvePositions!: (positions: BusVehiclePosition[]) => void;
    const pendingPositions = new Promise<BusVehiclePosition[]>((resolve) => {
      resolvePositions = resolve;
    });
    const requestedRouteCodes: string[] = [];
    const { service } = createService((routeCode) => {
      requestedRouteCodes.push(routeCode);
      return pendingPositions;
    });

    service.subscribeToRoute(artespRouteId);
    try {
      await waitUntil(() => requestedRouteCodes.length > 0);
      expect(requestedRouteCodes).toEqual([routeLabel]);
      service.unsubscribeFromRoute(artespRouteId);
      resolvePositions([samplePosition]);
      await service.onModuleDestroy();

      expect(service.getRouteToDirectionsIndex().has(artespRouteId)).toBe(
        false,
      );
      expect(
        Array.from(service.getVehiclePositionsCache().values()).some(
          ({ data }) => data.positions?.length,
        ),
      ).toBe(false);
    } finally {
      resolvePositions([]);
      await service.onModuleDestroy();
    }
  });

  it('replaces stale positions with an empty snapshot after an upstream failure', async () => {
    let callCount = 0;
    const { service } = createService(async () => {
      callCount += 1;
      if (callCount === 1) return [samplePosition];
      throw new Error('upstream unavailable');
    });

    service.subscribeToRoute(artespRouteId);
    try {
      await waitUntil(() => {
        const keys = service.getRouteToDirectionsIndex().get(artespRouteId);
        const key = keys ? Array.from(keys)[0] : undefined;
        return (
          key !== undefined &&
          (service.getVehiclePositionsCache().get(key)?.data.positions
            ?.length ?? 0) > 0
        );
      });
      await new Promise<void>((resolve) => setTimeout(resolve, 0));

      await service.triggerImmediateRoutePoll(artespRouteId);

      const keys = service.getRouteToDirectionsIndex().get(artespRouteId);
      const key = keys ? Array.from(keys)[0] : undefined;
      if (!key) throw new Error('ARTESP snapshot cache key was not populated');
      expect(service.getVehiclePositionsCache().get(key)?.data).toMatchObject({
        l: [],
        positions: [],
        routeLabel,
      });
    } finally {
      await service.onModuleDestroy();
    }
  });
});
