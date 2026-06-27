import { DEFAULT_TRANSIT_TIME_ZONE } from './date-time.utils';

export const SPECIAL_RAIL_TIMEZONE = DEFAULT_TRANSIT_TIME_ZONE;

export const SPECIAL_RAIL_LINE_CODES = {
  EXPRESSO_AEROPORTO: 'EA',
  EXPRESSO_LINHA_10: '10X',
  AEROMOVEL_GRU: 'GRU',
} as const;

export type SpecialRailLineCode =
  (typeof SPECIAL_RAIL_LINE_CODES)[keyof typeof SPECIAL_RAIL_LINE_CODES];

export const SPECIAL_RAIL_LINE_KEYWORDS = {
  EXPRESSO_AEROPORTO: 'Expresso Aeroporto',
  EXPRESSO: 'Expresso',
} as const;

export const EXPRESSO_AEROPORTO_SCHEDULE = {
  firstDeparture: '05:00',
  lastDeparture: '00:00',
  weekdayIntervalMinutes: 60,
  sundayIntervalMinutes: 30,
} as const;

export const EXPRESSO_LINHA_10_SCHEDULE = {
  departures: {
    santoAndre: [
      '05:40',
      '06:00',
      '06:20',
      '06:40',
      '07:00',
      '07:20',
      '07:40',
      '08:00',
      '08:20',
      '08:40',
      '09:00',
      '16:10',
      '16:30',
      '16:50',
      '17:10',
      '17:30',
      '17:50',
      '18:10',
      '18:30',
      '18:50',
      '19:10',
      '19:30',
      '19:50',
    ],
    tamanduatei: [
      '05:50',
      '06:10',
      '06:30',
      '06:50',
      '07:10',
      '07:30',
      '07:50',
      '08:10',
      '08:30',
      '08:50',
      '16:00',
      '16:20',
      '16:40',
      '17:00',
      '17:20',
      '17:40',
      '18:00',
      '18:20',
      '18:40',
      '19:00',
      '19:20',
      '19:40',
      '20:00',
    ],
  },
  weekdaysOnly: true,
  closedUntil: '04:00',
  closedAfter: '20:00',
} as const;

export const AEROMOVEL_GRU_OPERATION = {
  openFrom: '16:00',
  openUntil: '00:00',
} as const;

export const TRANSFER_CPTM_METRO_INFO = {
  id: 'transfer-cptm-metro',
  title: 'Transferência CPTM e Metrô',
  subtitle: 'Tatuapé e Itaquera',
  badgeIcon: 'transit_ticket',
  operationStart: '04:00',
  operationEnd: '00:00',
  weekdayFreeWindows: [
    { start: '10:00', end: '17:00' },
    { start: '20:00', end: '00:00' },
  ],
} as const;

export const TRANSFER_CPTM_METRO_STATUS_LABELS = {
  FREE: 'Gratuita',
  PAID: 'Tarifada',
  CLOSED: 'Encerrada',
} as const;

export const SAO_PAULO_LOCAL_HOLIDAYS = [
  {
    month: 1,
    day: 25,
    name: 'Aniversário da Cidade de São Paulo',
    type: 'local',
  },
  {
    month: 7,
    day: 9,
    name: 'Revolução Constitucionalista de 1932',
    type: 'local',
  },
] as const;

export const SAO_PAULO_CITY_HOLIDAY = SAO_PAULO_LOCAL_HOLIDAYS[0];
