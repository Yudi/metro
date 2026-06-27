import { defineTrainLinePlatformConfig } from '../../train-platform-config';

export const L10_TRAIN_PLATFORM_CONFIG = defineTrainLinePlatformConfig({
  lineCode: 'L10',
  platforms: {
    BFU: [
      // TODO: Não sei
      {
        id: 'l10-bfu-towards-rgs',
        direction: { destinationCodes: ['RGS'] },
        disembarkingSide: 'left',
        features: [],
      },
    ],

    LUZ: [
      {
        id: 'l10-luz-towards-rgs',
        direction: { destinationCodes: ['RGS'] },
        disembarkingSide: 'left',
        features: [],
      },
      {
        id: 'l10-luz-towards-bfu',
        direction: { destinationCodes: ['BFU'] },
        disembarkingSide: 'left',
        features: [],
      },
    ],

    BAS: [
      // TODO: Não sei
      {
        id: 'l10-bas-towards-rgs',
        direction: { destinationCodes: ['RGS'] },
        disembarkingSide: 'left',
        features: [],
      },
      {
        id: 'l10-bas-towards-bfu',
        direction: { destinationCodes: ['BFU'] },
        disembarkingSide: 'left',
        features: [],
      },
    ],

    MOC: [
      {
        id: 'l10-moc-towards-rgs',
        direction: { destinationCodes: ['RGS'] },
        disembarkingSide: 'left',
        features: [],
      },
      {
        id: 'l10-moc-towards-bfu',
        direction: { destinationCodes: ['BFU'] },
        disembarkingSide: 'left',
        features: [],
      },
    ],

    IPG: [
      {
        id: 'l10-ipg-towards-rgs',
        direction: { destinationCodes: ['RGS'] },
        disembarkingSide: 'left',
        features: [],
      },
      {
        id: 'l10-ipg-towards-bfu',
        direction: { destinationCodes: ['BFU'] },
        disembarkingSide: 'left',
        features: [],
      },
    ],

    TMD: [
      {
        id: 'l10-tmd-towards-rgs',
        direction: { destinationCodes: ['RGS'] },
        disembarkingSide: 'right',
        features: [],
      },
      {
        id: 'l10-tmd-towards-bfu',
        direction: { destinationCodes: ['BFU'] },
        disembarkingSide: 'right',
        features: [],
      },
    ],

    SCT: [
      // Não sei
      {
        id: 'l10-sct-towards-rgs',
        direction: { destinationCodes: ['RGS'] },
        disembarkingSide: 'left',
        features: [],
      },
      {
        id: 'l10-sct-towards-bfu',
        direction: { destinationCodes: ['BFU'] },
        disembarkingSide: 'left',
        features: [],
      },
    ],

    UTG: [
      {
        id: 'l10-utg-towards-rgs',
        direction: { destinationCodes: ['RGS'] },
        disembarkingSide: 'left',
        features: [],
      },
      {
        id: 'l10-utg-towards-bfu',
        direction: { destinationCodes: ['BFU'] },
        disembarkingSide: 'left',
        features: [],
      },
    ],

    PSA: [
      {
        id: 'l10-psa-towards-rgs',
        direction: { destinationCodes: ['RGS'] },
        disembarkingSide: 'left',
        features: [],
      },
      {
        id: 'l10-psa-towards-bfu',
        direction: { destinationCodes: ['BFU'] },
        disembarkingSide: 'left',
        features: [],
      },
    ],

    SAN: [
      // TODO: Não sei
      {
        id: 'l10-san-towards-rgs',
        direction: { destinationCodes: ['RGS'] },
        disembarkingSide: 'left',
        features: [],
      },
      {
        id: 'l10-san-towards-bfu',
        direction: { destinationCodes: ['BFU'] },
        disembarkingSide: 'left',
        features: [],
      },
    ],

    CPV: [
      {
        id: 'l10-cpv-towards-rgs',
        direction: { destinationCodes: ['RGS'] },
        disembarkingSide: 'left',
        features: [],
      },
      {
        id: 'l10-cpv-towards-bfu',
        direction: { destinationCodes: ['BFU'] },
        disembarkingSide: 'left',
        features: [],
      },
    ],

    MAU: [
      // TODO: Não sei
      {
        id: 'l10-mau-towards-rgs',
        direction: { destinationCodes: ['RGS'] },
        disembarkingSide: 'left',
        features: [],
      },
      {
        id: 'l10-mau-towards-bfu',
        direction: { destinationCodes: ['BFU'] },
        disembarkingSide: 'left',
        features: [],
      },
    ],

    GPT: [
      {
        id: 'l10-gpt-towards-rgs',
        direction: { destinationCodes: ['RGS'] },
        disembarkingSide: 'left',
        features: [],
      },
      {
        id: 'l10-gpt-towards-bfu',
        direction: { destinationCodes: ['BFU'] },
        disembarkingSide: 'left',
        features: [],
      },
    ],

    RPI: [
      {
        id: 'l10-rpi-towards-rgs',
        direction: { destinationCodes: ['RGS'] },
        disembarkingSide: 'left',
        features: [],
      },
      {
        id: 'l10-rpi-towards-bfu',
        direction: { destinationCodes: ['BFU'] },
        disembarkingSide: 'left',
        features: [],
      },
    ],

    RGS: [
      {
        id: 'l10-rgs-towards-bfu',
        direction: { destinationCodes: ['BFU'] },
        disembarkingSide: 'left',
        features: [],
      },
      {
        id: 'l10-rgs-towards-rgf',
        direction: { destinationCodes: ['rgs'] },
        disembarkingSide: 'left',
        features: [],
      },
    ],
  },
});
