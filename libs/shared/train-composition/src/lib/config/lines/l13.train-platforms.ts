import { defineTrainLinePlatformConfig } from '../../train-platform-config';

export const L13_TRAIN_PLATFORM_CONFIG = defineTrainLinePlatformConfig({
  lineCode: 'L13',
  platforms: {
    EGO: [
      // TODO: Não sei
      {
        id: 'l13-ego-towards-agu',
        direction: { destinationCodes: ['AGU'] },
        disembarkingSide: 'right',
        features: [],
      },
    ],

    GCE: [
      {
        id: 'l13-gce-towards-agu',
        direction: { destinationCodes: ['AGU'] },
        disembarkingSide: 'right',
        features: [],
      },
      {
        id: 'l13-gce-towards-ego',
        direction: { destinationCodes: ['EGO'] },
        disembarkingSide: 'right',
        features: [],
      },
    ],

    AGU: [
      {
        id: 'l13-agu-towards-ego',
        direction: { destinationCodes: ['EGO'] },
        disembarkingSide: 'left',
        features: [],
      },
      {
        id: 'l13-agu-towards-agu',
        direction: { destinationCodes: ['AGU'] },
        disembarkingSide: 'left',
        features: [],
      },
    ],
  },
});
