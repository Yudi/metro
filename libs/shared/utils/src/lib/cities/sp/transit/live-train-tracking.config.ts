import type { LiveTrainTrackingApiId } from '../../../transit/search.utils';
import { TRIVIATRENS_LIVE_DATA_ENABLED } from './transit-agency.utils';

export const LIVE_TRAIN_TRACKING_API_ORDER: LiveTrainTrackingApiId[] = [
  'api3',
  'api2',
  'api1',
];

export const LIVE_TRAIN_TRACKING_APIS_BY_LINE_CODE: Partial<
  Record<number, LiveTrainTrackingApiId[]>
> = {
  4: ['api3', 'api1'],
  8: ['api2'],
  9: ['api2'],
  10: ['api1'],
  11: TRIVIATRENS_LIVE_DATA_ENABLED ? ['api1'] : [],
  12: TRIVIATRENS_LIVE_DATA_ENABLED ? ['api1'] : [],
  13: TRIVIATRENS_LIVE_DATA_ENABLED ? ['api1'] : [],
};
