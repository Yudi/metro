import { defineTrainLinePlatformConfig } from '../../train-platform-config';

export const L17_TRAIN_PLATFORM_CONFIG = defineTrainLinePlatformConfig({
  lineCode: 'L17',
  platforms: {
    JDA: [
      {
        id: 'l17-jda-towards-mob',
        direction: { destinationCodes: ['MOB'] },
        disembarkingSide: 'right',
        platformType: 'side',
        features: [],
      },
      {
        id: 'l17-jda-towards-jda',
        direction: { destinationCodes: ['JDA'] },
        disembarkingSide: 'right',
        platformType: 'side',
        features: [],
      },
    ],

    CGN: [
      {
        id: 'l17-cgn-towards-mob',
        direction: { destinationCodes: ['MOB'] },
        disembarkingSide: 'left',
        platformType: 'island',
        features: [],
      },
      {
        id: 'l17-cgn-towards-jda',
        direction: { destinationCodes: ['JDA'] },
        disembarkingSide: 'left',
        platformType: 'island',
        features: [],
      },
    ],

    BPA: [
      {
        id: 'l17-bpa-towards-mob',
        direction: { destinationCodes: ['MOB'] },
        disembarkingSide: 'left',
        platformType: 'island',
        features: [],
      },
      {
        id: 'l17-bpa-towards-jda',
        direction: { destinationCodes: ['JDA'] },
        disembarkingSide: 'left',
        platformType: 'island',
        features: [],
      },
    ],

    VJD: [
      {
        id: 'l17-vjd-towards-mob',
        direction: { destinationCodes: ['MOB'] },
        disembarkingSide: 'left',
        platformType: 'island',
        features: [],
      },
      {
        id: 'l17-vjd-towards-jda',
        direction: { destinationCodes: ['JDA'] },
        disembarkingSide: 'left',
        platformType: 'island',
        features: [],
      },
    ],

    CBM: [
      {
        id: 'l17-cbm-towards-mob',
        direction: { destinationCodes: ['MOB'] },
        disembarkingSide: 'left',
        platformType: 'island',
        features: [],
      },
      {
        id: 'l17-cbm-towards-jda',
        direction: { destinationCodes: ['JDA'] },
        disembarkingSide: 'left',
        platformType: 'island',
        features: [],
      },
    ],

    VCD: [
      {
        id: 'l17-vcd-towards-mob',
        direction: { destinationCodes: ['MOB'] },
        disembarkingSide: 'left',
        platformType: 'island',
        features: [],
      },
      {
        id: 'l17-vcd-towards-jda',
        direction: { destinationCodes: ['JDA'] },
        disembarkingSide: 'left',
        platformType: 'island',
        features: [],
      },
    ],

    CZD: [
      {
        id: 'l17-czd-towards-mob',
        direction: { destinationCodes: ['MOB'] },
        disembarkingSide: 'left',
        platformType: 'island',
        features: [],
      },
      {
        id: 'l17-czd-towards-jda',
        direction: { destinationCodes: ['JDA'] },
        disembarkingSide: 'left',
        platformType: 'island',
        features: [],
      },
    ],

    MOB: [
      {
        id: 'l17-mob-towards-jda',
        direction: { destinationCodes: ['JDA'] },
        disembarkingSide: 'right',
        platformType: 'side',
        features: [],
      },
      {
        id: 'l17-mob-towards-mob',
        direction: { destinationCodes: ['MOB'] },
        disembarkingSide: 'right',
        platformType: 'side',
        features: [],
      },
    ],
  },
});
