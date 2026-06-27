import { defineTrainLinePlatformConfig } from '../../train-platform-config';

/** Line 4 car ordering is normalized before rendering. */
export const L4_TRAIN_PLATFORM_CONFIG = defineTrainLinePlatformConfig({
  lineCode: 'L4',
  platforms: {
    LUZ: [
      {
        id: 'l4-luz-towards-vls',
        direction: { destinationCodes: ['VLS'] },
        disembarkingSide: 'right',
        trainFacingSideRelativeToBoarding: 'right',
        features: [],
      },
      {
        id: 'l4-luz-towards-luz',
        direction: { destinationCodes: ['LUZ'] },
        disembarkingSide: 'right',
        trainFacingSideRelativeToBoarding: 'right',
        features: [],
      },
    ],
    REP: [
      {
        id: 'l4-rep-towards-vls',
        direction: { destinationCodes: ['VLS'] },
        disembarkingSide: 'right',
        trainFacingSideRelativeToBoarding: 'right',
        features: [],
      },
      {
        id: 'l4-rep-towards-luz',
        direction: { destinationCodes: ['LUZ'] },
        disembarkingSide: 'right',
        trainFacingSideRelativeToBoarding: 'right',
        features: [],
      },
    ],
    HGN: [
      {
        id: 'l4-hgn-towards-vls',
        direction: { destinationCodes: ['VLS'] },
        disembarkingSide: 'right',
        trainFacingSideRelativeToBoarding: 'right',
        features: [],
      },
      {
        id: 'l4-hgn-towards-luz',
        direction: { destinationCodes: ['LUZ'] },
        disembarkingSide: 'right',
        trainFacingSideRelativeToBoarding: 'right',
        features: [],
      },
    ],
    PAU: [
      {
        id: 'l4-pau-towards-vls',
        direction: { destinationCodes: ['VLS'] },
        disembarkingSide: 'right',
        trainFacingSideRelativeToBoarding: 'right',
        features: [],
      },
      {
        id: 'l4-pau-towards-luz',
        direction: { destinationCodes: ['LUZ'] },
        disembarkingSide: 'right',
        trainFacingSideRelativeToBoarding: 'right',
        features: [],
      },
    ],
    OCR: [
      {
        id: 'l4-ocr-towards-vls',
        direction: { destinationCodes: ['VLS'] },
        disembarkingSide: 'right',
        trainFacingSideRelativeToBoarding: 'right',
        features: [],
      },
      {
        id: 'l4-ocr-towards-luz',
        direction: { destinationCodes: ['LUZ'] },
        disembarkingSide: 'right',
        trainFacingSideRelativeToBoarding: 'right',
        features: [],
      },
    ],
    FRD: [
      {
        id: 'l4-frd-towards-vls',
        direction: { destinationCodes: ['VLS'] },
        disembarkingSide: 'right',
        trainFacingSideRelativeToBoarding: 'right',
        features: [],
      },
      {
        id: 'l4-frd-towards-luz',
        direction: { destinationCodes: ['LUZ'] },
        disembarkingSide: 'right',
        trainFacingSideRelativeToBoarding: 'right',
        features: [],
      },
    ],
    FLM: [
      {
        id: 'l4-flm-towards-vls',
        direction: { destinationCodes: ['VLS'] },
        disembarkingSide: 'right',
        trainFacingSideRelativeToBoarding: 'right',
        features: [],
      },
      {
        id: 'l4-flm-towards-luz',
        direction: { destinationCodes: ['LUZ'] },
        disembarkingSide: 'right',
        trainFacingSideRelativeToBoarding: 'right',
        features: [],
      },
    ],
    PIH: [
      {
        id: 'l4-pih-towards-vls',
        direction: { destinationCodes: ['VLS'] },
        disembarkingSide: 'right',
        trainFacingSideRelativeToBoarding: 'right',
        features: [],
      },
      {
        id: 'l4-pih-towards-luz',
        direction: { destinationCodes: ['LUZ'] },
        disembarkingSide: 'right',
        trainFacingSideRelativeToBoarding: 'right',
        features: [],
      },
    ],
    BUT: [
      {
        id: 'l4-but-towards-vls',
        direction: { destinationCodes: ['VLS'] },
        disembarkingSide: 'right',
        trainFacingSideRelativeToBoarding: 'right',
        features: [],
      },
      {
        id: 'l4-but-towards-luz',
        direction: { destinationCodes: ['LUZ'] },
        disembarkingSide: 'right',
        trainFacingSideRelativeToBoarding: 'right',
        features: [],
      },
    ],
    SPM: [
      {
        id: 'l4-spm-towards-vls',
        direction: { destinationCodes: ['VLS'] },
        disembarkingSide: 'right',
        trainFacingSideRelativeToBoarding: 'right',
        features: [],
      },
      {
        id: 'l4-spm-towards-luz',
        direction: { destinationCodes: ['LUZ'] },
        disembarkingSide: 'right',
        trainFacingSideRelativeToBoarding: 'right',
        features: [],
      },
    ],
    VLS: [
      {
        id: 'l4-vls-towards-vls',
        direction: { destinationCodes: ['VLS'] },
        disembarkingSide: 'right',
        trainFacingSideRelativeToBoarding: 'right',
        features: [],
      },
      {
        id: 'l4-vls-towards-luz',
        direction: { destinationCodes: ['LUZ'] },
        disembarkingSide: 'right',
        trainFacingSideRelativeToBoarding: 'right',
        features: [],
      },
    ],
  },
});
