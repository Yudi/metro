import { defineTrainLinePlatformConfig } from '../../train-platform-config';

export const L1_TRAIN_PLATFORM_CONFIG = defineTrainLinePlatformConfig({
  lineCode: 'L1',
  platforms: {
    TUC: [
      {
        id: 'l1-tuc-towards-tuc',
        direction: { destinationCodes: ['TUC'] },

        disembarkingSide: 'right',
        features: [],
      },
      {
        id: 'l1-tuc-towards-jab',
        direction: { destinationCodes: ['JAB'] },
        disembarkingSide: 'right',
        features: [],
      },
    ],

    PIG: [
      {
        id: 'l1-pig-towards-jab',
        direction: { destinationCodes: ['JAB'] },
        disembarkingSide: 'right',
        features: [],
      },
      {
        id: 'l1-pig-towards-tuc',
        direction: { destinationCodes: ['TUC'] },
        disembarkingSide: 'right',
        features: [],
      },
    ],

    JPA: [
      {
        id: 'l1-jpa-towards-jab',
        direction: { destinationCodes: ['JAB'] },
        disembarkingSide: 'left',
        features: [],
      },
      {
        id: 'l1-jpa-towards-tuc',
        direction: { destinationCodes: ['TUC'] },
        disembarkingSide: 'left',
        features: [],
      },
    ],

    SAN: [
      {
        id: 'l1-san-towards-jab',
        direction: { destinationCodes: ['JAB'] },
        disembarkingSide: 'right',
        features: [],
      },
      {
        id: 'l1-san-towards-tuc',
        direction: { destinationCodes: ['TUC'] },
        disembarkingSide: 'right',
        features: [],
      },
    ],

    CDU: [
      {
        id: 'l1-cdu-towards-jab',
        direction: { destinationCodes: ['JAB'] },
        disembarkingSide: 'right',
        features: [],
      },
      {
        id: 'l1-cdu-towards-tuc',
        direction: { destinationCodes: ['TUC'] },
        disembarkingSide: 'right',
        features: [],
      },
    ],

    TTE: [
      {
        id: 'l1-tte-towards-jab',
        direction: { destinationCodes: ['JAB'] },
        disembarkingSide: 'right',
        features: [],
      },
      {
        id: 'l1-tte-towards-tuc',
        direction: { destinationCodes: ['TUC'] },
        disembarkingSide: 'right',
        features: [],
      },
    ],

    PPQ: [
      {
        id: 'l1-ppq-towards-jab',
        direction: { destinationCodes: ['JAB'] },
        disembarkingSide: 'right',
        features: [],
      },
      {
        id: 'l1-ppq-towards-tuc',
        direction: { destinationCodes: ['TUC'] },
        disembarkingSide: 'right',
        features: [],
      },
    ],

    TRD: [
      {
        id: 'l1-trd-towards-jab',
        direction: { destinationCodes: ['JAB'] },
        disembarkingSide: 'left',
        features: [],
      },
      {
        id: 'l1-trd-towards-tuc',
        direction: { destinationCodes: ['TUC'] },
        disembarkingSide: 'left',
        features: [],
      },
    ],

    LUZ: [
      {
        id: 'l1-luz-towards-jab',
        direction: { destinationCodes: ['JAB'] },
        disembarkingSide: 'right',
        features: [],
      },
      {
        id: 'l1-luz-towards-tuc',
        direction: { destinationCodes: ['TUC'] },
        disembarkingSide: 'right',
        features: [],
      },
    ],

    BTO: [
      {
        id: 'l1-bto-towards-jab',
        direction: { destinationCodes: ['JAB'] },
        disembarkingSide: 'right',
        features: [],
      },
      {
        id: 'l1-bto-towards-tuc',
        direction: { destinationCodes: ['TUC'] },
        disembarkingSide: 'right',
        features: [],
      },
    ],

    PSE: [
      {
        id: 'l1-pse-towards-jab',
        direction: { destinationCodes: ['JAB'] },
        disembarkingSide: 'left',
        features: [],
      },
      {
        id: 'l1-pse-towards-tuc',
        direction: { destinationCodes: ['TUC'] },
        disembarkingSide: 'left',
        features: [],
      },
    ],

    LIB: [
      {
        id: 'l1-lib-towards-jab',
        direction: { destinationCodes: ['JAB'] },
        disembarkingSide: 'right',
        features: [],
      },
      {
        id: 'l1-lib-towards-tuc',
        direction: { destinationCodes: ['TUC'] },
        disembarkingSide: 'right',
        features: [],
      },
    ],

    JQM: [
      {
        id: 'l1-jqm-towards-jab',
        direction: { destinationCodes: ['JAB'] },
        disembarkingSide: 'right',
        features: [],
      },
      {
        id: 'l1-jqm-towards-tuc',
        direction: { destinationCodes: ['TUC'] },
        disembarkingSide: 'right',
        features: [],
      },
    ],

    VGO: [
      {
        id: 'l1-vgo-towards-jab',
        direction: { destinationCodes: ['JAB'] },
        disembarkingSide: 'right',
        features: [],
      },
      {
        id: 'l1-vgo-towards-tuc',
        direction: { destinationCodes: ['TUC'] },
        disembarkingSide: 'right',
        features: [],
      },
    ],

    PSO: [
      {
        id: 'l1-pso-towards-jab',
        direction: { destinationCodes: ['JAB'] },
        disembarkingSide: 'right',
        platformType: 'overlapping',
        features: [],
      },
      {
        id: 'l1-pso-towards-tuc',
        direction: { destinationCodes: ['TUC'] },
        disembarkingSide: 'left',
        platformType: 'overlapping',
        trainFacingSideRelativeToBoarding: 'left',
        features: [],
      },
    ],

    ANR: [
      {
        id: 'l1-anr-towards-jab',
        direction: { destinationCodes: ['JAB'] },
        disembarkingSide: 'left',
        features: [],
      },
      {
        id: 'l1-anr-towards-tuc',
        direction: { destinationCodes: ['TUC'] },
        disembarkingSide: 'left',
        features: [],
      },
    ],

    VMN: [
      {
        id: 'l1-vmn-towards-jab',
        direction: { destinationCodes: ['JAB'] },
        disembarkingSide: 'right',
        features: [],
      },
      {
        id: 'l1-vmn-towards-tuc',
        direction: { destinationCodes: ['TUC'] },
        disembarkingSide: 'right',
        features: [],
      },
    ],

    SCZ: [
      {
        id: 'l1-scz-towards-jab',
        direction: { destinationCodes: ['JAB'] },
        disembarkingSide: 'right',
        features: [],
      },
      {
        id: 'l1-scz-towards-tuc',
        direction: { destinationCodes: ['TUC'] },
        disembarkingSide: 'right',
        features: [],
      },
    ],

    ARV: [
      {
        id: 'l1-arv-towards-jab',
        direction: { destinationCodes: ['JAB'] },
        disembarkingSide: 'right',
        features: [],
      },
      {
        id: 'l1-arv-towards-tuc',
        direction: { destinationCodes: ['TUC'] },
        disembarkingSide: 'right',
        features: [],
      },
    ],

    SAU: [
      {
        id: 'l1-sau-towards-jab',
        direction: { destinationCodes: ['JAB'] },
        disembarkingSide: 'right',
        features: [],
      },
      {
        id: 'l1-sau-towards-tuc',
        direction: { destinationCodes: ['TUC'] },
        disembarkingSide: 'right',
        features: [],
      },
    ],

    JUD: [
      {
        id: 'l1-jud-towards-jab',
        direction: { destinationCodes: ['JAB'] },
        disembarkingSide: 'right',
        features: [],
      },
      {
        id: 'l1-jud-towards-tuc',
        direction: { destinationCodes: ['TUC'] },
        disembarkingSide: 'right',
        features: [],
      },
    ],

    CON: [
      {
        id: 'l1-con-towards-jab',
        direction: { destinationCodes: ['JAB'] },
        disembarkingSide: 'right',
        features: [],
      },
      {
        id: 'l1-con-towards-tuc',
        direction: { destinationCodes: ['TUC'] },
        disembarkingSide: 'right',
        features: [],
      },
    ],

    JAB: [
      {
        id: 'l1-jab-towards-tuc',
        direction: { destinationCodes: ['TUC'] },
        disembarkingSide: 'right',
        features: [],
      },
    ],
  },
});
