export type TrainCarLoadLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface TrainCarOccupancy {
  /** One-based position, in the same order returned by the provider. */
  position: number;
  /** Normalized occupancy level, from empty (0) to full (6). */
  loadLevel: TrainCarLoadLevel;
  /** False when the car is shown from static config without live occupancy. */
  occupancyAvailable?: boolean;
  wheelchairAccessible: boolean;
}
