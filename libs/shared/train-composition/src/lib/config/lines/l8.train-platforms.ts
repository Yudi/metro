import { defineTrainLinePlatformConfig } from '../../train-platform-config';

export const L8_TRAIN_PLATFORM_CONFIG = defineTrainLinePlatformConfig({
  lineCode: 'L8',
  platforms: {
    JPR: [
      {
        id: 'l8-jpr-towards-jpr',
        direction: { destinationCodes: ['JPR'] },
        disembarkingSide: 'right',
        platformType: 'both',
        features: [],
      },
      {
        id: 'l8-jpr-towards-ipv',
        direction: { destinationCodes: ['IPV'] },
        disembarkingSide: 'right',
        platformType: 'both',
        features: [],
      },
    ],

    BFU: [
      {
        id: 'l8-bfu-towards-ipv',
        direction: { destinationCodes: ['IPV'] },
        disembarkingSide: 'left',
        platformType: 'both',
        features: [],
      },
      {
        id: 'l8-bfu-towards-jpr',
        direction: { destinationCodes: ['JPR'] },
        disembarkingSide: 'left',
        platformType: 'both',
        features: [],
      },
    ],

    LAB: [
      {
        id: 'l8-lab-towards-ipv',
        direction: { destinationCodes: ['IPV'] },
        disembarkingSide: 'right',
        platformType: 'side',
        features: [],
      },
      {
        id: 'l8-lab-towards-jpr',
        direction: { destinationCodes: ['JPR'] },
        disembarkingSide: 'right',
        platformType: 'side',
        features: [],
      },
    ],

    DMO: [
      {
        id: 'l8-dmo-towards-ipv',
        direction: { destinationCodes: ['IPV'] },
        disembarkingSide: 'left',
        platformType: 'island',
        features: [],
      },
      {
        id: 'l8-dmo-towards-jpr',
        direction: { destinationCodes: ['JPR'] },
        disembarkingSide: 'left',
        platformType: 'island',
        features: [],
      },
    ],

    ILE: [
      {
        id: 'l8-ile-towards-ipv',
        direction: { destinationCodes: ['IPV'] },
        disembarkingSide: 'left',
        platformType: 'island',
        features: [],
      },
      {
        id: 'l8-ile-towards-jpr',
        direction: { destinationCodes: ['JPR'] },
        disembarkingSide: 'left',
        platformType: 'island',
        features: [],
      },
    ],

    PAL: [
      {
        id: 'l8-pal-towards-ipv',
        direction: { destinationCodes: ['IPV'] },
        disembarkingSide: 'left',
        platformType: 'side',
        features: [],
      },
      {
        id: 'l8-pal-towards-jpr',
        direction: { destinationCodes: ['JPR'] },
        disembarkingSide: 'left',
        platformType: 'side',
        features: [],
      },
    ],

    OSA: [
      {
        id: 'l8-osa-towards-ipv',
        direction: { destinationCodes: ['IPV'] },
        disembarkingSide: 'left',
        platformType: 'side',
        features: [],
      },
      {
        id: 'l8-osa-towards-jpr',
        direction: { destinationCodes: ['JPR'] },
        disembarkingSide: 'left',
        platformType: 'side',
        features: [],
      },
    ],

    CSA: [
      {
        id: 'l8-csa-towards-ipv',
        direction: { destinationCodes: ['IPV'] },
        disembarkingSide: 'left',
        platformType: 'island',
        features: [],
      },
      {
        id: 'l8-csa-towards-jpr',
        direction: { destinationCodes: ['JPR'] },
        disembarkingSide: 'left',
        platformType: 'island',
        features: [],
      },
    ],

    QTU: [
      {
        id: 'l8-qtu-towards-ipv',
        direction: { destinationCodes: ['IPV'] },
        disembarkingSide: 'right',
        platformType: 'both',
        features: [],
      },
      {
        id: 'l8-qtu-towards-jpr',
        direction: { destinationCodes: ['JPR'] },
        disembarkingSide: 'right',
        platformType: 'both',
        features: [],
      },
    ],

    GMC: [
      {
        id: 'l8-gmc-towards-ipv',
        direction: { destinationCodes: ['IPV'] },
        disembarkingSide: 'left',
        platformType: 'island',
        features: [],
      },
      {
        id: 'l8-gmc-towards-jpr',
        direction: { destinationCodes: ['JPR'] },
        disembarkingSide: 'left',
        platformType: 'island',
        features: [],
      },
    ],

    CPB: [
      {
        id: 'l8-cpb-towards-ipv',
        direction: { destinationCodes: ['IPV'] },
        disembarkingSide: 'both',
        platformType: 'island',
        features: [],
      },
      {
        id: 'l8-cpb-towards-jpr',
        direction: { destinationCodes: ['JPR'] },
        disembarkingSide: 'both',
        platformType: 'island',
        features: [],
      },
    ],

    STE: [
      {
        id: 'l8-ste-towards-ipv',
        direction: { destinationCodes: ['IPV'] },
        disembarkingSide: 'left',
        platformType: 'island',
        features: [],
      },
      {
        id: 'l8-ste-towards-jpr',
        direction: { destinationCodes: ['JPR'] },
        disembarkingSide: 'left',
        platformType: 'island',
        features: [],
      },
    ],

    AJO: [
      {
        id: 'l8-ajo-towards-ipv',
        direction: { destinationCodes: ['IPV'] },
        disembarkingSide: 'right',
        platformType: 'side',
        features: [],
      },
      {
        id: 'l8-ajo-towards-jpr',
        direction: { destinationCodes: ['JPR'] },
        disembarkingSide: 'right',
        platformType: 'side',
        features: [],
      },
    ],

    BRU: [
      {
        id: 'l8-bru-towards-ipv',
        direction: { destinationCodes: ['IPV'] },
        disembarkingSide: 'left',
        platformType: 'island',
        features: [],
      },
      {
        id: 'l8-bru-towards-jpr',
        direction: { destinationCodes: ['JPR'] },
        disembarkingSide: 'left',
        platformType: 'island',
        features: [],
      },
    ],

    JBE: [
      {
        id: 'l8-jbe-towards-ipv',
        direction: { destinationCodes: ['IPV'] },
        disembarkingSide: 'left',
        platformType: 'island',
        features: [],
      },
      {
        id: 'l8-jbe-towards-jpr',
        direction: { destinationCodes: ['JPR'] },
        disembarkingSide: 'left',
        platformType: 'island',
        features: [],
      },
    ],

    JSI: [
      {
        id: 'l8-jsi-towards-ipv',
        direction: { destinationCodes: ['IPV'] },
        disembarkingSide: 'left',
        platformType: 'island',
        features: [],
      },
      {
        id: 'l8-jsi-towards-jpr',
        direction: { destinationCodes: ['JPR'] },
        disembarkingSide: 'left',
        platformType: 'island',
        features: [],
      },
    ],

    JDI: [
      {
        id: 'l8-jdi-towards-ipv',
        direction: { destinationCodes: ['IPV'] },
        disembarkingSide: 'left',
        platformType: 'island',
        features: [],
      },
      {
        id: 'l8-jdi-towards-jpr',
        direction: { destinationCodes: ['JPR'] },
        disembarkingSide: 'left',
        platformType: 'island',
        features: [],
      },
    ],

    SCO: [
      {
        id: 'l8-sco-towards-ipv',
        direction: { destinationCodes: ['IPV'] },
        disembarkingSide: 'left',
        platformType: 'island',
        features: [],
      },
      {
        id: 'l8-sco-towards-jpr',
        direction: { destinationCodes: ['JPR'] },
        disembarkingSide: 'left',
        platformType: 'island',
        features: [],
      },
    ],

    ECD: [
      {
        id: 'l8-ecd-towards-ipv',
        direction: { destinationCodes: ['IPV'] },
        disembarkingSide: 'left',
        platformType: 'island',
        features: [],
      },
      {
        id: 'l8-ecd-towards-jpr',
        direction: { destinationCodes: ['JPR'] },
        disembarkingSide: 'left',
        platformType: 'island',
        features: [],
      },
    ],

    IPV: [
      {
        id: 'l8-ipv-towards-ipv',
        direction: { destinationCodes: ['IPV'] },
        disembarkingSide: 'right',
        platformType: 'both',
        features: [],
      },
      {
        id: 'l8-ipv-towards-jpr',
        direction: { destinationCodes: ['JPR'] },
        disembarkingSide: 'right',
        platformType: 'both',
        features: [],
      },
      {
        id: 'l8-ipv-towards-abu',
        direction: { destinationCodes: ['ABU'] },
        disembarkingSide: 'left',
        platformType: 'both',
        features: [],
      },
    ],

    SRT: [
      {
        id: 'l8-srt-towards-ipv',
        direction: { destinationCodes: ['IPV'] },
        disembarkingSide: 'left',
        platformType: 'island',
        features: [],
      },
      {
        id: 'l8-srt-towards-abu',
        direction: { destinationCodes: ['ABU'] },
        disembarkingSide: 'left',
        platformType: 'island',
        features: [],
      },
    ],

    AMB: [
      {
        id: 'l8-amb-towards-ipv',
        direction: { destinationCodes: ['IPV'] },
        disembarkingSide: 'right',
        platformType: 'side',
        features: [],
      },
      {
        id: 'l8-amb-towards-abu',
        direction: { destinationCodes: ['ABU'] },
        disembarkingSide: 'right',
        platformType: 'side',
        features: [],
      },
    ],

    ABU: [
      {
        id: 'l8-abu-towards-abu',
        direction: { destinationCodes: ['ABU'] },
        disembarkingSide: 'left',
        platformType: 'island',
        features: [],
      },
      {
        id: 'l8-ipv-towards-ipv',
        direction: { destinationCodes: ['IPV'] },
        disembarkingSide: 'left',
        platformType: 'island',
        features: [],
      },
    ],
  },
});
