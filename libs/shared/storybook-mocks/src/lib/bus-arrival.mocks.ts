import type { StopArrivalUpdate } from './bus-data.types';

// Mock Arrival Predictions

function getCurrentTimeString(): string {
  const now = new Date();
  return `${now.getHours().toString().padStart(2, '0')}:${now
    .getMinutes()
    .toString()
    .padStart(2, '0')}`;
}

function getTimeInMinutes(minutes: number): string {
  const now = new Date();
  now.setMinutes(now.getMinutes() + minutes);
  return `${now.getHours().toString().padStart(2, '0')}:${now
    .getMinutes()
    .toString()
    .padStart(2, '0')}`;
}

export function createMockArrivals(stopCode: string): StopArrivalUpdate {
  return {
    stopCode,
    hr: getCurrentTimeString(),
    p: {
      cp: parseInt(stopCode, 10),
      np: 'Ponto de teste',
      py: -23.5669,
      px: -46.6918,
      l: [
        {
          c: '477A-10',
          cl: 477,
          sl: 1,
          lt0: 'Pinheiros',
          lt1: 'Metrô Santana',
          qv: 2,
          vs: [
            {
              p: 12345,
              a: true,
              ta: new Date().toISOString(),
              py: -23.568,
              px: -46.693,
              t: getTimeInMinutes(3),
            },
            {
              p: 12346,
              a: false,
              ta: new Date().toISOString(),
              py: -23.57,
              px: -46.695,
              t: getTimeInMinutes(8),
            },
          ],
        },
        {
          c: '775A-10',
          cl: 775,
          sl: 1,
          lt0: 'Pinheiros',
          lt1: 'Term. Pirituba',
          qv: 1,
          vs: [
            {
              p: 23456,
              a: true,
              ta: new Date().toISOString(),
              py: -23.565,
              px: -46.69,
              t: getTimeInMinutes(5),
            },
          ],
        },
        {
          c: '177H-10',
          cl: 177,
          sl: 2,
          lt0: 'Lapa',
          lt1: 'Metrô Butantã',
          qv: 3,
          vs: [
            {
              p: 34567,
              a: false,
              ta: new Date().toISOString(),
              py: -23.566,
              px: -46.688,
              t: getTimeInMinutes(1),
            },
            {
              p: 34568,
              a: true,
              ta: new Date().toISOString(),
              py: -23.564,
              px: -46.686,
              t: getTimeInMinutes(12),
            },
            {
              p: 34569,
              a: false,
              ta: new Date().toISOString(),
              py: -23.562,
              px: -46.684,
              t: getTimeInMinutes(20),
            },
          ],
        },
      ],
    },
    cacheTimestamp: Date.now(),
  };
}

export function createEmptyArrivals(stopCode: string): StopArrivalUpdate {
  return {
    stopCode,
    hr: getCurrentTimeString(),
    p: {
      cp: parseInt(stopCode, 10),
      np: 'Ponto de teste',
      py: -23.5669,
      px: -46.6918,
      l: [],
    },
    cacheTimestamp: Date.now(),
  };
}
