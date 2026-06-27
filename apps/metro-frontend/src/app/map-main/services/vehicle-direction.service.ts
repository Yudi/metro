import { Injectable } from '@angular/core';
import type { Coordinate } from 'ol/coordinate';
import { fromLonLat } from 'ol/proj';

interface VehicleTrackState {
  projected: Coordinate;
  lon: number;
  lat: number;
  timestamp: number;
  heading?: number;
}

export interface VehicleDirectionResult {
  heading: number | null;
  /**
   * Indicates whether a fresh heading value was computed for the latest sample.
   */
  hasNewHeading: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class VehicleDirectionService {
  /**
   * Minimum displacement (in meters) required to recompute heading. Anything below is treated as GPS jitter.
   */
  private static readonly MIN_MOVEMENT_METERS = 5;

  private readonly vehicleStates = new Map<number, VehicleTrackState>();

  /**
   * Update the heading inferred for a vehicle based on its latest reported coordinates.
   */
  updateDirection(
    vehicleId: number,
    longitude: number,
    latitude: number,
    isoTimestamp: string
  ): VehicleDirectionResult {
    const timestamp = this.parseTimestamp(isoTimestamp);
    const projected = fromLonLat([longitude, latitude]);

    const currentState = this.vehicleStates.get(vehicleId);

    if (!currentState) {
      this.vehicleStates.set(vehicleId, {
        projected,
        lon: longitude,
        lat: latitude,
        timestamp,
      });

      return {
        heading: null,
        hasNewHeading: false,
      };
    }

    // If we receive an out-of-order update, return the last known heading without mutating state.
    if (timestamp < currentState.timestamp) {
      return {
        heading: currentState.heading ?? null,
        hasNewHeading: false,
      };
    }

    const deltaX = projected[0] - currentState.projected[0];
    const deltaY = projected[1] - currentState.projected[1];
    const displacement = Math.hypot(deltaX, deltaY);

    let heading = currentState.heading;
    let hasNewHeading = false;

    if (displacement >= VehicleDirectionService.MIN_MOVEMENT_METERS) {
      heading = Math.atan2(deltaY, deltaX);
      hasNewHeading = true;
    }

    this.vehicleStates.set(vehicleId, {
      projected,
      lon: longitude,
      lat: latitude,
      timestamp,
      heading,
    });

    return {
      heading: heading ?? null,
      hasNewHeading,
    };
  }

  /**
   * Remove cached track information for vehicles not present in the latest data snapshot.
   */
  cleanupStaleVehicles(activeVehicleIds: Set<number>): void {
    for (const vehicleId of Array.from(this.vehicleStates.keys())) {
      if (!activeVehicleIds.has(vehicleId)) {
        this.vehicleStates.delete(vehicleId);
      }
    }
  }

  /**
   * Clear all cached direction data.
   */
  reset(): void {
    this.vehicleStates.clear();
  }

  private parseTimestamp(isoTimestamp: string): number {
    const parsed = Date.parse(isoTimestamp);
    return Number.isNaN(parsed) ? Date.now() : parsed;
  }
}
