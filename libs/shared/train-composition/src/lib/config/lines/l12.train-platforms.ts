import { defineTrainLinePlatformConfig } from '../../train-platform-config';

export const L12_TRAIN_PLATFORM_CONFIG = defineTrainLinePlatformConfig({
  lineCode: 'L12',
  platforms: {
    BAS: [
      // TODO: Não sei
      {
        id: 'l12-bas-towards-cmv',
        platformType: 'both',
        direction: { destinationCodes: ['CMV'] },
        disembarkingSide: 'left',
        directionalFactReview: {
          status: 'unknown',
        },
        features: [],
      },
    ],

    TAT: [
      {
        id: 'l12-tat-towards-cmv',
        platformType: 'island',
        direction: { destinationCodes: ['CMV'] },
        disembarkingSide: 'right',
        features: [],
      },
      {
        id: 'l12-tat-towards-bas',
        platformType: 'island',
        direction: { destinationCodes: ['BAS'] },
        disembarkingSide: 'right',
        directionalFactReview: {
          status: 'reviewed',
          source:
            'https://www.metrocptm.com.br/cptm-tem-linhas-demais-para-poucos-trilhos/',
          lastReviewedAt: '2026-09-04',
        },
        features: [],
      },
    ],

    EGO: [
      {
        id: 'l12-ego-towards-cmv',
        platformType: 'island',
        direction: { destinationCodes: ['CMV'] },
        disembarkingSide: 'right',
        features: [],
      },
      {
        id: 'l12-ego-towards-bas',
        platformType: 'island',
        direction: { destinationCodes: ['BAS'] },
        disembarkingSide: 'right',
        features: [],
      },
    ],

    USL: [
      {
        id: 'l12-usl-towards-cmv',
        platformType: 'island',
        direction: { destinationCodes: ['CMV'] },
        disembarkingSide: 'right',
        features: [
          // Crowdsourced: Tabela Escadinha SP
          {
            id: 'l12-usl-cmv-escalator-up-car-6-door-4',
            type: 'escalator-up',
            label: 'Escada rolante de subida próxima ao carro 6, porta 4',
            anchor: { type: 'door', carPosition: 6, doorPosition: 4 },
          },
        ],
      },
      {
        id: 'l12-usl-towards-bas',
        platformType: 'island',
        direction: { destinationCodes: ['BAS'] },
        disembarkingSide: 'right',
        features: [],
      },
    ],

    ERM: [
      {
        id: 'l12-erm-towards-cmv',
        platformType: 'island',
        direction: { destinationCodes: ['CMV'] },
        disembarkingSide: 'right',
        features: [],
      },
      {
        id: 'l12-erm-towards-bas',
        platformType: 'island',
        direction: { destinationCodes: ['BAS'] },
        disembarkingSide: 'right',
        features: [],
      },
    ],

    SMP: [
      {
        id: 'l12-smp-towards-cmv',
        platformType: 'island',
        direction: { destinationCodes: ['CMV'] },
        disembarkingSide: 'right',
        features: [],
      },
      {
        id: 'l12-smp-towards-bas',
        platformType: 'island',
        direction: { destinationCodes: ['BAS'] },
        disembarkingSide: 'right',
        features: [],
      },
    ],

    JHE: [
      {
        id: 'l12-jhe-towards-cmv',
        platformType: 'island',
        direction: { destinationCodes: ['CMV'] },
        disembarkingSide: 'right',
        features: [],
      },
      {
        id: 'l12-jhe-towards-bas',
        platformType: 'island',
        direction: { destinationCodes: ['BAS'] },
        disembarkingSide: 'right',
        features: [],
      },
    ],

    ITI: [
      {
        id: 'l12-iti-towards-cmv',
        platformType: 'island',
        direction: { destinationCodes: ['CMV'] },
        disembarkingSide: 'right',
        features: [],
      },
      {
        id: 'l12-iti-towards-bas',
        platformType: 'island',
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
        platformType: 'side',
        direction: { destinationCodes: ['CMV'] },
        disembarkingSide: 'left',
        features: [],
      },
      {
        id: 'l12-emf-towards-bas',
        platformType: 'side',
        direction: { destinationCodes: ['BAS'] },
        disembarkingSide: 'left',
        features: [],
      },
    ],

    IQC: [
      {
        id: 'l12-iqc-towards-cmv',
        platformType: 'island',
        direction: { destinationCodes: ['CMV'] },
        disembarkingSide: 'right',
        features: [],
      },
      {
        id: 'l12-iqc-towards-bas',
        platformType: 'island',
        direction: { destinationCodes: ['BAS'] },
        disembarkingSide: 'right',
        features: [],
      },
    ],

    ARC: [
      {
        id: 'l12-arc-towards-cmv',
        platformType: 'island',
        direction: { destinationCodes: ['CMV'] },
        disembarkingSide: 'right',
        features: [],
      },
      {
        id: 'l12-arc-towards-bas',
        platformType: 'island',
        direction: { destinationCodes: ['BAS'] },
        disembarkingSide: 'right',
        features: [],
      },
    ],

    CMV: [
      // TODO: Não sei
      {
        id: 'l12-cmv-towards-bas',
        platformType: 'island',
        direction: { destinationCodes: ['BAS'] },
        disembarkingSide: 'right',
        features: [],
      },
    ],
  },
});
