import { Injectable, Logger } from '@nestjs/common';
import { PositionResponse } from '../dto/realtime.dto';

@Injectable()
export class VehicleDirectionBackendService {
  private readonly logger = new Logger(VehicleDirectionBackendService.name);
  private static readonly MIN_MOVEMENT_METERS = 5;

  // Track last known state for each vehicle
  private vehicleStates = new Map<
    number,
    {
      lon: number;
      lat: number;
      timestamp: number;
      heading?: number;
    }
  >();

  /**
   * Compute heading for all vehicles in a PositionResponse, mutating the objects in-place.
   * Adds a `heading` property to each VehiclePosition.
   */
  addHeadingsToPositionResponse(response: PositionResponse): void {
    for (const line of response.l || []) {
      for (const vehicle of line.vs || []) {
        const heading = this.updateDirection(
          vehicle.p,
          vehicle.px,
          vehicle.py,
          vehicle.ta
        );
        if (heading !== null) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (vehicle as any).heading = heading;
        }
      }
    }
  }

  /**
   * Update the heading for a vehicle based on its latest coordinates.
   * Returns heading in radians, or null if not enough movement.
   */
  updateDirection(
    vehicleId: number,
    longitude: number,
    latitude: number,
    isoTimestamp: string
  ): number | null {
    const timestamp = Date.parse(isoTimestamp);
    if (Number.isNaN(timestamp)) return null;

    const currentState = this.vehicleStates.get(vehicleId);
    if (!currentState) {
      this.vehicleStates.set(vehicleId, {
        lon: longitude,
        lat: latitude,
        timestamp,
      });
      return null;
    }
    if (timestamp < currentState.timestamp) {
      return currentState.heading ?? null;
    }

    // Approximate meters per degree latitude/longitude
    const metersPerDegreeLat = 111320;
    const metersPerDegreeLon =
      (40075000 * Math.cos((latitude * Math.PI) / 180)) / 360;
    const deltaX = (longitude - currentState.lon) * metersPerDegreeLon;
    const deltaY = (latitude - currentState.lat) * metersPerDegreeLat;
    const displacement = Math.hypot(deltaX, deltaY);

    let heading = currentState.heading;
    if (displacement >= VehicleDirectionBackendService.MIN_MOVEMENT_METERS) {
      heading = Math.atan2(deltaY, deltaX);
    }

    this.vehicleStates.set(vehicleId, {
      lon: longitude,
      lat: latitude,
      timestamp,
      heading,
    });
    return heading ?? null;
  }

  /**
   * Optionally clear stale vehicles if needed (not used in polling context).
   */
  cleanupStaleVehicles(activeVehicleIds: Set<number>): void {
    for (const vehicleId of Array.from(this.vehicleStates.keys())) {
      if (!activeVehicleIds.has(vehicleId)) {
        this.vehicleStates.delete(vehicleId);
      }
    }
  }

  reset(): void {
    this.vehicleStates.clear();
  }
}
