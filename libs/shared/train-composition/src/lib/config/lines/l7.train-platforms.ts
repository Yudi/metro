import { defineTrainLinePlatformConfig } from '../../train-platform-config';

export const L7_TRAIN_PLATFORM_CONFIG = defineTrainLinePlatformConfig({
  lineCode: 'L7',
  platforms: {
    BFU: [
      {
        id: 'l7-bfu-towards-bfu',
        direction: { destinationCodes: ['BFU'] },
        disembarkingSide: 'right',
        platformType: 'side',
        features: [],
      },
      {
        id: 'l7-bfu-towards-jun',
        direction: { destinationCodes: ['JUN'] },
        disembarkingSide: 'right',
        platformType: 'side',
        features: [],
      },
    ],

    ABR: [
      {
        id: 'l7-abr-towards-jun',
        direction: { destinationCodes: ['JUN'] },
        disembarkingSide: 'left',
        platformType: 'side',
        features: [],
      },
      {
        id: 'l7-abr-towards-bfu',
        direction: { destinationCodes: ['BFU'] },
        disembarkingSide: 'left',
        platformType: 'side',
        features: [],
      },
    ],

    LPA: [
      {
        id: 'l7-lpa-towards-jun',
        direction: { destinationCodes: ['JUN'] },
        disembarkingSide: 'left',
        platformType: 'side',
        features: [],
      },
      {
        id: 'l7-lpa-towards-bfu',
        direction: { destinationCodes: ['BFU'] },
        disembarkingSide: 'left',
        platformType: 'side',
        features: [],
      },
    ],

    PQR: [
      {
        id: 'l7-pqr-towards-jun',
        direction: { destinationCodes: ['JUN'] },
        disembarkingSide: 'left',
        platformType: 'side',
        features: [],
      },
      {
        id: 'l7-pqr-towards-bfu',
        direction: { destinationCodes: ['BFU'] },
        disembarkingSide: 'left',
        platformType: 'side',
        features: [],
      },
    ],

    PRT: [
      {
        id: 'l7-prt-towards-jun',
        direction: { destinationCodes: ['JUN'] },
        disembarkingSide: 'left',
        platformType: 'both',
        features: [],
      },
      {
        id: 'l7-prt-towards-bfu',
        direction: { destinationCodes: ['BFU'] },
        disembarkingSide: 'left',
        platformType: 'both',
        features: [],
      },
    ],

    VCL: [
      {
        id: 'l7-vcl-towards-jun',
        direction: { destinationCodes: ['JUN'] },
        disembarkingSide: 'left',
        platformType: 'side',
        features: [],
      },
      {
        id: 'l7-vcl-towards-bfu',
        direction: { destinationCodes: ['BFU'] },
        disembarkingSide: 'left',
        platformType: 'side',
        features: [],
      },
    ],

    JRG: [
      {
        id: 'l7-jrg-towards-jun',
        direction: { destinationCodes: ['JUN'] },
        disembarkingSide: 'left',
        platformType: 'side',
        features: [],
      },
      {
        id: 'l7-jrg-towards-bfu',
        direction: { destinationCodes: ['BFU'] },
        disembarkingSide: 'left',
        platformType: 'side',
        features: [],
      },
    ],

    VAU: [
      {
        id: 'l7-vau-towards-jun',
        direction: { destinationCodes: ['JUN'] },
        disembarkingSide: 'right',
        platformType: 'island',
        features: [],
      },
      {
        id: 'l7-vau-towards-bfu',
        direction: { destinationCodes: ['BFU'] },
        disembarkingSide: 'right',
        platformType: 'island',
        features: [],
      },
    ],

    PRU: [
      {
        id: 'l7-pru-towards-jun',
        direction: { destinationCodes: ['JUN'] },
        disembarkingSide: 'left',
        platformType: 'side',
        features: [],
      },
      {
        id: 'l7-pru-towards-bfu',
        direction: { destinationCodes: ['BFU'] },
        disembarkingSide: 'left',
        platformType: 'side',
        features: [],
      },
    ],

    CAI: [
      {
        id: 'l7-cai-towards-jun',
        direction: { destinationCodes: ['JUN'] },
        disembarkingSide: 'left',
        platformType: 'side',
        features: [],
      },
      {
        id: 'l7-cai-towards-bfu',
        direction: { destinationCodes: ['BFU'] },
        disembarkingSide: 'left',
        platformType: 'side',
        features: [],
      },
    ],

    FDR: [
      {
        id: 'l7-fdr-towards-jun',
        direction: { destinationCodes: ['JUN'] },
        disembarkingSide: 'right',
        platformType: 'island',
        features: [],
      },
      {
        id: 'l7-fdr-towards-bfu',
        direction: { destinationCodes: ['BFU'] },
        disembarkingSide: 'right',
        platformType: 'island',
        features: [],
      },
    ],

    BFI: [
      {
        id: 'l7-bfi-towards-jun',
        direction: { destinationCodes: ['JUN'] },
        disembarkingSide: 'left',
        platformType: 'side',
        features: [],
      },
      {
        id: 'l7-bfi-towards-bfu',
        direction: { destinationCodes: ['BFU'] },
        disembarkingSide: 'left',
        platformType: 'side',
        features: [],
      },
    ],

    FMO: [
      {
        id: 'l7-fmo-towards-jun',
        direction: { destinationCodes: ['JUN'] },
        disembarkingSide: 'right',
        platformType: 'both',
        features: [],
      },
      {
        id: 'l7-fmo-towards-bfu',
        direction: { destinationCodes: ['BFU'] },
        disembarkingSide: 'right',
        platformType: 'both',
        features: [],
      },
    ],

    BTJ: [
      {
        id: 'l7-btj-towards-jun',
        direction: { destinationCodes: ['JUN'] },
        disembarkingSide: 'left',
        platformType: 'side',
        features: [],
      },
      {
        id: 'l7-btj-towards-bfu',
        direction: { destinationCodes: ['BFU'] },
        disembarkingSide: 'left',
        platformType: 'side',
        features: [],
      },
    ],

    CLP: [
      {
        id: 'l7-clp-towards-jun',
        direction: { destinationCodes: ['JUN'] },
        disembarkingSide: 'left',
        platformType: 'side',
        features: [],
      },
      {
        id: 'l7-clp-towards-bfu',
        direction: { destinationCodes: ['BFU'] },
        disembarkingSide: 'left',
        platformType: 'side',
        features: [],
      },
    ],

    VPL: [
      {
        id: 'l7-vpl-towards-jun',
        direction: { destinationCodes: ['JUN'] },
        disembarkingSide: 'left',
        platformType: 'side',
        features: [],
      },
      {
        id: 'l7-vpl-towards-bfu',
        direction: { destinationCodes: ['BFU'] },
        disembarkingSide: 'left',
        platformType: 'side',
        features: [],
      },
    ],

    JUN: [
      {
        id: 'l7-jun-towards-bfu',
        direction: { destinationCodes: ['BFU'] },
        disembarkingSide: 'right',
        platformType: 'both',
        features: [],
      },
      {
        id: 'l7-jun-towards-jun',
        direction: { destinationCodes: ['JUN'] },
        disembarkingSide: 'right',
        platformType: 'both',
        features: [],
      },
    ],
  },
});
