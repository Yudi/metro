import type { DirectionHeadway } from '@metro/shared/utils';
import type { TrainCompositionView } from '@metro/shared/train-composition';
import type { NextTrainArrival } from '../../next-train.types';

export interface TrainDirectionView {
  readonly terminal: string;
  readonly nextTrain: NextTrainArrival | undefined;
  readonly followingTrains: readonly NextTrainArrival[];
  readonly headway: DirectionHeadway | undefined;
  readonly composition: TrainCompositionView | undefined;
}

export interface NextTrainCardViewModel {
  readonly directions: readonly TrainDirectionView[];
  readonly loading: boolean;
  readonly processing: boolean;
  readonly hasApiError: boolean;
  readonly operationClosed: boolean;
  readonly outOfSchedule: boolean;
}
