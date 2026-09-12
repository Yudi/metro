import type {
  RailLineInfo,
  RailLineTrafficHand,
} from '../../../rail/rail-line.utils';
import { TransitAgency } from '../transit/transit-agency.utils';
import {
  L1_STATIONS,
  L2_STATIONS,
  L3_STATIONS,
  L5_STATIONS,
  L6_STATIONS,
  L7_STATIONS,
  L10_STATIONS,
  L11_STATIONS,
  L12_STATIONS,
  L13_STATIONS,
  L15_STATIONS,
  L17_STATIONS,
} from './stations/rail-stations.entity';
import {
  L4_STATIONS,
  L8_STATIONS,
  L9_STATIONS,
} from './viamobilidade-stations';

/**
 * Static line metadata for São Paulo's metro and metropolitan rail network.
 *
 * The line algorithms remain in the generic rail utility; this module owns
 * the city's operators, colors, train dimensions, and station catalog joins.
 */
export const RAIL_LINES: RailLineInfo[] = [
  {
    code: 1,
    lineId: 'L1',
    colorName: 'Azul',
    colorHex: '#00529F',
    agency: TransitAgency.METRO,
    fullName: 'Linha 1 - Azul',
    stations: L1_STATIONS,
    carCount: 6,
    carDoorCount: 4,
  },
  {
    code: 2,
    lineId: 'L2',
    colorName: 'Verde',
    colorHex: '#007449',
    agency: TransitAgency.METRO,
    fullName: 'Linha 2 - Verde',
    stations: L2_STATIONS,
    carCount: 6,
    carDoorCount: 4,
  },
  {
    code: 3,
    lineId: 'L3',
    colorName: 'Vermelha',
    colorHex: '#E61B3B',
    agency: TransitAgency.METRO,
    fullName: 'Linha 3 - Vermelha',
    stations: L3_STATIONS,
    carCount: 6,
    carDoorCount: 4,
  },
  {
    code: 4,
    lineId: 'L4',
    colorName: 'Amarela',
    colorHex: '#FCDF13',
    agency: TransitAgency.MOTIVA,
    fullName: 'Linha 4 - Amarela',
    stations: L4_STATIONS,
    carCount: 6,
    carDoorCount: 4,
  },
  {
    code: 5,
    lineId: 'L5',
    colorName: 'Lilás',
    colorHex: '#8552A1',
    agency: TransitAgency.MOTIVA,
    fullName: 'Linha 5 - Lilás',
    stations: L5_STATIONS,
    carCount: 6,
    carDoorCount: 4,
  },
  {
    code: 6,
    lineId: 'L6',
    colorName: 'Laranja',
    colorHex: '#F47322',
    agency: TransitAgency.LINHAUNI,
    fullName: 'Linha 6 - Laranja',
    stations: L6_STATIONS,
    carCount: 6,
    carDoorCount: 4,
  },
  {
    code: 7,
    lineId: 'L7',
    colorName: 'Rubi',
    colorHex: '#9D2A7F',
    agency: TransitAgency.TICTRENS,
    fullName: 'Linha 7 - Rubi',
    stations: L7_STATIONS,
    carCount: 8,
    carDoorCount: 4,
  },
  {
    code: 8,
    lineId: 'L8',
    colorName: 'Diamante',
    colorHex: '#969696',
    agency: TransitAgency.VIAMOBILIDADE,
    fullName: 'Linha 8 - Diamante',
    stations: L8_STATIONS,
    carCount: 8,
    carDoorCount: 4,
  },
  {
    code: 9,
    lineId: 'L9',
    colorName: 'Esmeralda',
    colorHex: '#00A78E',
    agency: TransitAgency.VIAMOBILIDADE,
    fullName: 'Linha 9 - Esmeralda',
    stations: L9_STATIONS,
    carCount: 8,
    carDoorCount: 4,
  },
  {
    code: 10,
    lineId: 'L10',
    colorName: 'Turquesa',
    colorHex: '#00A3A4',
    agency: TransitAgency.CPTM,
    fullName: 'Linha 10 - Turquesa',
    stations: L10_STATIONS,
    carCount: 8,
    carDoorCount: 4,
  },
  {
    code: 11,
    lineId: 'L11',
    colorName: 'Coral',
    colorHex: '#F35A22',
    agency: TransitAgency.TRIVIATRENS,
    fullName: 'Linha 11 - Coral',
    stations: L11_STATIONS,
    carCount: 8,
    carDoorCount: 4,
  },
  {
    code: 12,
    lineId: 'L12',
    colorName: 'Safira',
    colorHex: '#003A77',
    agency: TransitAgency.TRIVIATRENS,
    fullName: 'Linha 12 - Safira',
    stations: L12_STATIONS,
    carCount: 8,
    carDoorCount: 4,
  },
  {
    code: 13,
    lineId: 'L13',
    colorName: 'Jade',
    colorHex: '#00B067',
    agency: TransitAgency.TRIVIATRENS,
    fullName: 'Linha 13 - Jade',
    stations: L13_STATIONS,
    carCount: 8,
    carDoorCount: 4,
  },
  {
    code: 15,
    lineId: 'L15',
    colorName: 'Prata',
    colorHex: '#A8B3B0',
    agency: TransitAgency.METRO,
    fullName: 'Linha 15 - Prata',
    stations: L15_STATIONS,
    carCount: 7,
    carDoorCount: 2,
  },
  {
    code: 17,
    lineId: 'L17',
    colorName: 'Ouro',
    colorHex: '#D58405',
    agency: TransitAgency.METRO,
    fullName: 'Linha 17 - Ouro',
    stations: L17_STATIONS,
    carCount: 5,
    carDoorCount: 2,
  },
];

/** Direction of travel on the physical track from the driver's view. */
export const RAIL_LINE_TRAFFIC_HANDS: Readonly<
  Record<number, RailLineTrafficHand>
> = {
  1: 'RHT',
  2: 'RHT',
  3: 'RHT',
  4: 'RHT',
  5: 'RHT',
  6: 'RHT',
  7: 'LHT',
  8: 'RHT',
  9: 'RHT',
  10: 'LHT',
  11: 'LHT',
  12: 'LHT',
  13: 'LHT',
  15: 'RHT',
  17: 'RHT',
};

/** Mapping used when a station record supplies only its numeric line code. */
export const LINE_AGENCY_MAPPING: Record<number, TransitAgency> =
  RAIL_LINES.reduce(
    (acc, line) => {
      acc[line.code] = line.agency;
      return acc;
    },
    {} as Record<number, TransitAgency>,
  );
