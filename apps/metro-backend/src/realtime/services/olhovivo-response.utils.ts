import {
  LineArrivalResponse,
  PositionResponse,
  StopArrivalResponse,
  VehiclePosition,
} from '../dto/realtime.dto';

export type InvalidVehicleHandler = () => void;

export function normalizePositionResponse(
  response: PositionResponse,
  onInvalidVehicle?: InvalidVehicleHandler,
): PositionResponse {
  return {
    ...response,
    l: (response.l ?? []).map((line) => {
      const vehicles = normalizeVehiclePositions(line.vs, onInvalidVehicle);
      return { ...line, qv: vehicles.length, vs: vehicles };
    }),
  };
}

export function normalizeStopArrivalResponse(
  response: StopArrivalResponse,
  onInvalidVehicle?: InvalidVehicleHandler,
): StopArrivalResponse {
  if (!response.p) {
    return response;
  }

  return {
    ...response,
    p: {
      ...response.p,
      l: (response.p.l ?? []).map((line) => {
        const vehicles = normalizeVehiclePositions(line.vs, onInvalidVehicle);
        return { ...line, qv: vehicles.length, vs: vehicles };
      }),
    },
  };
}

export function normalizeLineArrivalResponse(
  response: LineArrivalResponse,
  onInvalidVehicle?: InvalidVehicleHandler,
): LineArrivalResponse {
  return {
    ...response,
    ps: (response.ps ?? []).map((stop) => ({
      ...stop,
      vs: normalizeVehiclePositions(stop.vs, onInvalidVehicle),
    })),
  };
}

export function normalizeVehiclePositions(
  vehicles: VehiclePosition[] | undefined,
  onInvalidVehicle?: InvalidVehicleHandler,
): VehiclePosition[] {
  return (vehicles ?? []).flatMap((vehicle) => {
    const rawPrefix = (vehicle as { p: unknown }).p;
    if (
      typeof rawPrefix !== 'number' &&
      (typeof rawPrefix !== 'string' || !rawPrefix.trim())
    ) {
      onInvalidVehicle?.();
      return [];
    }

    const prefix = Number(rawPrefix);

    if (!Number.isSafeInteger(prefix) || prefix <= 0) {
      onInvalidVehicle?.();
      return [];
    }

    return [{ ...vehicle, p: prefix }];
  });
}
