import { TrainLinePlatformConfig } from '../train-composition.models';
import { L1_TRAIN_PLATFORM_CONFIG } from './lines/l1.train-platforms';
import { L10_TRAIN_PLATFORM_CONFIG } from './lines/l10.train-platforms';
import { L11_TRAIN_PLATFORM_CONFIG } from './lines/l11.train-platforms';
import { L12_TRAIN_PLATFORM_CONFIG } from './lines/l12.train-platforms';
import { L13_TRAIN_PLATFORM_CONFIG } from './lines/l13.train-platforms';
import { L15_TRAIN_PLATFORM_CONFIG } from './lines/l15.train-platforms';
import { L17_TRAIN_PLATFORM_CONFIG } from './lines/l17.train-platforms';
import { L2_TRAIN_PLATFORM_CONFIG } from './lines/l2.train-platforms';
import { L3_TRAIN_PLATFORM_CONFIG } from './lines/l3.train-platforms';
import { L4_TRAIN_PLATFORM_CONFIG } from './lines/l4.train-platforms';
import { L5_TRAIN_PLATFORM_CONFIG } from './lines/l5.train-platforms';
import { L7_TRAIN_PLATFORM_CONFIG } from './lines/l7.train-platforms';
import { L8_TRAIN_PLATFORM_CONFIG } from './lines/l8.train-platforms';
import { L9_TRAIN_PLATFORM_CONFIG } from './lines/l9.train-platforms';

/**
 * Keep this as a small line-level registry. Station layouts live in their
 * respective line files.
 */
export const TRAIN_PLATFORM_CONFIGS: readonly TrainLinePlatformConfig[] = [
  L1_TRAIN_PLATFORM_CONFIG,
  L2_TRAIN_PLATFORM_CONFIG,
  L3_TRAIN_PLATFORM_CONFIG,
  L4_TRAIN_PLATFORM_CONFIG,
  L5_TRAIN_PLATFORM_CONFIG,
  L7_TRAIN_PLATFORM_CONFIG,
  L8_TRAIN_PLATFORM_CONFIG,
  L9_TRAIN_PLATFORM_CONFIG,
  L10_TRAIN_PLATFORM_CONFIG,
  L11_TRAIN_PLATFORM_CONFIG,
  L12_TRAIN_PLATFORM_CONFIG,
  L13_TRAIN_PLATFORM_CONFIG,
  L15_TRAIN_PLATFORM_CONFIG,
  L17_TRAIN_PLATFORM_CONFIG,
];
