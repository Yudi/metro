import { describe, expect, it } from '@jest/globals';
import { getStaticRailStationsByLine } from '@metro/shared/utils';
import { TRAIN_PLATFORM_CONFIGS } from './config/train-platform-configs';
import { TrainLinePlatformConfig } from './train-composition.models';
import {
  defineTrainLinePlatformConfig,
  findTrainPlatformConfig,
  resolveTrainCompositionConfig,
  resolveTrainCompositionView,
  resolveStationTrainCompositionViews,
} from './train-platform-config';

describe('train platform configuration', () => {
  const l4Stations = getStaticRailStationsByLine('L4') ?? [];
  const config: TrainLinePlatformConfig = defineTrainLinePlatformConfig({
    lineCode: 'L4',
    platforms: {
      PIH: [
        {
          id: 'l4-pih-luz',
          direction: { destinationCodes: ['LUZ'] },
          disembarkingSide: 'left',
          trainFacingSideRelativeToBoarding: 'right',
          features: [
            {
              id: 'stairs-car-2-door-2',
              type: 'stairs',
              label: 'Escadas próximas ao carro 2, porta 2',
              anchor: { type: 'door', carPosition: 2, doorPosition: 2 },
            },
            {
              id: 'escalator-car-2-door-2',
              type: 'escalator-up',
              label: 'Escada rolante próxima ao carro 2, porta 2',
              anchor: { type: 'door', carPosition: 2, doorPosition: 2 },
            },
            {
              id: 'elevator-car-3-between-doors',
              type: 'elevator',
              label: 'Elevador entre as portas 2 e 3 do carro 3',
              anchor: {
                type: 'between-doors',
                carPosition: 3,
                fromDoorPosition: 2,
                toDoorPosition: 3,
              },
            },
          ],
        },
        {
          id: 'l4-pih-vls',
          direction: { destinationCodes: ['VLS'] },
          trainFacingSideRelativeToBoarding: 'left',
          features: [],
        },
      ],
    },
  });

  it('resolves canonical station data from rail-stations.entity', () => {
    const platform = findTrainPlatformConfig(
      [config],
      'L4',
      'PIH',
      'LUZ',
      'Luz',
    );

    expect(platform?.station).toBe(
      l4Stations.find((station) => station.code === 'PIH'),
    );
  });

  it('does not infer orientation when no direction-specific platform matches', () => {
    expect(
      resolveTrainCompositionConfig([config], 'L4', 'PIH', 'VSO', 'Vila Sônia'),
    ).toEqual({
      trainFacingSideRelativeToBoarding: undefined,
      platform: undefined,
    });
  });

  it('builds static composition cars when live occupancy is unavailable', () => {
    const composition = resolveTrainCompositionView(
      [config],
      'L4',
      'PIH',
      'LUZ',
      'Luz',
      undefined,
    );

    expect(composition?.hasLiveOccupancy).toBe(false);
    expect(composition?.disembarkingSide).toBe('left');
    expect(composition?.cars).toHaveLength(6);
    expect(composition?.cars.map((car) => car.carPosition)).toEqual([
      6, 5, 4, 3, 2, 1,
    ]);
    expect(composition?.cars[0]).toMatchObject({
      carPosition: 6,
      mode: 'left',
      load: {
        kind: 'unavailable',
        reason: 'api-not-supported',
      },
    });
  });

  it('uses rail line car and door counts in the displayed composition', () => {
    const composition = resolveStationTrainCompositionViews(
      TRAIN_PLATFORM_CONFIGS,
      'L15',
      'Vila Prudente',
    )[0];

    expect(composition?.cars).toHaveLength(7);
    expect(composition?.cars.every((car) => car.doorCount === 2)).toBe(true);
  });

  it('uses rail line formation data for live fallback compositions', () => {
    const composition = resolveTrainCompositionView(
      [],
      'L15',
      'VPT',
      'IGT',
      'Iguatemi',
      [{ position: 1, loadLevel: 1, wheelchairAccessible: false }],
    );

    expect(composition?.cars).toHaveLength(7);
    expect(composition?.cars.every((car) => car.doorCount === 2)).toBe(true);
  });

  it('builds static composition views for all configured station directions', () => {
    const compositions = resolveStationTrainCompositionViews(
      [config],
      'L4',
      'PIH',
    );

    expect(compositions).toHaveLength(2);
    expect(compositions[0]).toMatchObject({
      stationName: 'Pinheiros',
      lineCode: 'L4',
      directionName: 'Luz',
      hasLiveOccupancy: false,
    });
    expect(compositions[0]?.cars).toHaveLength(6);
  });

  it('resolves static composition views by normalized station name', () => {
    const compositions = resolveStationTrainCompositionViews(
      [config],
      'L4',
      'PINHEIROS',
    );

    expect(compositions).toHaveLength(2);
    expect(compositions[0]?.stationName).toBe('Pinheiros');
  });

  it('keeps live occupancy values and L4 display order when available', () => {
    const composition = resolveTrainCompositionView(
      [config],
      'L4',
      'PIH',
      'LUZ',
      'Luz',
      [
        {
          position: 1,
          loadLevel: 4,
          wheelchairAccessible: true,
        },
      ],
    );

    expect(composition?.hasLiveOccupancy).toBe(true);
    expect(composition?.disembarkingSide).toBe('left');
    expect(composition?.cars.at(-1)).toMatchObject({
      carPosition: 1,
      mode: 'right',
      load: {
        kind: 'available',
        level: 4,
      },
      wheelchairAccessible: true,
    });
  });

  it('renders each direction using its configured boarding orientation', () => {
    const composition = resolveTrainCompositionView(
      [config],
      'L4',
      'PIH',
      'VLS',
      'Vila Sônia',
      undefined,
    );

    expect(composition?.trainFacingSideRelativeToBoarding).toBe('left');
    expect(composition?.cars.map((car) => car.carPosition)).toEqual([
      1, 2, 3, 4, 5, 6,
    ]);
  });

  it('keeps the default car order when boarding orientation is unknown', () => {
    const configWithoutOrientation = defineTrainLinePlatformConfig({
      lineCode: 'L4',
      platforms: {
        PIH: [
          {
            id: 'l4-pih-luz',
            direction: { destinationCodes: ['LUZ'] },
            features: [],
          },
        ],
      },
    });

    const composition = resolveTrainCompositionView(
      [configWithoutOrientation],
      'L4',
      'PIH',
      'LUZ',
      'Luz',
      undefined,
    );

    expect(composition?.trainFacingSideRelativeToBoarding).toBeUndefined();
    expect(composition?.cars[0]?.carPosition).toBe(1);
    expect(composition?.cars.at(-1)?.carPosition).toBe(6);
  });

  it('positions door anchors using the displayed train orientation', () => {
    const composition = resolveTrainCompositionView(
      [config],
      'L4',
      'PIH',
      'LUZ',
      'Luz',
      undefined,
    );

    const car2 = composition?.cars.find((car) => car.carPosition === 2);
    const doorFeature = car2?.features.find(
      (feature) => feature.id === 'stairs-car-2-door-2',
    );

    expect(doorFeature?.positionRatio).toBe(0.625);
  });

  it('stacks features that share the same displayed position', () => {
    const composition = resolveTrainCompositionView(
      [config],
      'L4',
      'PIH',
      'LUZ',
      'Luz',
      undefined,
    );

    const car2 = composition?.cars.find((car) => car.carPosition === 2);

    expect(car2?.featureStacks).toHaveLength(1);
    expect(car2?.featureStacks[0]?.positionRatio).toBe(0.625);
    expect(car2?.featureStacks[0]?.features.map((feature) => feature.id)).toEqual(
      ['stairs-car-2-door-2', 'escalator-car-2-door-2'],
    );
  });

  it('rejects station codes outside the canonical line station list', () => {
    expect(() =>
      defineTrainLinePlatformConfig({
        lineCode: 'L4',
        platforms: {
          INVALID: [],
        },
      }),
    ).toThrow('Station INVALID does not belong to L4');
  });

  it('rejects invalid configured formation values', () => {
    expect(() =>
      defineTrainLinePlatformConfig({
        lineCode: 'L4',
        formation: { carCount: 0 },
        platforms: {},
      }),
    ).toThrow('Formation l4-default carCount must be a positive integer');
  });

  it('rejects invalid door anchors for the resolved formation', () => {
    expect(() =>
      defineTrainLinePlatformConfig({
        lineCode: 'L4',
        platforms: {
          PIH: [
            {
              id: 'l4-pih-luz',
              direction: { destinationCodes: ['LUZ'] },
              features: [
                {
                  id: 'invalid-door',
                  type: 'stairs',
                  label: 'Escadas',
                  anchor: { type: 'door', carPosition: 2, doorPosition: 9 },
                },
              ],
            },
          ],
        },
      }),
    ).toThrow('Feature invalid-door has an invalid car or door position');
  });
});
