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
        features: [],
      },
    ],

    LUZ: [
      {
        id: 'l11-luz-towards-est',
        direction: { destinationCodes: ['EST'] },
        disembarkingSide: 'left',
        features: [],
      },
      {
        id: 'l11-luz-towards-bfu',
        direction: { destinationCodes: ['BFU'] },
        disembarkingSide: 'left',
        features: [],
      },
    ],

    BAS: [
      // TODO: Não sei
      {
        id: 'l11-bas-towards-est',
        direction: { destinationCodes: ['EST'] },
        disembarkingSide: 'left',
        features: [],
      },
      {
        id: 'l11-bas-towards-bfu',
        direction: { destinationCodes: ['BFU'] },
        disembarkingSide: 'left',
        features: [],
      },
    ],

    TAT: [
      {
        id: 'l11-tat-towards-est',
        direction: { destinationCodes: ['EST'] },
        disembarkingSide: 'right',
        features: [],
      },
      {
        id: 'l11-tat-towards-bfu',
        direction: { destinationCodes: ['BFU'] },
        disembarkingSide: 'right',
        features: [],
      },
    ],

    ITQ: [
      {
        id: 'l11-itq-towards-est',
        direction: { destinationCodes: ['EST'] },
        disembarkingSide: 'right',
        features: [],
      },
      {
        id: 'l11-itq-towards-bfu',
        direction: { destinationCodes: ['BFU'] },
        disembarkingSide: 'right',
        features: [],
      },
    ],

    DOB: [
      {
        id: 'l11-dob-towards-est',
        direction: { destinationCodes: ['EST'] },
        disembarkingSide: 'left',
        features: [],
      },
      {
        id: 'l11-dob-towards-bfu',
        direction: { destinationCodes: ['BFU'] },
        disembarkingSide: 'left',
        features: [],
      },
    ],

    JBO: [
      {
        id: 'l11-jbo-towards-est',
        direction: { destinationCodes: ['EST'] },
        disembarkingSide: 'left',
        features: [],
      },
      {
        id: 'l11-jbo-towards-bfu',
        direction: { destinationCodes: ['BFU'] },
        disembarkingSide: 'left',
        features: [],
      },
    ],

    GUA: [
      {
        id: 'l11-gua-towards-est',
        direction: { destinationCodes: ['EST'] },
        disembarkingSide: 'right',
        features: [],
      },
      {
        id: 'l11-gua-towards-bfu',
        direction: { destinationCodes: ['BFU'] },
        disembarkingSide: 'right',
        features: [],
      },
    ],

    AGN: [
      {
        id: 'l11-agn-towards-est',
        direction: { destinationCodes: ['EST'] },
        disembarkingSide: 'left',
        features: [],
      },
      {
        id: 'l11-agn-towards-bfu',
        direction: { destinationCodes: ['BFU'] },
        disembarkingSide: 'left',
        features: [],
      },
    ],

    FVC: [
      {
        id: 'l11-fvc-towards-est',
        direction: { destinationCodes: ['EST'] },
        disembarkingSide: 'right',
        features: [],
      },
      {
        id: 'l11-fvc-towards-bfu',
        direction: { destinationCodes: ['BFU'] },
        disembarkingSide: 'right',
        features: [],
      },
    ],

    POA: [
      {
        id: 'l11-poa-towards-est',
        direction: { destinationCodes: ['EST'] },
        disembarkingSide: 'left',
        features: [],
      },
      {
        id: 'l11-poa-towards-bfu',
        direction: { destinationCodes: ['BFU'] },
        disembarkingSide: 'left',
        features: [],
      },
    ],

    CAL: [
      // TODO: Não sei
      {
        id: 'l11-cal-towards-est',
        direction: { destinationCodes: ['EST'] },
        disembarkingSide: 'left',
        features: [],
      },
      {
        id: 'l11-cal-towards-bfu',
        direction: { destinationCodes: ['BFU'] },
        disembarkingSide: 'left',
        features: [],
      },
    ],

    SUZ: [
      {
        id: 'l11-suz-towards-est',
        direction: { destinationCodes: ['EST'] },
        disembarkingSide: 'right',
        features: [],
      },
      {
        id: 'l11-suz-towards-bfu',
        direction: { destinationCodes: ['BFU'] },
        disembarkingSide: 'right',
        features: [],
      },
    ],

    JPB: [
      {
        id: 'l11-jpb-towards-est',
        direction: { destinationCodes: ['EST'] },
        disembarkingSide: 'left',
        features: [],
      },
      {
        id: 'l11-jpb-towards-bfu',
        direction: { destinationCodes: ['BFU'] },
        disembarkingSide: 'left',
        features: [],
      },
    ],

    BCB: [
      {
        id: 'l11-bcb-towards-est',
        direction: { destinationCodes: ['EST'] },
        disembarkingSide: 'left',
        features: [],
      },
      {
        id: 'l11-bcb-towards-bfu',
        direction: { destinationCodes: ['BFU'] },
        disembarkingSide: 'left',
        features: [],
      },
    ],

    MDC: [
      // TODO: Não sei
      {
        id: 'l11-mdc-towards-est',
        direction: { destinationCodes: ['EST'] },
        disembarkingSide: 'left',
        features: [],
      },
      {
        id: 'l11-mdc-towards-bfu',
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
