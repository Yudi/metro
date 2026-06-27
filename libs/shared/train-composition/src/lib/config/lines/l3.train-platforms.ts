import { defineTrainLinePlatformConfig } from '../../train-platform-config';
export const L3_TRAIN_PLATFORM_CONFIG = defineTrainLinePlatformConfig({
  lineCode: 'L3',
  platforms: {
    BFU: [
      {
        id: 'l3-bfu-towards-bfu',
        direction: { destinationCodes: ['BFU'] },
        disembarkingSide: 'left',
        features: [],
      },
      {
        id: 'l3-bfu-towards-itq',
        direction: { destinationCodes: ['ITQ'] },
        disembarkingSide: 'left',
        features: [],
      },
    ],

    DEO: [
      {
        id: 'l3-deo-towards-itq',
        direction: { destinationCodes: ['ITQ'] },
        disembarkingSide: 'right',
        features: [],
      },
      {
        id: 'l3-deo-towards-bfu',
        direction: { destinationCodes: ['BFU'] },
        disembarkingSide: 'left',
        features: [],
      },
    ],

    CEC: [
      {
        id: 'l3-cec-towards-itq',
        direction: { destinationCodes: ['ITQ'] },
        disembarkingSide: 'right',
        features: [],
      },
      {
        id: 'l3-cec-towards-bfu',
        direction: { destinationCodes: ['BFU'] },
        disembarkingSide: 'right',
        features: [],
      },
    ],

    REP: [
      {
        id: 'l3-rep-towards-itq',
        direction: { destinationCodes: ['ITQ'] },
        disembarkingSide: 'right',
        features: [],
      },
      {
        id: 'l3-rep-towards-bfu',
        direction: { destinationCodes: ['BFU'] },
        disembarkingSide: 'right',
        features: [],
      },
    ],

    GBU: [
      {
        id: 'l3-gbu-towards-itq',
        direction: { destinationCodes: ['ITQ'] },
        disembarkingSide: 'left',
        features: [],
      },
      {
        id: 'l3-gbu-towards-bfu',
        direction: { destinationCodes: ['BFU'] },
        disembarkingSide: 'left',
        features: [],
      },
    ],

    PSE: [
      {
        id: 'l3-pse-towards-itq',
        direction: { destinationCodes: ['ITQ'] },
        disembarkingSide: 'left',
        features: [],
      },
      {
        id: 'l3-pse-towards-bfu',
        direction: { destinationCodes: ['BFU'] },
        disembarkingSide: 'left',
        features: [],
      },
    ],

    PDS: [
      {
        id: 'l3-pds-towards-itq',
        direction: { destinationCodes: ['ITQ'] },
        disembarkingSide: 'right',
        features: [],
      },
      {
        id: 'l3-pds-towards-bfu',
        direction: { destinationCodes: ['BFU'] },
        disembarkingSide: 'right',
        features: [],
      },
    ],

    BAS: [
      {
        id: 'l3-bas-towards-itq',
        direction: { destinationCodes: ['ITQ'] },
        disembarkingSide: 'left',
        features: [],
      },
      {
        id: 'l3-bas-towards-bfu',
        direction: { destinationCodes: ['BFU'] },
        disembarkingSide: 'left',
        features: [],
      },
    ],

    BRE: [
      {
        id: 'l3-bre-towards-itq',
        direction: { destinationCodes: ['ITQ'] },
        disembarkingSide: 'left',
        features: [],
      },
      {
        id: 'l3-bre-towards-bfu',
        direction: { destinationCodes: ['BFU'] },
        disembarkingSide: 'left',
        features: [],
      },
    ],

    BEL: [
      {
        id: 'l3-bel-towards-itq',
        direction: { destinationCodes: ['ITQ'] },
        disembarkingSide: 'left',
        features: [],
      },
      {
        id: 'l3-bel-towards-bfu',
        direction: { destinationCodes: ['BFU'] },
        disembarkingSide: 'left',
        features: [],
      },
    ],

    TAT: [
      {
        id: 'l3-tat-towards-itq',
        direction: { destinationCodes: ['ITQ'] },
        disembarkingSide: 'left',
        features: [],
      },
      {
        id: 'l3-tat-towards-bfu',
        direction: { destinationCodes: ['BFU'] },
        disembarkingSide: 'left',
        features: [],
      },
    ],

    CAR: [
      {
        id: 'l3-car-towards-itq',
        direction: { destinationCodes: ['ITQ'] },
        disembarkingSide: 'left',
        features: [],
      },
      {
        id: 'l3-car-towards-bfu',
        direction: { destinationCodes: ['BFU'] },
        disembarkingSide: 'left',
        features: [],
      },
    ],

    PEN: [
      {
        id: 'l3-pen-towards-itq',
        direction: { destinationCodes: ['ITQ'] },
        disembarkingSide: 'left',
        features: [],
      },
      {
        id: 'l3-pen-towards-bfu',
        direction: { destinationCodes: ['BFU'] },
        disembarkingSide: 'left',
        features: [],
      },
    ],

    VTD: [
      {
        id: 'l3-vtd-towards-itq',
        direction: { destinationCodes: ['ITQ'] },
        disembarkingSide: 'left',
        features: [],
      },
      {
        id: 'l3-vtd-towards-bfu',
        direction: { destinationCodes: ['BFU'] },
        disembarkingSide: 'left',
        features: [],
      },
    ],

    VPA: [
      {
        id: 'l3-vpa-towards-itq',
        direction: { destinationCodes: ['ITQ'] },
        disembarkingSide: 'left',
        features: [],
      },
      {
        id: 'l3-vpa-towards-bfu',
        direction: { destinationCodes: ['BFU'] },
        disembarkingSide: 'left',
        features: [],
      },
    ],

    PCA: [
      {
        id: 'l3-pca-towards-itq',
        direction: { destinationCodes: ['ITQ'] },
        disembarkingSide: 'left',
        features: [],
      },
      {
        id: 'l3-pca-towards-bfu',
        direction: { destinationCodes: ['BFU'] },
        disembarkingSide: 'left',
        features: [],
      },
    ],

    ART: [
      {
        id: 'l3-art-towards-itq',
        direction: { destinationCodes: ['ITQ'] },
        disembarkingSide: 'left',
        features: [],
      },
      {
        id: 'l3-art-towards-bfu',
        direction: { destinationCodes: ['BFU'] },
        disembarkingSide: 'left',
        features: [],
      },
    ],

    ITQ: [
      {
        id: 'l3-itq-towards-itq',
        direction: { destinationCodes: ['ITQ'] },
        disembarkingSide: 'left',
        features: [],
      },
      {
        id: 'l3-itq-towards-bfu',
        direction: { destinationCodes: ['BFU'] },
        disembarkingSide: 'left',
        features: [],
      },
    ],
  },
});
