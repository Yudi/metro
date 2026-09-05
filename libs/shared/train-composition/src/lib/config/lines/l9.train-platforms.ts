import { defineTrainLinePlatformConfig } from '../../train-platform-config';

export const L9_TRAIN_PLATFORM_CONFIG = defineTrainLinePlatformConfig({
  lineCode: 'L9',
  platforms: {
    OSA: [
      {
        id: 'l9-osa-towards-vag',
        direction: { destinationCodes: ['VAG'] },
        // TODO: Não sei
        disembarkingSide: 'right',
        directionalFactReview: {
          status: 'unknown',
        },
        platformType: 'island',
        features: [],
      },
      {
        id: 'l9-osa-towards-osa',
        direction: { destinationCodes: ['OSA'] },
        // TODO: Não sei
        disembarkingSide: 'right',
        directionalFactReview: {
          status: 'unknown',
        },
        platformType: 'island',
        features: [],
      },
    ],

    PAL: [
      {
        id: 'l9-pal-towards-vag',
        direction: { destinationCodes: ['VAG'] },
        // TODO: Não sei
        disembarkingSide: 'right',
        directionalFactReview: {
          status: 'unknown',
        },
        platformType: 'island',
        features: [],
      },
      {
        id: 'l9-pal-towards-osa',
        direction: { destinationCodes: ['OSA'] },
        // TODO: Não sei
        disembarkingSide: 'right',
        directionalFactReview: {
          status: 'unknown',
        },
        platformType: 'island',
        features: [],
      },
    ],

    CEA: [
      {
        id: 'l9-cea-towards-vag',
        direction: { destinationCodes: ['VAG'] },
        disembarkingSide: 'left',
        platformType: 'island',
        features: [],
      },
      {
        id: 'l9-cea-towards-osa',
        direction: { destinationCodes: ['OSA'] },
        disembarkingSide: 'left',
        platformType: 'island',
        features: [],
      },
    ],

    JAG: [
      {
        id: 'l9-jag-towards-vag',
        direction: { destinationCodes: ['VAG'] },
        disembarkingSide: 'left',
        platformType: 'island',
        features: [],
      },
      {
        id: 'l9-jag-towards-osa',
        direction: { destinationCodes: ['OSA'] },
        disembarkingSide: 'left',
        platformType: 'island',
        features: [],
      },
    ],

    USP: [
      {
        id: 'l9-usp-towards-vag',
        direction: { destinationCodes: ['VAG'] },
        disembarkingSide: 'left',
        platformType: 'island',
        features: [],
      },
      {
        id: 'l9-usp-towards-osa',
        direction: { destinationCodes: ['OSA'] },
        disembarkingSide: 'left',
        platformType: 'island',
        features: [],
      },
    ],

    PIN: [
      {
        id: 'l9-pin-towards-vag',
        direction: { destinationCodes: ['VAG'] },
        disembarkingSide: 'left',
        platformType: 'island',
        features: [
          // Crowdsourced: Tabela Escadinha SP
          {
            id: 'l9-pin-vag-escalator-up-car-1-door-1',
            type: 'escalator-up',
            label: 'Escada rolante de subida próxima ao carro 1, porta 1',
            anchor: { type: 'door', carPosition: 1, doorPosition: 1 },
          },
        ],
      },
      {
        id: 'l9-pin-towards-osa',
        direction: { destinationCodes: ['OSA'] },
        disembarkingSide: 'left',
        platformType: 'island',
        features: [
          // Crowdsourced: Tabela Escadinha SP
          {
            id: 'l9-pin-osa-escalator-up-car-8-door-4',
            type: 'escalator-up',
            label: 'Escada rolante de subida próxima ao carro 8, porta 4',
            anchor: { type: 'door', carPosition: 8, doorPosition: 4 },
          },
        ],
      },
    ],

    HBR: [
      {
        id: 'l9-hbr-towards-vag',
        direction: { destinationCodes: ['VAG'] },
        disembarkingSide: 'left',
        platformType: 'island',
        features: [],
      },
      {
        id: 'l9-hbr-towards-osa',
        direction: { destinationCodes: ['OSA'] },
        disembarkingSide: 'left',
        platformType: 'island',
        features: [],
      },
    ],

    CJD: [
      {
        id: 'l9-cjd-towards-vag',
        direction: { destinationCodes: ['VAG'] },
        disembarkingSide: 'left',
        platformType: 'island',
        features: [],
      },
      {
        id: 'l9-cjd-towards-osa',
        direction: { destinationCodes: ['OSA'] },
        disembarkingSide: 'left',
        platformType: 'island',
        features: [],
      },
    ],

    VOL: [
      {
        id: 'l9-vol-towards-vag',
        direction: { destinationCodes: ['VAG'] },
        disembarkingSide: 'left',
        platformType: 'island',
        features: [],
      },
      {
        id: 'l9-vol-towards-osa',
        direction: { destinationCodes: ['OSA'] },
        disembarkingSide: 'left',
        platformType: 'island',
        features: [],
      },
    ],

    BRR: [
      {
        id: 'l9-brr-towards-vag',
        direction: { destinationCodes: ['VAG'] },
        disembarkingSide: 'left',
        platformType: 'island',
        features: [],
      },
      {
        id: 'l9-brr-towards-osa',
        direction: { destinationCodes: ['OSA'] },
        disembarkingSide: 'left',
        platformType: 'island',
        features: [],
      },
    ],

    MRB: [
      {
        id: 'l9-mrb-towards-vag',
        direction: { destinationCodes: ['VAG'] },
        disembarkingSide: 'left',
        platformType: 'island',
        features: [],
      },
      {
        id: 'l9-mrb-towards-osa',
        direction: { destinationCodes: ['OSA'] },
        disembarkingSide: 'left',
        platformType: 'island',
        features: [],
      },
    ],

    GJT: [
      {
        id: 'l9-gjt-towards-vag',
        direction: { destinationCodes: ['VAG'] },
        disembarkingSide: 'left',
        platformType: 'island',
        features: [],
      },
      {
        id: 'l9-gjt-towards-osa',
        direction: { destinationCodes: ['OSA'] },
        disembarkingSide: 'left',
        platformType: 'island',
        features: [],
      },
    ],

    JOD: [
      {
        id: 'l9-jod-towards-vag',
        direction: { destinationCodes: ['VAG'] },
        disembarkingSide: 'left',
        platformType: 'island',
        features: [
          // Crowdsourced: Tabela Escadinha SP
          {
            id: 'l9-jod-vag-escalator-up-car-2-door-2',
            type: 'escalator-up',
            label: 'Escada rolante de subida próxima ao carro 2, porta 2',
            anchor: { type: 'door', carPosition: 2, doorPosition: 2 },
          },
        ],
      },
      {
        id: 'l9-jod-towards-osa',
        direction: { destinationCodes: ['OSA'] },
        disembarkingSide: 'left',
        platformType: 'island',
        features: [],
      },
    ],

    SAM: [
      {
        id: 'l9-sam-towards-vag',
        direction: { destinationCodes: ['VAG'] },
        disembarkingSide: 'left',
        platformType: 'island',
        features: [],
      },
      {
        id: 'l9-sam-towards-osa',
        direction: { destinationCodes: ['OSA'] },
        disembarkingSide: 'left',
        platformType: 'island',
        features: [],
      },
    ],

    SOC: [
      {
        id: 'l9-soc-towards-vag',
        direction: { destinationCodes: ['VAG'] },
        disembarkingSide: 'left',
        platformType: 'island',
        features: [],
      },
      {
        id: 'l9-soc-towards-osa',
        direction: { destinationCodes: ['OSA'] },
        disembarkingSide: 'left',
        platformType: 'island',
        features: [],
      },
    ],

    JUR: [
      {
        id: 'l9-jur-towards-vag',
        direction: { destinationCodes: ['VAG'] },
        disembarkingSide: 'right',
        platformType: 'both',
        features: [],
      },
      {
        id: 'l9-jur-towards-osa',
        direction: { destinationCodes: ['OSA'] },
        disembarkingSide: 'right',
        platformType: 'both',
        features: [],
      },
    ],

    AUT: [
      {
        id: 'l9-aut-towards-vag',
        direction: { destinationCodes: ['VAG'] },
        disembarkingSide: 'left',
        platformType: 'island',
        features: [],
      },
      {
        id: 'l9-aut-towards-osa',
        direction: { destinationCodes: ['OSA'] },
        disembarkingSide: 'left',
        platformType: 'island',
        features: [],
      },
    ],

    INT: [
      {
        id: 'l9-int-towards-vag',
        direction: { destinationCodes: ['VAG'] },
        disembarkingSide: 'left',
        platformType: 'island',
        features: [],
      },
      {
        id: 'l9-int-towards-osa',
        direction: { destinationCodes: ['OSA'] },
        disembarkingSide: 'left',
        platformType: 'island',
        features: [],
      },
    ],

    GRA: [
      {
        id: 'l9-gra-towards-vag',
        direction: { destinationCodes: ['VAG'] },
        disembarkingSide: 'left',
        platformType: 'island',
        features: [],
      },
      {
        id: 'l9-gra-towards-osa',
        direction: { destinationCodes: ['OSA'] },
        disembarkingSide: 'left',
        platformType: 'island',
        features: [],
      },
    ],

    MVN: [
      {
        id: 'l9-mvn-towards-vag',
        direction: { destinationCodes: ['VAG'] },
        disembarkingSide: 'left',
        platformType: 'island',
        features: [],
      },
      {
        id: 'l9-mvn-towards-osa',
        direction: { destinationCodes: ['OSA'] },
        disembarkingSide: 'left',
        platformType: 'island',
        features: [],
      },
    ],

    VAG: [
      {
        id: 'l9-vag-towards-osa',
        direction: { destinationCodes: ['OSA'] },
        disembarkingSide: 'left',
        platformType: 'island',
        features: [],
      },
      {
        id: 'l9-vag-towards-vag',
        direction: { destinationCodes: ['VAG'] },
        disembarkingSide: 'left',
        platformType: 'island',
        features: [],
      },
    ],
  },
});
