import { defineTrainLinePlatformConfig } from '../../train-platform-config';

export const L10_TRAIN_PLATFORM_CONFIG = defineTrainLinePlatformConfig({
  lineCode: 'L10',
  platforms: {
    BFU: [
      {
        id: 'l10-bfu-towards-rgs',
        direction: { destinationCodes: ['RGS'] },
        disembarkingSide: 'right',
        directionalFactReview: {
          status: 'reviewed',
          source:
            'https://www.metrocptm.com.br/cptm-altera-plataforma-de-embarque-na-estacao-palmeiras-barra-funda/',
          lastReviewedAt: '2026-09-04',
        },
        platformType: 'island',
        features: [],
      },
    ],

    LUZ: [
      {
        id: 'l10-luz-towards-rgs',
        platformType: 'both',
        direction: { destinationCodes: ['RGS'] },
        disembarkingSide: 'left',
        directionalFactReview: {
          status: 'reviewed',
          source:
            'https://pt.wikipedia.org/wiki/Esta%C3%A7%C3%A3o_da_Luz',
          lastReviewedAt: '2026-09-04',
        },
        features: [],
      },
      {
        id: 'l10-luz-towards-bfu',
        platformType: 'both',
        direction: { destinationCodes: ['BFU'] },
        disembarkingSide: 'left',
        features: [],
      },
    ],

    BAS: [
      {
        id: 'l10-bas-towards-rgs',
        platformType: 'both',
        direction: { destinationCodes: ['RGS'] },
        disembarkingSide: 'left',
        directionalFactReview: {
          status: 'reviewed',
          source:
            'https://pt.wikipedia.org/wiki/Esta%C3%A7%C3%A3o_Br%C3%A1s',
          lastReviewedAt: '2026-09-04',
        },
        features: [],
      },
      {
        id: 'l10-bas-towards-bfu',
        platformType: 'both',
        direction: { destinationCodes: ['BFU'] },
        disembarkingSide: 'left',
        features: [],
      },
    ],

    MOC: [
      {
        id: 'l10-moc-towards-rgs',
        platformType: 'side',
        direction: { destinationCodes: ['RGS'] },
        disembarkingSide: 'left',
        directionalFactReview: {
          status: 'reviewed',
          source:
            'https://www.metrocptm.com.br/cptm-tem-linhas-demais-para-poucos-trilhos/',
          lastReviewedAt: '2026-09-04',
        },
        features: [],
      },
      {
        id: 'l10-moc-towards-bfu',
        platformType: 'side',
        direction: { destinationCodes: ['BFU'] },
        disembarkingSide: 'left',
        features: [],
      },
    ],

    IPG: [
      {
        id: 'l10-ipg-towards-rgs',
        platformType: 'side',
        direction: { destinationCodes: ['RGS'] },
        disembarkingSide: 'left',
        directionalFactReview: {
          status: 'reviewed',
          source:
            'https://www.metrocptm.com.br/cptm-tem-linhas-demais-para-poucos-trilhos/',
          lastReviewedAt: '2026-09-04',
        },
        features: [],
      },
      {
        id: 'l10-ipg-towards-bfu',
        platformType: 'side',
        direction: { destinationCodes: ['BFU'] },
        disembarkingSide: 'left',
        features: [],
      },
    ],

    TMD: [
      {
        id: 'l10-tmd-towards-rgs',
        platformType: 'island',
        direction: { destinationCodes: ['RGS'] },
        disembarkingSide: 'right',
        features: [],
      },
      {
        id: 'l10-tmd-towards-bfu',
        platformType: 'island',
        direction: { destinationCodes: ['BFU'] },
        disembarkingSide: 'right',
        features: [],
      },
    ],

    SCT: [
      // Não sei
      {
        id: 'l10-sct-towards-rgs',
        platformType: 'both',
        direction: { destinationCodes: ['RGS'] },
        disembarkingSide: 'left',
        features: [],
      },
      {
        id: 'l10-sct-towards-bfu',
        platformType: 'both',
        direction: { destinationCodes: ['BFU'] },
        disembarkingSide: 'left',
        features: [],
      },
    ],

    UTG: [
      {
        id: 'l10-utg-towards-rgs',
        platformType: 'side',
        direction: { destinationCodes: ['RGS'] },
        disembarkingSide: 'left',
        features: [],
      },
      {
        id: 'l10-utg-towards-bfu',
        platformType: 'side',
        direction: { destinationCodes: ['BFU'] },
        disembarkingSide: 'left',
        features: [],
      },
    ],

    PSA: [
      {
        id: 'l10-psa-towards-rgs',
        platformType: 'side',
        direction: { destinationCodes: ['RGS'] },
        disembarkingSide: 'left',
        features: [],
      },
      {
        id: 'l10-psa-towards-bfu',
        platformType: 'side',
        direction: { destinationCodes: ['BFU'] },
        disembarkingSide: 'left',
        features: [],
      },
    ],

    SAN: [
      // TODO: Não sei
      {
        id: 'l10-san-towards-rgs',
        platformType: 'both',
        direction: { destinationCodes: ['RGS'] },
        disembarkingSide: 'left',
        features: [],
      },
      {
        id: 'l10-san-towards-bfu',
        platformType: 'both',
        direction: { destinationCodes: ['BFU'] },
        disembarkingSide: 'left',
        features: [],
      },
    ],

    CPV: [
      {
        id: 'l10-cpv-towards-rgs',
        platformType: 'side',
        direction: { destinationCodes: ['RGS'] },
        disembarkingSide: 'left',
        features: [],
      },
      {
        id: 'l10-cpv-towards-bfu',
        platformType: 'side',
        direction: { destinationCodes: ['BFU'] },
        disembarkingSide: 'left',
        features: [],
      },
    ],

    MAU: [
      // TODO: Não sei
      {
        id: 'l10-mau-towards-rgs',
        platformType: 'both',
        direction: { destinationCodes: ['RGS'] },
        disembarkingSide: 'left',
        features: [],
      },
      {
        id: 'l10-mau-towards-bfu',
        platformType: 'both',
        direction: { destinationCodes: ['BFU'] },
        disembarkingSide: 'left',
        features: [],
      },
    ],

    GPT: [
      {
        id: 'l10-gpt-towards-rgs',
        platformType: 'side',
        direction: { destinationCodes: ['RGS'] },
        disembarkingSide: 'left',
        features: [],
      },
      {
        id: 'l10-gpt-towards-bfu',
        platformType: 'side',
        direction: { destinationCodes: ['BFU'] },
        disembarkingSide: 'left',
        features: [],
      },
    ],

    RPI: [
      {
        id: 'l10-rpi-towards-rgs',
        platformType: 'side',
        direction: { destinationCodes: ['RGS'] },
        disembarkingSide: 'left',
        features: [],
      },
      {
        id: 'l10-rpi-towards-bfu',
        platformType: 'side',
        direction: { destinationCodes: ['BFU'] },
        disembarkingSide: 'left',
        features: [],
      },
    ],

    RGS: [
      {
        id: 'l10-rgs-towards-bfu',
        platformType: 'side',
        direction: { destinationCodes: ['BFU'] },
        disembarkingSide: 'left',
        features: [],
      },
      {
        id: 'l10-rgs-towards-rgf',
        platformType: 'side',
        direction: { destinationCodes: ['rgs'] },
        disembarkingSide: 'left',
        features: [],
      },
    ],
  },
});
