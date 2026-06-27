import { defineTrainLinePlatformConfig } from '../../train-platform-config';

export const L17_TRAIN_PLATFORM_CONFIG = defineTrainLinePlatformConfig({
  lineCode: 'L17',
  platforms: {
    JDA: [
      {
        id: 'l17-jda-towards-mob',
        direction: { destinationCodes: ['MOB'] },
        disembarkingSide: 'right',
        features: [],
      },
      {
        id: 'l17-jda-towards-jda',
        direction: { destinationCodes: ['JDA'] },
        disembarkingSide: 'right',
        features: [],
      },
    ],

    CGN: [
      {
        id: 'l17-cgn-towards-mob',
        direction: { destinationCodes: ['MOB'] },
        disembarkingSide: 'left',
        features: [],
      },
      {
        id: 'l17-cgn-towards-jda',
        direction: { destinationCodes: ['JDA'] },
        disembarkingSide: 'left',
        features: [],
      },
    ],

    BPA: [
      {
        id: 'l17-bpa-towards-mob',
        direction: { destinationCodes: ['MOB'] },
        disembarkingSide: 'left',
        features: [],
      },
      {
        id: 'l17-bpa-towards-jda',
        direction: { destinationCodes: ['JDA'] },
        disembarkingSide: 'left',
        features: [],
      },
    ],

    VJD: [
      {
        id: 'l17-vjd-towards-mob',
        direction: { destinationCodes: ['MOB'] },
        disembarkingSide: 'left',
        features: [],
      },
      {
        id: 'l17-vjd-towards-jda',
        direction: { destinationCodes: ['JDA'] },
        disembarkingSide: 'left',
        features: [],
      },
    ],

    CBM: [
      {
        id: 'l17-cbm-towards-mob',
        direction: { destinationCodes: ['MOB'] },
        disembarkingSide: 'left',
        features: [],
      },
      {
        id: 'l17-cbm-towards-jda',
        direction: { destinationCodes: ['JDA'] },
        disembarkingSide: 'left',
        features: [],
      },
    ],

    VCD: [
      {
        id: 'l17-vcd-towards-mob',
        direction: { destinationCodes: ['MOB'] },
        disembarkingSide: 'left',
        features: [],
      },
      {
        id: 'l17-vcd-towards-jda',
        direction: { destinationCodes: ['JDA'] },
        disembarkingSide: 'left',
        features: [],
      },
    ],

    CZD: [
      {
        id: 'l17-czd-towards-mob',
        direction: { destinationCodes: ['MOB'] },
        disembarkingSide: 'left',
        features: [],
      },
      {
        id: 'l17-czd-towards-jda',
        direction: { destinationCodes: ['JDA'] },
        disembarkingSide: 'left',
        features: [],
      },
    ],

    MOB: [
      {
        id: 'l17-mob-towards-jda',
        direction: { destinationCodes: ['JDA'] },
        disembarkingSide: 'right',
        features: [],
      },
      {
        id: 'l17-mob-towards-mob',
        direction: { destinationCodes: ['MOB'] },
        disembarkingSide: 'right',
        features: [],
      },
    ],
  },
});
