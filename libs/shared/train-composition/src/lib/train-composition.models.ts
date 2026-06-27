import { StaticRailStation, TrainCarLoadLevel } from '@metro/shared/utils';

export type TrainFacingSideRelativeToBoarding = 'left' | 'right';

export type TrainDisembarkingSide = 'left' | 'right' | 'both';

export type TrainCarMode = 'left' | 'center' | 'right';

export type TrainCarLoadUnavailableReason =
  | 'api-not-supported'
  | 'not-reported';

export type TrainCarLoadStatus =
  | {
      readonly kind: 'available';
      readonly level: TrainCarLoadLevel;
    }
  | {
      readonly kind: 'unavailable';
      readonly reason: TrainCarLoadUnavailableReason;
    };

export interface TrainFormation {
  readonly id: string;
  readonly carCount: number;
  readonly doorsPerCar: number;
}

export type TrainFormationOverride = Partial<
  Pick<TrainFormation, 'carCount' | 'doorsPerCar'>
>;

export type TrainPlatformFeatureType =
  | 'exit'
  | 'stairs'
  | 'escalator-up'
  | 'escalator-down'
  | 'escalator-both'
  | 'elevator'
  | 'transfer';

export type TrainPlatformFeatureAnchor =
  | { readonly type: 'before-first-car' }
  | { readonly type: 'after-last-car' }
  | {
      readonly type: 'door';
      readonly carPosition: number;
      readonly doorPosition: number;
    }
  | {
      readonly type: 'between-doors';
      readonly carPosition: number;
      readonly fromDoorPosition: number;
      readonly toDoorPosition: number;
    }
  | {
      readonly type: 'car';
      readonly carPosition: number;
      /** Visual position along the car, from 0 (front) to 1 (back). */
      readonly positionRatio?: number;
    }
  | {
      readonly type: 'between-cars';
      /** One-based position of the car before the feature. */
      readonly afterCarPosition: number;
    };

export interface TrainPlatformFeature {
  readonly id: string;
  readonly type: TrainPlatformFeatureType;
  /** Brazilian Portuguese label displayed as accessible help text. */
  readonly label: string;
  readonly anchor: TrainPlatformFeatureAnchor;
  readonly targetLine?: {
    readonly code: string;
    readonly name: string;
    readonly color: string;
  };
}

export interface TrainPlatformDirection {
  /**
   * Match at least one destination code or name. Codes are preferred because
   * names can change between providers.
   */
  readonly destinationCodes?: readonly string[];
  readonly destinationNames?: readonly string[];
}

export interface TrainPlatformDirectionConfig {
  readonly id: string;
  readonly direction: TrainPlatformDirection;
  readonly formation?: TrainFormationOverride;
  /** Side relative to the train's direction of travel. */
  readonly disembarkingSide?: TrainDisembarkingSide;
  /** Side where the front of the train appears from the boarding platform. */
  readonly trainFacingSideRelativeToBoarding?: TrainFacingSideRelativeToBoarding;
  readonly features: readonly TrainPlatformFeature[];
  readonly platformType?: 'island' | 'side' | 'overlapping' | 'both';
}

export interface TrainLinePlatformConfig {
  readonly lineCode: string;
  readonly formation: TrainFormation;
  readonly stations: readonly StaticRailStation[];
  readonly platforms: Readonly<
    Record<string, readonly TrainPlatformDirectionConfig[] | undefined>
  >;
}

export interface TrainPlatformConfig extends TrainPlatformDirectionConfig {
  readonly lineCode: string;
  readonly station: StaticRailStation;
  readonly formation: TrainFormation;
}

export interface ResolvedTrainCompositionConfig {
  readonly trainFacingSideRelativeToBoarding?: TrainFacingSideRelativeToBoarding;
  readonly platform?: TrainPlatformConfig;
}

export interface TrainPlatformFeatureView {
  readonly id: string;
  readonly type: TrainPlatformFeatureType;
  readonly label: string;
  readonly anchorType: TrainPlatformFeatureAnchor['type'];
  readonly positionRatio: number;
  readonly targetLine?: {
    readonly code: string;
    readonly name: string;
    readonly color: string;
  };
}

export interface TrainPlatformFeatureStackView {
  readonly positionRatio: number;
  readonly features: readonly TrainPlatformFeatureView[];
}

export interface TrainBetweenCarsFeatureView {
  readonly id: string;
  readonly type: TrainPlatformFeatureType;
  readonly label: string;
  readonly afterCarPosition: number;
  readonly targetLine?: {
    readonly code: string;
    readonly name: string;
    readonly color: string;
  };
}

export interface TrainCarView {
  readonly carPosition: number;
  readonly displayIndex: number;
  readonly mode: TrainCarMode;
  readonly doorCount: number;
  readonly load: TrainCarLoadStatus;
  readonly wheelchairAccessible: boolean;
  readonly features: readonly TrainPlatformFeatureView[];
  readonly featureStacks: readonly TrainPlatformFeatureStackView[];
}

export interface TrainCompositionView {
  readonly stationName: string;
  readonly lineCode: string;
  readonly directionName: string;
  readonly trainFacingSideRelativeToBoarding?: TrainFacingSideRelativeToBoarding;
  readonly disembarkingSide?: TrainDisembarkingSide;
  readonly hasLiveOccupancy: boolean;
  readonly cars: readonly TrainCarView[];
  readonly betweenCarsFeatures: readonly TrainBetweenCarsFeatureView[];
  readonly leftExtremityFeatures: readonly TrainPlatformFeatureView[];
  readonly rightExtremityFeatures: readonly TrainPlatformFeatureView[];
}
