import { defineTrainLinePlatformConfig } from '../../train-platform-config';

export const L15_TRAIN_PLATFORM_CONFIG = defineTrainLinePlatformConfig({
  lineCode: 'L15',
  platforms: {
    VPT: [
      {
        id: 'l15-vpt-towards-igt',
        direction: { destinationCodes: ['IGT'] },
        disembarkingSide: 'left',
        features: [],
      },
    ],

    ORT: [
      {
        id: 'l15-ort-towards-igt',
        direction: { destinationCodes: ['IGT'] },
        disembarkingSide: 'left',
        features: [],
      },
      {
        id: 'l15-ort-towards-vpt',
        direction: { destinationCodes: ['VPT'] },
        disembarkingSide: 'left',
        features: [],
      },
    ],

    SLU: [
      {
        id: 'l15-slu-towards-igt',
        direction: { destinationCodes: ['IGT'] },
        disembarkingSide: 'left',
        features: [],
      },
      {
        id: 'l15-slu-towards-vpt',
        direction: { destinationCodes: ['VPT'] },
        disembarkingSide: 'left',
        features: [],
      },
    ],

    CAD: [
      {
        id: 'l15-cad-towards-igt',
        direction: { destinationCodes: ['IGT'] },
        disembarkingSide: 'left',
        features: [],
      },
      {
        id: 'l15-cad-towards-vpt',
        direction: { destinationCodes: ['VPT'] },
        disembarkingSide: 'left',
        features: [],
      },
    ],

    VLT: [
      {
        id: 'l15-vlt-towards-igt',
        direction: { destinationCodes: ['IGT'] },
        disembarkingSide: 'left',
        features: [],
      },
      {
        id: 'l15-vlt-towards-vpt',
        direction: { destinationCodes: ['VPT'] },
        disembarkingSide: 'left',
        features: [],
      },
    ],

    VUN: [
      {
        id: 'l15-vun-towards-igt',
        direction: { destinationCodes: ['IGT'] },
        disembarkingSide: 'left',
        features: [],
      },
      {
        id: 'l15-vun-towards-vpt',
        direction: { destinationCodes: ['VPT'] },
        disembarkingSide: 'left',
        features: [],
      },
    ],

    JPL: [
      {
        id: 'l15-jpl-towards-igt',
        direction: { destinationCodes: ['IGT'] },
        disembarkingSide: 'left',
        features: [],
      },
      {
        id: 'l15-jpl-towards-vpt',
        direction: { destinationCodes: ['VPT'] },
        disembarkingSide: 'left',
        features: [],
      },
    ],

    SAP: [
      {
        id: 'l15-sap-towards-igt',
        direction: { destinationCodes: ['IGT'] },
        disembarkingSide: 'left',
        features: [],
      },
      {
        id: 'l15-sap-towards-vpt',
        direction: { destinationCodes: ['VPT'] },
        disembarkingSide: 'left',
        features: [],
      },
    ],

    FJT: [
      {
        id: 'l15-fjt-towards-igt',
        direction: { destinationCodes: ['IGT'] },
        disembarkingSide: 'left',
        features: [],
      },
      {
        id: 'l15-fjt-towards-vpt',
        direction: { destinationCodes: ['VPT'] },
        disembarkingSide: 'left',
        features: [],
      },
    ],

    MAT: [
      {
        id: 'l15-mat-towards-igt',
        direction: { destinationCodes: ['IGT'] },
        disembarkingSide: 'left',
        features: [],
      },
      {
        id: 'l15-mat-towards-vpt',
        direction: { destinationCodes: ['VPT'] },
        disembarkingSide: 'left',
        features: [],
      },
    ],

    IGT: [
      {
        id: 'l15-igt-towards-vpt',
        direction: { destinationCodes: ['VPT'] },
        disembarkingSide: 'left',
        features: [],
      },
    ],
  },
});
