import { defineTrainLinePlatformConfig } from '../../train-platform-config';

export const L13_TRAIN_PLATFORM_CONFIG = defineTrainLinePlatformConfig({
  lineCode: 'L13',
  platforms: {
    EGO: [
      {
        id: 'l13-ego-towards-agu',
        direction: { destinationCodes: ['AGU'] },
        disembarkingSide: 'right',
        directionalFactReview: {
          status: 'reviewed',
          source:
            'https://www.metrocptm.com.br/linha-13-jade-tera-inedito-viaduto-estaiado-duplo/',
          lastReviewedAt: '2026-09-04',
        },
        platformType: 'island',
        features: [],
      },
    ],

    GCE: [
      {
        id: 'l13-gce-towards-agu',
        direction: { destinationCodes: ['AGU'] },
        disembarkingSide: 'right',
        platformType: 'island',
        features: [],
      },
      {
        id: 'l13-gce-towards-ego',
        direction: { destinationCodes: ['EGO'] },
        disembarkingSide: 'right',
        platformType: 'island',
        features: [],
      },
    ],

    AGU: [
      {
        id: 'l13-agu-towards-ego',
        direction: { destinationCodes: ['EGO'] },
        disembarkingSide: 'left',
        platformType: 'side',
        features: [],
      },
      {
        id: 'l13-agu-towards-agu',
        direction: { destinationCodes: ['AGU'] },
        disembarkingSide: 'left',
        platformType: 'side',
        features: [],
      },
    ],
  },
});
