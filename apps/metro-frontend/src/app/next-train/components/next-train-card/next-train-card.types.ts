import type {
  DirectionHeadway,
  RailScheduledDeparture,
  RailScheduledService,
} from '@metro/shared/utils';
import type { TrainCompositionView } from '@metro/shared/train-composition';
import type { NextTrainArrival } from '../../next-train.types';

export type ScheduledDepartureForDisplay = RailScheduledDeparture;

export interface NextTrainDisplay {
  readonly time: string;
  readonly location: string;
  readonly isAtPlatform: boolean;
  readonly statusClass: string;
  readonly scheduled: boolean;
}

export interface FollowingTrainDisplay {
  readonly key: string;
  readonly label: string;
  readonly tooltip: string;
  readonly isAtPlatform: boolean;
  readonly scheduled: boolean;
}

export interface TrainDirectionView {
  readonly terminal: string;
  readonly nextTrain: NextTrainArrival | undefined;
  readonly followingTrains: readonly NextTrainArrival[];
  readonly headway: DirectionHeadway | undefined;
  readonly nextScheduledService?: RailScheduledService;
  readonly scheduledIntervalLabel?: string;
  readonly followingScheduledDepartures?: readonly ScheduledDepartureForDisplay[];
  readonly nextDisplay?: NextTrainDisplay;
  readonly followingDisplays?: readonly FollowingTrainDisplay[];
  readonly composition: TrainCompositionView | undefined;
}

export interface NextTrainCardViewModel {
  readonly directions: readonly TrainDirectionView[];
  readonly loading: boolean;
  readonly processing: boolean;
  readonly hasApiError: boolean;
  readonly operationClosed: boolean;
  readonly outOfSchedule: boolean;
  readonly hasLiveTrains: boolean;
  readonly showSchedule: boolean;
}
