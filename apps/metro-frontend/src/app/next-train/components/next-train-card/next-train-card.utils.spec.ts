import { getStaticRailStationsByLine } from '@metro/shared/utils';
import type {
  ExtendedNextTrainLineCode,
  StaticRailStation,
} from '@metro/shared/utils';
import type { TrainDirectionView } from './next-train-card.types';
import { sortDirections } from './next-train-card.utils';

function direction(terminal: string): TrainDirectionView {
  return {
    terminal,
    nextTrain: undefined,
    followingTrains: [],
    headway: undefined,
    composition: undefined,
  };
}

describe('next-train direction order', () => {
  it.each<[ExtendedNextTrainLineCode, string, string]>([
    ['L1', 'Tucuruvi', 'Jabaquara'],
    ['L2', 'Vila Madalena', 'Vila Prudente'],
    ['L3', 'Palmeiras-Barra Funda', 'Corinthians-Itaquera'],
    ['L4', 'Vila Sônia', 'Luz'],
    ['L5', 'Capão Redondo', 'Chácara Klabin'],
    ['L6', 'João Paulo I', 'Perdizes'],
    ['L7', 'Palmeiras-Barra Funda', 'Jundiaí'],
    ['L8', 'Júlio Prestes', 'Amador Bueno'],
    ['L9', 'Osasco', 'Varginha'],
    ['L10', 'Palmeiras-Barra Funda', 'Rio Grande da Serra'],
    ['L11', 'Palmeiras-Barra Funda', 'Estudantes'],
    ['L12', 'Brás', 'Calmon Viana'],
    ['L13', 'Engenheiro Goulart', 'Aeroporto-Guarulhos'],
    ['L15', 'Vila Prudente', 'Jardim Colonial'],
    ['L17', 'Morumbi', 'Washington Luís'],
  ])('orders %s from %s to %s', (lineCode, first, last) => {
    expect(
      sortDirections([direction(last), direction(first)], lineCode).map(
        (item) => item.terminal,
      ),
    ).toEqual([first, last]);
  });

  it('uses station positions beyond the original anchors for extensions', () => {
    const stations: StaticRailStation[] = [
      { code: 'EAST', name: 'Extensão leste' },
      ...(getStaticRailStationsByLine('L4') ?? []),
      { code: 'NEW', name: 'Extensão oeste' },
    ];

    expect(
      sortDirections(
        [
          direction('Extensão leste'),
          direction('Luz'),
          direction('Extensão oeste'),
        ],
        'L4',
        stations,
      ).map((item) => item.terminal),
    ).toEqual(['Extensão oeste', 'Luz', 'Extensão leste']);
  });

  it('places future L6 endpoints by catalog position without adding anchors', () => {
    expect(
      sortDirections(
        [
          direction('São Joaquim'),
          direction('Perdizes'),
          direction('João Paulo I'),
          direction('Brasilândia'),
        ],
        'L6',
      ).map((item) => item.terminal),
    ).toEqual(['Brasilândia', 'João Paulo I', 'Perdizes', 'São Joaquim']);
  });

  it('keeps the airport arm before the Washington Luís to Jabaquara arm on L17', () => {
    const stations: StaticRailStation[] = [
      { code: 'JAB', name: 'Jabaquara' },
      ...(getStaticRailStationsByLine('L17') ?? []),
    ];

    expect(
      sortDirections(
        [
          direction('Jabaquara'),
          direction('Washington Luís'),
          direction('Aeroporto de Congonhas'),
          direction('Morumbi'),
        ],
        'L17',
        stations,
      ).map((item) => item.terminal),
    ).toEqual([
      'Morumbi',
      'Aeroporto de Congonhas',
      'Washington Luís',
      'Jabaquara',
    ]);
  });

  it('keeps unknown destinations after catalog stations in source order', () => {
    expect(
      sortDirections(
        [
          direction('Desconhecido B'),
          direction('Vila Sônia'),
          direction('Desconhecido A'),
        ],
        'L4',
      ).map((item) => item.terminal),
    ).toEqual(['Vila Sônia', 'Desconhecido B', 'Desconhecido A']);
  });
});
