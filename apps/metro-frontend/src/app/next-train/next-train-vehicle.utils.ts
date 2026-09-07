import type { TrackedRailVehicle } from '@metro/shared/utils';

export function isRenderableTrackedRailVehicle(
  value: unknown,
): value is TrackedRailVehicle {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const vehicle = value as Partial<TrackedRailVehicle>;
  const latitude = vehicle.lat;
  const longitude = vehicle.lng;
  return (
    typeof vehicle.id === 'string' &&
    typeof vehicle.prefix === 'string' &&
    Boolean(vehicle.id || vehicle.prefix) &&
    typeof latitude === 'number' &&
    Number.isFinite(latitude) &&
    typeof longitude === 'number' &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180 &&
    (vehicle.estimated === undefined ||
      typeof vehicle.estimated === 'boolean') &&
    (vehicle.validUntil === undefined || Number.isFinite(vehicle.validUntil)) &&
    (vehicle.destination === undefined ||
      typeof vehicle.destination === 'string') &&
    (vehicle.estimatedPositionDescription === undefined ||
      typeof vehicle.estimatedPositionDescription === 'string')
  );
}
