import { defineTrainLinePlatformConfig } from '../../train-platform-config';

export const L11_TRAIN_PLATFORM_CONFIG = defineTrainLinePlatformConfig({
  lineCode: 'L11',
  platforms: {
    BFU: [
      // TODO: Não sei
      {
        id: 'l11-bfu-towards-est',
        direction: { destinationCodes: ['EST'] },
        disembarkingSide: 'left',
        directionalFactReview: {
          status: 'unknown',
        },
        features: [],
      },
    ],

    LUZ: [
      {
        id: 'l11-luz-towards-est',
        platformType: 'both',
        direction: { destinationCodes: ['EST'] },
        disembarkingSide: 'left',
        directionalFactReview: {
          status: 'reviewed',
          source:
            'https://pt.wikipedia.org/wiki/Esta%C3%A7%C3%A3o_da_Luz',
          lastReviewedAt: '2026-09-04',
        },
        features: [],
      },
      {
        id: 'l11-luz-towards-bfu',
        platformType: 'both',
        direction: { destinationCodes: ['BFU'] },
        disembarkingSide: 'left',
        features: [],
      },
    ],

    BAS: [
      {
        id: 'l11-bas-towards-est',
        platformType: 'island',
        direction: { destinationCodes: ['EST'] },
        disembarkingSide: 'left',
        directionalFactReview: {
          status: 'reviewed',
          source:
            'https://pt.wikipedia.org/wiki/Esta%C3%A7%C3%A3o_Br%C3%A1s',
          lastReviewedAt: '2026-09-04',
        },
        features: [],
      },
      {
        id: 'l11-bas-towards-bfu',
        platformType: 'island',
        direction: { destinationCodes: ['BFU'] },
        disembarkingSide: 'left',
        features: [],
      },
    ],

    TAT: [
      {
        id: 'l11-tat-towards-est',
        platformType: 'island',
        direction: { destinationCodes: ['EST'] },
        disembarkingSide: 'right',
        features: [],
      },
      {
        id: 'l11-tat-towards-bfu',
        platformType: 'island',
        direction: { destinationCodes: ['BFU'] },
        disembarkingSide: 'right',
        features: [],
      },
    ],

    ITQ: [
      {
        id: 'l11-itq-towards-est',
        platformType: 'island',
        direction: { destinationCodes: ['EST'] },
        disembarkingSide: 'right',
        features: [],
      },
      {
        id: 'l11-itq-towards-bfu',
        platformType: 'island',
        direction: { destinationCodes: ['BFU'] },
        disembarkingSide: 'right',
        features: [],
      },
    ],

    DOB: [
      {
        id: 'l11-dob-towards-est',
        platformType: 'side',
        direction: { destinationCodes: ['EST'] },
        disembarkingSide: 'left',
        directionalFactReview: {
          status: 'reviewed',
          source:
            'https://www.metrocptm.com.br/cptm-tem-linhas-demais-para-poucos-trilhos/',
          lastReviewedAt: '2026-09-04',
        },
        features: [],
      },
      {
        id: 'l11-dob-towards-bfu',
        platformType: 'side',
        direction: { destinationCodes: ['BFU'] },
        disembarkingSide: 'left',
        directionalFactReview: {
          status: 'reviewed',
          source:
            'https://www.metrocptm.com.br/cptm-tem-linhas-demais-para-poucos-trilhos/',
          lastReviewedAt: '2026-09-04',
        },
        features: [],
      },
    ],

    JBO: [
      {
        id: 'l11-jbo-towards-est',
        platformType: 'side',
        direction: { destinationCodes: ['EST'] },
        disembarkingSide: 'left',
        features: [],
      },
      {
        id: 'l11-jbo-towards-bfu',
        platformType: 'side',
        direction: { destinationCodes: ['BFU'] },
        disembarkingSide: 'left',
        features: [],
      },
    ],

    GUA: [
      {
        id: 'l11-gua-towards-est',
        platformType: 'island',
        direction: { destinationCodes: ['EST'] },
        disembarkingSide: 'right',
        features: [],
      },
      {
        id: 'l11-gua-towards-bfu',
        platformType: 'island',
        direction: { destinationCodes: ['BFU'] },
        disembarkingSide: 'right',
        features: [],
      },
    ],

    AGN: [
      {
        id: 'l11-agn-towards-est',
        platformType: 'side',
        direction: { destinationCodes: ['EST'] },
        disembarkingSide: 'left',
        features: [],
      },
      {
        id: 'l11-agn-towards-bfu',
        platformType: 'side',
        direction: { destinationCodes: ['BFU'] },
        disembarkingSide: 'left',
        features: [],
      },
    ],

    FVC: [
      {
        id: 'l11-fvc-towards-est',
        platformType: 'island',
        direction: { destinationCodes: ['EST'] },
        disembarkingSide: 'right',
        features: [],
      },
      {
        id: 'l11-fvc-towards-bfu',
        platformType: 'island',
        direction: { destinationCodes: ['BFU'] },
        disembarkingSide: 'right',
        features: [],
      },
    ],

    POA: [
      {
        id: 'l11-poa-towards-est',
        platformType: 'side',
        direction: { destinationCodes: ['EST'] },
        disembarkingSide: 'left',
        features: [],
      },
      {
        id: 'l11-poa-towards-bfu',
        platformType: 'side',
        direction: { destinationCodes: ['BFU'] },
        disembarkingSide: 'left',
        features: [],
      },
    ],

    CAL: [
      // TODO: Não sei
      {
        id: 'l11-cal-towards-est',
        platformType: 'both',
        direction: { destinationCodes: ['EST'] },
        disembarkingSide: 'left',
        features: [],
      },
      {
        id: 'l11-cal-towards-bfu',
        platformType: 'both',
        direction: { destinationCodes: ['BFU'] },
        disembarkingSide: 'left',
        features: [],
      },
    ],

    SUZ: [
      {
        id: 'l11-suz-towards-est',
        platformType: 'island',
        direction: { destinationCodes: ['EST'] },
        disembarkingSide: 'right',
        features: [],
      },
      {
        id: 'l11-suz-towards-bfu',
        platformType: 'island',
        direction: { destinationCodes: ['BFU'] },
        disembarkingSide: 'right',
        features: [],
      },
    ],

    JPB: [
      {
        id: 'l11-jpb-towards-est',
        platformType: 'side',
        direction: { destinationCodes: ['EST'] },
        disembarkingSide: 'left',
        features: [],
      },
      {
        id: 'l11-jpb-towards-bfu',
        platformType: 'side',
        direction: { destinationCodes: ['BFU'] },
        disembarkingSide: 'left',
        features: [],
      },
    ],

    BCB: [
      {
        id: 'l11-bcb-towards-est',
        platformType: 'side',
        direction: { destinationCodes: ['EST'] },
        disembarkingSide: 'left',
        features: [],
      },
      {
        id: 'l11-bcb-towards-bfu',
        platformType: 'side',
        direction: { destinationCodes: ['BFU'] },
        disembarkingSide: 'left',
        features: [],
      },
    ],

    MDC: [
      // TODO: Não sei
      {
        id: 'l11-mdc-towards-est',
        platformType: 'both',
        direction: { destinationCodes: ['EST'] },
        disembarkingSide: 'left',
        features: [],
      },
      {
        id: 'l11-mdc-towards-bfu',
        platformType: 'both',
        direction: { destinationCodes: ['BFU'] },
        disembarkingSide: 'left',
        features: [],
      },
    ],

    EST: [
      // TODO: Não sei
      {
        id: 'l11-est-towards-bfu',
        direction: { destinationCodes: ['BFU'] },
        disembarkingSide: 'left',
        features: [],
      },
    ],
  },
});
