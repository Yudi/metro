import { defineTrainLinePlatformConfig } from '../../train-platform-config';

export const L2_TRAIN_PLATFORM_CONFIG = defineTrainLinePlatformConfig({
  lineCode: 'L2',
  platforms: {
    VMD: [
      {
        id: 'l2-vmd-towards-vmd',
        direction: { destinationCodes: ['VMD'] },
        disembarkingSide: 'right',
        features: [],
      },
      {
        id: 'l2-vmd-towards-vpt',
        direction: { destinationCodes: ['VPT'] },
        disembarkingSide: 'right',
        features: [],
      },
    ],

    SUM: [
      {
        id: 'l2-sum-towards-vpt',
        direction: { destinationCodes: ['VPT'] },
        disembarkingSide: 'right',
        features: [],
      },
      {
        id: 'l2-sum-towards-vmd',
        direction: { destinationCodes: ['VMD'] },
        disembarkingSide: 'right',
        features: [],
      },
    ],

    CLI: [
      {
        id: 'l2-cli-towards-vpt',
        direction: { destinationCodes: ['VPT'] },
        disembarkingSide: 'right',
        features: [],
      },
      {
        id: 'l2-cli-towards-vmd',
        direction: { destinationCodes: ['VMD'] },
        disembarkingSide: 'right',
        features: [],
      },
    ],

    CNS: [
      {
        id: 'l2-cns-towards-vpt',
        direction: { destinationCodes: ['VPT'] },
        disembarkingSide: 'left',
        trainFacingSideRelativeToBoarding: 'left',
        platformType: 'island',
        features: [
          {
            id: 'l2-cns-vpt-exit-before-first-car',
            type: 'exit',
            label: 'Saída da estação antes do primeiro carro',
            anchor: { type: 'before-first-car' },
          },
          {
            id: 'l2-cns-vpt-transfer-after-last-car',
            type: 'transfer',
            label: 'Transferência após o último carro',
            anchor: { type: 'after-last-car' },
          },
        ],
      },
      {
        id: 'l2-cns-towards-vmd',
        direction: { destinationCodes: ['VMD'] },
        disembarkingSide: 'left',
        trainFacingSideRelativeToBoarding: 'left',
        platformType: 'island',
        features: [
          {
            id: 'l2-cns-vmd-transfer-before-first-car',
            type: 'transfer',
            label: 'Transferência antes do primeiro carro',
            anchor: { type: 'before-first-car' },
          },
          {
            id: 'l2-cns-vmd-exit-after-last-car',
            type: 'exit',
            label: 'Saída da estação após o último carro',
            anchor: { type: 'after-last-car' },
          },
        ],
      },
    ],

    TRI: [
      {
        id: 'l2-tri-towards-vpt',
        direction: { destinationCodes: ['VPT'] },
        disembarkingSide: 'left',
        features: [],
      },
      {
        id: 'l2-tri-towards-vmd',
        direction: { destinationCodes: ['VMD'] },
        disembarkingSide: 'left',
        features: [],
      },
    ],

    BGD: [
      {
        id: 'l2-bgd-towards-vpt',
        direction: { destinationCodes: ['VPT'] },
        disembarkingSide: 'left',
        features: [],
      },
      {
        id: 'l2-bgd-towards-vmd',
        direction: { destinationCodes: ['VMD'] },
        disembarkingSide: 'left',
        features: [],
      },
    ],

    PSO: [
      {
        id: 'l2-pso-towards-vpt',
        direction: { destinationCodes: ['VPT'] },
        disembarkingSide: 'right',
        features: [
          {
            id: 'l2-pso-vpt-stairs-rear-door-5',
            type: 'stairs',
            label: 'Escada na 5ª porta, contando de trás para frente',
            anchor: {
              type: 'door',
              carPosition: 5,
              doorPosition: 4,
            },
          },
        ],
      },
      {
        id: 'l2-pso-towards-vmd',
        direction: { destinationCodes: ['VMD'] },
        disembarkingSide: 'right',
        features: [
          {
            id: 'l2-pso-vmd-stairs-between-doors-2-3',
            type: 'stairs',
            label: 'Escada entre as portas 2 e 3',
            anchor: {
              type: 'between-doors',
              carPosition: 1,
              fromDoorPosition: 2,
              toDoorPosition: 3,
            },
          },
          {
            id: 'l2-pso-vmd-escalator-up-door-5',
            type: 'escalator-up',
            label: 'Escada rolante subindo na porta 5',
            anchor: {
              type: 'door',
              carPosition: 2,
              doorPosition: 1,
            },
          },
          {
            id: 'l2-pso-vmd-escalator-down-door-5',
            type: 'escalator-down',
            label: 'Escada rolante descendo na porta 5',
            anchor: {
              type: 'door',
              carPosition: 2,
              doorPosition: 1,
            },
          },
        ],
      },
    ],

    ANR: [
      {
        id: 'l2-anr-towards-vpt',
        direction: { destinationCodes: ['VPT'] },
        disembarkingSide: 'left',
        features: [],
      },
      {
        id: 'l2-anr-towards-vmd',
        direction: { destinationCodes: ['VMD'] },
        disembarkingSide: 'left',
        features: [],
      },
    ],

    CKB: [
      {
        id: 'l2-ckb-towards-vpt',
        direction: { destinationCodes: ['VPT'] },
        disembarkingSide: 'left',
        features: [],
      },
      {
        id: 'l2-ckb-towards-vmd',
        direction: { destinationCodes: ['VMD'] },
        disembarkingSide: 'left',
        features: [],
      },
    ],

    IMG: [
      {
        id: 'l2-img-towards-vpt',
        direction: { destinationCodes: ['VPT'] },
        disembarkingSide: 'left',
        features: [],
      },
      {
        id: 'l2-img-towards-vmd',
        direction: { destinationCodes: ['VMD'] },
        disembarkingSide: 'left',
        features: [],
      },
    ],

    AIP: [
      {
        id: 'l2-aip-towards-vpt',
        direction: { destinationCodes: ['VPT'] },
        disembarkingSide: 'right',
        features: [],
      },
      {
        id: 'l2-aip-towards-vmd',
        direction: { destinationCodes: ['VMD'] },
        disembarkingSide: 'right',
        features: [],
      },
    ],

    SAC: [
      {
        id: 'l2-sac-towards-vpt',
        direction: { destinationCodes: ['VPT'] },
        disembarkingSide: 'right',
        features: [],
      },
      {
        id: 'l2-sac-towards-vmd',
        direction: { destinationCodes: ['VMD'] },
        disembarkingSide: 'right',
        features: [],
      },
    ],

    TTI: [
      {
        id: 'l2-tti-towards-vpt',
        direction: { destinationCodes: ['VPT'] },
        disembarkingSide: 'right',
        features: [],
      },
      {
        id: 'l2-tti-towards-vmd',
        direction: { destinationCodes: ['VMD'] },
        disembarkingSide: 'right',
        features: [],
      },
    ],

    VPT: [
      {
        id: 'l2-vpt-towards-vpt',
        direction: { destinationCodes: ['VPT'] },
        disembarkingSide: 'right',
        features: [],
      },
      {
        id: 'l2-vpt-towards-vmd',
        direction: { destinationCodes: ['VMD'] },
        disembarkingSide: 'right',
        features: [],
      },
    ],
  },
});
