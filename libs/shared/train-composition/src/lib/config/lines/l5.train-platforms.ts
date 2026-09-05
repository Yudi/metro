import { defineTrainLinePlatformConfig } from '../../train-platform-config';

export const L5_TRAIN_PLATFORM_CONFIG = defineTrainLinePlatformConfig({
  lineCode: 'L5',
  platforms: {
    CKB: [
      {
        id: 'l5-ckb-towards-cpr',
        direction: { destinationCodes: ['CPR'] },
        disembarkingSide: 'right',
        platformType: 'side',
        features: [],
      },
      {
        id: 'l5-ckb-towards-ckb',
        direction: { destinationCodes: ['CKB'] },
        disembarkingSide: 'right',
        platformType: 'side',
        features: [],
      },
    ],

    SCZ: [
      {
        id: 'l5-scz-towards-cpr',
        direction: { destinationCodes: ['CPR'] },
        disembarkingSide: 'right',
        platformType: 'side',
        features: [],
      },
      {
        id: 'l5-scz-towards-ckb',
        direction: { destinationCodes: ['CKB'] },
        disembarkingSide: 'right',
        platformType: 'side',
        features: [],
      },
    ],

    HSP: [
      {
        id: 'l5-hsp-towards-cpr',
        direction: { destinationCodes: ['CPR'] },
        disembarkingSide: 'right',
        platformType: 'side',
        features: [],
      },
      {
        id: 'l5-hsp-towards-ckb',
        direction: { destinationCodes: ['CKB'] },
        disembarkingSide: 'right',
        platformType: 'side',
        features: [],
      },
    ],

    SER: [
      {
        id: 'l5-ser-towards-cpr',
        direction: { destinationCodes: ['CPR'] },
        disembarkingSide: 'right',
        platformType: 'side',
        features: [],
      },
      {
        id: 'l5-ser-towards-ckb',
        direction: { destinationCodes: ['CKB'] },
        disembarkingSide: 'right',
        platformType: 'side',
        features: [],
      },
    ],

    MOE: [
      {
        id: 'l5-moe-towards-cpr',
        direction: { destinationCodes: ['CPR'] },
        disembarkingSide: 'right',
        platformType: 'side',
        features: [],
      },
      {
        id: 'l5-moe-towards-ckb',
        direction: { destinationCodes: ['CKB'] },
        disembarkingSide: 'right',
        platformType: 'side',
        features: [],
      },
    ],

    ECT: [
      {
        id: 'l5-ect-towards-cpr',
        direction: { destinationCodes: ['CPR'] },
        disembarkingSide: 'right',
        platformType: 'side',
        features: [],
      },
      {
        id: 'l5-ect-towards-ckb',
        direction: { destinationCodes: ['CKB'] },
        disembarkingSide: 'right',
        platformType: 'side',
        features: [],
      },
    ],

    CPB: [
      {
        id: 'l5-cpb-towards-cpr',
        direction: { destinationCodes: ['CPR'] },
        disembarkingSide: 'left',
        platformType: 'island',
        features: [],
      },
      {
        id: 'l5-cpb-towards-ckb',
        direction: { destinationCodes: ['CKB'] },
        disembarkingSide: 'left',
        platformType: 'island',
        features: [],
      },
    ],

    BRK: [
      {
        id: 'l5-brk-towards-cpr',
        direction: { destinationCodes: ['CPR'] },
        disembarkingSide: 'left',
        platformType: 'island',
        features: [],
      },
      {
        id: 'l5-brk-towards-ckb',
        direction: { destinationCodes: ['CKB'] },
        disembarkingSide: 'left',
        platformType: 'island',
        features: [],
      },
    ],

    BGA: [
      {
        id: 'l5-bga-towards-cpr',
        direction: { destinationCodes: ['CPR'] },
        disembarkingSide: 'left',
        platformType: 'island',
        features: [],
      },
      {
        id: 'l5-bga-towards-ckb',
        direction: { destinationCodes: ['CKB'] },
        disembarkingSide: 'left',
        platformType: 'island',
        features: [],
      },
    ],

    ABV: [
      {
        id: 'l5-abv-towards-cpr',
        direction: { destinationCodes: ['CPR'] },
        disembarkingSide: 'left',
        platformType: 'island',
        features: [],
      },
      {
        id: 'l5-abv-towards-ckb',
        direction: { destinationCodes: ['CKB'] },
        disembarkingSide: 'left',
        platformType: 'island',
        features: [],
      },
    ],

    APN: [
      {
        id: 'l5-apn-towards-cpr',
        direction: { destinationCodes: ['CPR'] },
        disembarkingSide: 'right',
        platformType: 'side',
        features: [],
      },
      {
        id: 'l5-apn-towards-ckb',
        direction: { destinationCodes: ['CKB'] },
        disembarkingSide: 'right',
        platformType: 'side',
        features: [],
      },
    ],

    LTR: [
      {
        id: 'l5-ltr-towards-cpr',
        direction: { destinationCodes: ['CPR'] },
        disembarkingSide: 'right',
        platformType: 'side',
        features: [],
      },
      {
        id: 'l5-ltr-towards-ckb',
        direction: { destinationCodes: ['CKB'] },
        disembarkingSide: 'right',
        platformType: 'side',
        features: [],
      },
    ],

    STA: [
      {
        id: 'l5-sta-towards-cpr',
        direction: { destinationCodes: ['CPR'] },
        disembarkingSide: 'right',
        platformType: 'side',
        features: [],
      },
      {
        id: 'l5-sta-towards-ckb',
        direction: { destinationCodes: ['CKB'] },
        disembarkingSide: 'right',
        platformType: 'side',
        features: [],
      },
    ],

    GGR: [
      {
        id: 'l5-ggr-towards-cpr',
        direction: { destinationCodes: ['CPR'] },
        disembarkingSide: 'right',
        platformType: 'side',
        features: [],
      },
      {
        id: 'l5-ggr-towards-ckb',
        direction: { destinationCodes: ['CKB'] },
        disembarkingSide: 'right',
        platformType: 'side',
        features: [],
      },
    ],

    VBE: [
      {
        id: 'l5-vbe-towards-cpr',
        direction: { destinationCodes: ['CPR'] },
        disembarkingSide: 'right',
        platformType: 'side',
        features: [],
      },
      {
        id: 'l5-vbe-towards-ckb',
        direction: { destinationCodes: ['CKB'] },
        disembarkingSide: 'right',
        platformType: 'side',
        features: [],
      },
    ],

    CPL: [
      {
        id: 'l5-cpl-towards-cpr',
        direction: { destinationCodes: ['CPR'] },
        disembarkingSide: 'right',
        platformType: 'side',
        features: [],
      },
      {
        id: 'l5-cpl-towards-ckb',
        direction: { destinationCodes: ['CKB'] },
        disembarkingSide: 'right',
        platformType: 'side',
        features: [],
      },
    ],

    CPR: [
      {
        id: 'l5-cpr-towards-ckb',
        direction: { destinationCodes: ['CKB'] },
        disembarkingSide: 'right',
        platformType: 'side',
        features: [],
      },
    ],
  },
});
