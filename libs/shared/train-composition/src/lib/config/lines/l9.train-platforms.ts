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
        features: [],
      },
      {
        id: 'l9-osa-towards-osa',
        direction: { destinationCodes: ['OSA'] },
        // TODO: Não sei
        disembarkingSide: 'right',
        features: [],
      },
    ],

    PAL: [
      {
        id: 'l9-pal-towards-vag',
        direction: { destinationCodes: ['VAG'] },
        // TODO: Não sei
        disembarkingSide: 'right',
        features: [],
      },
      {
        id: 'l9-pal-towards-osa',
        direction: { destinationCodes: ['OSA'] },
        // TODO: Não sei
        disembarkingSide: 'right',
        features: [],
      },
    ],

    CEA: [
      {
        id: 'l9-cea-towards-vag',
        direction: { destinationCodes: ['VAG'] },
        disembarkingSide: 'left',
        features: [],
      },
      {
        id: 'l9-cea-towards-osa',
        direction: { destinationCodes: ['OSA'] },
        disembarkingSide: 'left',
        features: [],
      },
    ],

    JAG: [
      {
        id: 'l9-jag-towards-vag',
        direction: { destinationCodes: ['VAG'] },
        disembarkingSide: 'left',
        features: [],
      },
      {
        id: 'l9-jag-towards-osa',
        direction: { destinationCodes: ['OSA'] },
        disembarkingSide: 'left',
        features: [],
      },
    ],

    USP: [
      {
        id: 'l9-usp-towards-vag',
        direction: { destinationCodes: ['VAG'] },
        disembarkingSide: 'left',
        features: [],
      },
      {
        id: 'l9-usp-towards-osa',
        direction: { destinationCodes: ['OSA'] },
        disembarkingSide: 'left',
        features: [],
      },
    ],

    PIN: [
      {
        id: 'l9-pin-towards-vag',
        direction: { destinationCodes: ['VAG'] },
        disembarkingSide: 'left',
        features: [],
      },
      {
        id: 'l9-pin-towards-osa',
        direction: { destinationCodes: ['OSA'] },
        disembarkingSide: 'left',
        features: [],
      },
    ],

    HBR: [
      {
        id: 'l9-hbr-towards-vag',
        direction: { destinationCodes: ['VAG'] },
        disembarkingSide: 'left',
        features: [],
      },
      {
        id: 'l9-hbr-towards-osa',
        direction: { destinationCodes: ['OSA'] },
        disembarkingSide: 'left',
        features: [],
      },
    ],

    CJD: [
      {
        id: 'l9-cjd-towards-vag',
        direction: { destinationCodes: ['VAG'] },
        disembarkingSide: 'left',
        features: [],
      },
      {
        id: 'l9-cjd-towards-osa',
        direction: { destinationCodes: ['OSA'] },
        disembarkingSide: 'left',
        features: [],
      },
    ],

    VOL: [
      {
        id: 'l9-vol-towards-vag',
        direction: { destinationCodes: ['VAG'] },
        disembarkingSide: 'left',
        features: [],
      },
      {
        id: 'l9-vol-towards-osa',
        direction: { destinationCodes: ['OSA'] },
        disembarkingSide: 'left',
        features: [],
      },
    ],

    BRR: [
      {
        id: 'l9-brr-towards-vag',
        direction: { destinationCodes: ['VAG'] },
        disembarkingSide: 'left',
        features: [],
      },
      {
        id: 'l9-brr-towards-osa',
        direction: { destinationCodes: ['OSA'] },
        disembarkingSide: 'left',
        features: [],
      },
    ],

    MRB: [
      {
        id: 'l9-mrb-towards-vag',
        direction: { destinationCodes: ['VAG'] },
        disembarkingSide: 'left',
        features: [],
      },
      {
        id: 'l9-mrb-towards-osa',
        direction: { destinationCodes: ['OSA'] },
        disembarkingSide: 'left',
        features: [],
      },
    ],

    GJT: [
      {
        id: 'l9-gjt-towards-vag',
        direction: { destinationCodes: ['VAG'] },
        disembarkingSide: 'left',
        features: [],
      },
      {
        id: 'l9-gjt-towards-osa',
        direction: { destinationCodes: ['OSA'] },
        disembarkingSide: 'left',
        features: [],
      },
    ],

    JOD: [
      {
        id: 'l9-jod-towards-vag',
        direction: { destinationCodes: ['VAG'] },
        disembarkingSide: 'left',
        features: [],
      },
      {
        id: 'l9-jod-towards-osa',
        direction: { destinationCodes: ['OSA'] },
        disembarkingSide: 'left',
        features: [],
      },
    ],

    SAM: [
      {
        id: 'l9-sam-towards-vag',
        direction: { destinationCodes: ['VAG'] },
        disembarkingSide: 'left',
        features: [],
      },
      {
        id: 'l9-sam-towards-osa',
        direction: { destinationCodes: ['OSA'] },
        disembarkingSide: 'left',
        features: [],
      },
    ],

    SOC: [
      {
        id: 'l9-soc-towards-vag',
        direction: { destinationCodes: ['VAG'] },
        disembarkingSide: 'left',
        features: [],
      },
      {
        id: 'l9-soc-towards-osa',
        direction: { destinationCodes: ['OSA'] },
        disembarkingSide: 'left',
        features: [],
      },
    ],

    JUR: [
      {
        id: 'l9-jur-towards-vag',
        direction: { destinationCodes: ['VAG'] },
        disembarkingSide: 'right',
        features: [],
      },
      {
        id: 'l9-jur-towards-osa',
        direction: { destinationCodes: ['OSA'] },
        disembarkingSide: 'right',
        features: [],
      },
    ],

    AUT: [
      {
        id: 'l9-aut-towards-vag',
        direction: { destinationCodes: ['VAG'] },
        disembarkingSide: 'left',
        features: [],
      },
      {
        id: 'l9-aut-towards-osa',
        direction: { destinationCodes: ['OSA'] },
        disembarkingSide: 'left',
        features: [],
      },
    ],

    INT: [
      {
        id: 'l9-int-towards-vag',
        direction: { destinationCodes: ['VAG'] },
        disembarkingSide: 'left',
        features: [],
      },
      {
        id: 'l9-int-towards-osa',
        direction: { destinationCodes: ['OSA'] },
        disembarkingSide: 'left',
        features: [],
      },
    ],

    GRA: [
      {
        id: 'l9-gra-towards-vag',
        direction: { destinationCodes: ['VAG'] },
        disembarkingSide: 'left',
        features: [],
      },
      {
        id: 'l9-gra-towards-osa',
        direction: { destinationCodes: ['OSA'] },
        disembarkingSide: 'left',
        features: [],
      },
    ],

    MVN: [
      {
        id: 'l9-mvn-towards-vag',
        direction: { destinationCodes: ['VAG'] },
        disembarkingSide: 'left',
        features: [],
      },
      {
        id: 'l9-mvn-towards-osa',
        direction: { destinationCodes: ['OSA'] },
        disembarkingSide: 'left',
        features: [],
      },
    ],

    VAG: [
      {
        id: 'l9-vag-towards-osa',
        direction: { destinationCodes: ['OSA'] },
        disembarkingSide: 'left',
        features: [],
      },
      {
        id: 'l9-vag-towards-vag',
        direction: { destinationCodes: ['VAG'] },
        disembarkingSide: 'left',
        features: [],
      },
    ],
  },
});
