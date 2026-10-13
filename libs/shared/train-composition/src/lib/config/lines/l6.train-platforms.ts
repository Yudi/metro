import { defineTrainLinePlatformConfig } from '../../train-platform-config';
import { TrainPlatformDirectionConfig } from '../../train-composition.models';

const L6_DESTINATION_CODES = ['BRA', 'JQM'] as const;

function createSidePlatforms(
  stationCode: string,
): TrainPlatformDirectionConfig[] {
  return L6_DESTINATION_CODES.map((destinationCode) => ({
    id: `l6-${stationCode.toLowerCase()}-towards-${destinationCode.toLowerCase()}`,
    direction: { destinationCodes: [destinationCode] },
    disembarkingSide: 'right',
    platformType: 'side',
    features: [],
  }));
}

export const L6_TRAIN_PLATFORM_CONFIG = defineTrainLinePlatformConfig({
  lineCode: 'L6',
  platforms: {
    BRA: createSidePlatforms('BRA'),
    MTL: createSidePlatforms('MTL'),
    IHP: createSidePlatforms('IHP'),
    JOP: createSidePlatforms('JOP'),
    FGO: createSidePlatforms('FGO'),
    STM: createSidePlatforms('STM'),
    AGB: createSidePlatforms('AGB'),
    SEP: createSidePlatforms('SEP'),
    PDZ: createSidePlatforms('PDZ'),
    PUC: createSidePlatforms('PUC'),
    FAAP: createSidePlatforms('FAAP'),
    HMK: createSidePlatforms('HMK'),
    BIS: createSidePlatforms('BIS'),
    BVT: createSidePlatforms('BVT'),
    JQM: createSidePlatforms('JQM'),
  },
});
