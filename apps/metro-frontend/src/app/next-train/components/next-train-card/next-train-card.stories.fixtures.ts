import { signal } from '@angular/core';
import type {
  NextTrainArrival,
  StationTrainData,
} from '../../next-train.types';
import { NextTrainWebsocketService } from '../../next-train-websocket.service';

export const TRAIN_ARRIVING: NextTrainArrival = {
  destinationCode: 'VAG',
  destinationName: 'Varginha',
  trainCurrentStationName: 'Villa Lobos–Jaguaré',
  arrivalTime: '21:04',
  isAtPlatform: false,
  isTrainStopped: false,
};

export const TRAIN_AT_PLATFORM: NextTrainArrival = {
  destinationCode: 'OSA',
  destinationName: 'Osasco',
  trainCurrentStationName: 'Hebraica–Rebouças',
  arrivalTime: '21:00',
  isAtPlatform: true,
  isTrainStopped: true,
};

export const TRAIN_SECOND: NextTrainArrival = {
  destinationCode: 'VAG',
  destinationName: 'Varginha',
  trainCurrentStationName: 'Cidade Universitária',
  arrivalTime: '21:12',
  isAtPlatform: false,
  isTrainStopped: false,
};

export const TRAIN_L8: NextTrainArrival = {
  destinationCode: 'JPR',
  destinationName: 'Júlio Prestes',
  trainCurrentStationName: 'Comandante Sampaio',
  arrivalTime: '14:35',
  isAtPlatform: false,
  isTrainStopped: false,
};

export const TRAIN_L4_WITH_OCCUPANCY: NextTrainArrival = {
  destinationCode: 'LUZ',
  destinationName: 'Luz',
  trainCurrentStationName: '',
  arrivalTime: '14:32',
  isAtPlatform: false,
  isTrainStopped: null,
  cars: [1, 2, 3, 4, 5, 6].map((position) => ({
    position,
    loadLevel: position as 1 | 2 | 3 | 4 | 5 | 6,
    wheelchairAccessible: position === 1,
  })),
};

export const TRAIN_STOPPED_ELSEWHERE: NextTrainArrival = {
  destinationCode: 'VAG',
  destinationName: 'Varginha',
  trainCurrentStationName: 'Villa Lobos–Jaguaré',
  arrivalTime: '21:06',
  isAtPlatform: false,
  isTrainStopped: true,
};

export const TRAIN_LAST_PASSED_FALLBACK: NextTrainArrival = {
  destinationCode: 'RGS',
  destinationName: 'Rio Grande da Serra',
  trainCurrentStationName: '',
  arrivalTime: '14:40',
  isAtPlatform: null,
  isTrainStopped: null,
  trainPositionStatus: null,
  trainLastPassedStationName: 'Brás',
};

export const TRAIN_L4_LAST_PASSED_FALLBACK: NextTrainArrival = {
  destinationCode: 'LUZ',
  destinationName: 'Luz',
  trainCurrentStationName: '',
  arrivalTime: '14:40',
  isAtPlatform: null,
  isTrainStopped: null,
  trainPositionStatus: null,
  trainLastPassedStationName: 'Butantã',
};

export const TRAIN_APPROACHING_WITH_LAST_PASSED: NextTrainArrival = {
  ...TRAIN_LAST_PASSED_FALLBACK,
  arrivalTime: '14:38',
  trainPositionStatus: 'approaching',
};

export const TRAIN_AT_STATION_WITH_LAST_PASSED: NextTrainArrival = {
  ...TRAIN_LAST_PASSED_FALLBACK,
  destinationCode: 'BFU',
  destinationName: 'Palmeiras–Barra Funda',
  arrivalTime: '14:36',
  trainPositionStatus: 'at_station',
  trainNearStationName: 'Juventus-Mooca',
};

export const TRAIN_WITHOUT_POSITION_METADATA: NextTrainArrival = {
  ...TRAIN_LAST_PASSED_FALLBACK,
  trainPositionStatus: null,
  trainLastPassedStationName: null,
};

export const TRAIN_LONG_LAST_PASSED_NAME: NextTrainArrival = {
  ...TRAIN_LAST_PASSED_FALLBACK,
  trainLastPassedStationName: 'São Caetano do Sul-Prefeito Walter Braido',
};

type SubscriptionKey = `${string}:${string}`;

export interface MockNextTrainServiceOptions {
  connected: boolean;
  lastUpdate: number | null;
  trains: NextTrainArrival[];
  lineCode: string;
  stationCode: string;
  operationClosed?: boolean;
  outOfSchedule?: boolean;
}

export function createMockNextTrainService(
  opts: MockNextTrainServiceOptions,
): Partial<NextTrainWebsocketService> {
  const dataMap = new Map<SubscriptionKey, StationTrainData>();
  const key: SubscriptionKey = `${opts.lineCode}:${opts.stationCode}`;
  if (opts.trains.length > 0 || opts.lastUpdate !== null) {
    dataMap.set(key, {
      trains: opts.trains,
      hasError: false,
      dataReceived: opts.lastUpdate !== null,
      processing: false,
      operationClosed: opts.operationClosed ?? false,
      outOfSchedule: opts.outOfSchedule ?? false,
    });
  }

  return {
    connected: signal(opts.connected),
    lastUpdate: signal(opts.lastUpdate),
    stationData: signal(dataMap),
    subscribe: () => () => undefined,
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    unsubscribe: () => {},
    getTrains: (lineCode: 'L8' | 'L9', stationCode: string) => {
      const subscriptionKey: SubscriptionKey = `${lineCode}:${stationCode}`;
      return dataMap.get(subscriptionKey)?.trains ?? [];
    },
  };
}

export function createNextTrainCardProviders(
  opts: MockNextTrainServiceOptions,
) {
  return [
    {
      provide: NextTrainWebsocketService,
      useValue: createMockNextTrainService(opts),
    },
  ];
}
