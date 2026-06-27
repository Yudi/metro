import { defineTrainLinePlatformConfig } from '../../train-platform-config';

export const L12_TRAIN_PLATFORM_CONFIG = defineTrainLinePlatformConfig({
  lineCode: 'L12',
  platforms: {
    BAS: [
      // TODO: Não sei
      {
        id: 'l12-bas-towards-cmv',
        direction: { destinationCodes: ['CMV'] },
        disembarkingSide: 'left',
        features: [],
      },
    ],

    TAT: [
      {
        id: 'l12-tat-towards-cmv',
        direction: { destinationCodes: ['CMV'] },
        disembarkingSide: 'right',
        features: [],
      },
      {
        id: 'l12-tat-towards-bas',
        direction: { destinationCodes: ['BAS'] },
        disembarkingSide: 'right',
        features: [],
      },
    ],

    EGO: [
      {
        id: 'l12-ego-towards-cmv',
        direction: { destinationCodes: ['CMV'] },
        disembarkingSide: 'right',
        features: [],
      },
      {
        id: 'l12-ego-towards-bas',
        direction: { destinationCodes: ['BAS'] },
        disembarkingSide: 'right',
        features: [],
      },
    ],

    USL: [
      {
        id: 'l12-usl-towards-cmv',
        direction: { destinationCodes: ['CMV'] },
        disembarkingSide: 'right',
        features: [],
      },
      {
        id: 'l12-usl-towards-bas',
        direction: { destinationCodes: ['BAS'] },
        disembarkingSide: 'right',
        features: [],
      },
    ],

    ERM: [
      {
        id: 'l12-erm-towards-cmv',
        direction: { destinationCodes: ['CMV'] },
        disembarkingSide: 'right',
        features: [],
      },
      {
        id: 'l12-erm-towards-bas',
        direction: { destinationCodes: ['BAS'] },
        disembarkingSide: 'right',
        features: [],
      },
    ],

    SMP: [
      {
        id: 'l12-smp-towards-cmv',
        direction: { destinationCodes: ['CMV'] },
        disembarkingSide: 'right',
        features: [],
      },
      {
        id: 'l12-smp-towards-bas',
        direction: { destinationCodes: ['BAS'] },
        disembarkingSide: 'right',
        features: [],
      },
    ],

    JHE: [
      {
        id: 'l12-jhe-towards-cmv',
        direction: { destinationCodes: ['CMV'] },
        disembarkingSide: 'right',
        features: [],
      },
      {
        id: 'l12-jhe-towards-bas',
        direction: { destinationCodes: ['BAS'] },
        disembarkingSide: 'right',
        features: [],
      },
    ],

    ITI: [
      {
        id: 'l12-iti-towards-cmv',
        direction: { destinationCodes: ['CMV'] },
        disembarkingSide: 'right',
        features: [],
      },
      {
        id: 'l12-iti-towards-bas',
        direction: { destinationCodes: ['BAS'] },
        disembarkingSide: 'right',
        features: [],
      },
    ],

    JRO: [
      {
        id: 'l12-jro-towards-cmv',
        direction: { destinationCodes: ['CMV'] },
        disembarkingSide: 'right',
        features: [],
      },
      {
        id: 'l12-jro-towards-bas',
        direction: { destinationCodes: ['BAS'] },
        disembarkingSide: 'right',
        features: [],
      },
    ],

    EMF: [
      {
        id: 'l12-emf-towards-cmv',
        direction: { destinationCodes: ['CMV'] },
        disembarkingSide: 'left',
        features: [],
      },
      {
        id: 'l12-emf-towards-bas',
        direction: { destinationCodes: ['BAS'] },
        disembarkingSide: 'left',
        features: [],
      },
    ],

    IQC: [
      {
        id: 'l12-iqc-towards-cmv',
        direction: { destinationCodes: ['CMV'] },
        disembarkingSide: 'right',
        features: [],
      },
      {
        id: 'l12-iqc-towards-bas',
        direction: { destinationCodes: ['BAS'] },
        disembarkingSide: 'right',
        features: [],
      },
    ],

    ARC: [
      {
        id: 'l12-arc-towards-cmv',
        direction: { destinationCodes: ['CMV'] },
        disembarkingSide: 'right',
        features: [],
      },
      {
        id: 'l12-arc-towards-bas',
        direction: { destinationCodes: ['BAS'] },
        disembarkingSide: 'right',
        features: [],
      },
    ],

    CMV: [
      // TODO: Não sei
      {
        id: 'l12-cmv-towards-bas',
        direction: { destinationCodes: ['BAS'] },
        disembarkingSide: 'right',
        features: [],
      },
    ],
  },
});
