import {
  getRailLineById,
  getStaticRailStationsByLine,
  hardNormalizeString,
  StaticRailStation,
  TrainCarOccupancy,
} from '@metro/shared/utils';
import {
  buildTrainCompositionView,
  getInvalidFeatureReason,
} from './train-composition.helpers';
import {
  ResolvedTrainCompositionConfig,
  TrainCompositionView,
  TrainFacingSideRelativeToBoarding,
  TrainFormation,
  TrainFormationOverride,
  TrainLinePlatformConfig,
  TrainPlatformConfig,
  TrainPlatformDirection,
  TrainPlatformDirectionConfig,
} from './train-composition.models';

const DEFAULT_TRAIN_FORMATION: TrainFormation = {
  id: 'default-6-car-4-door',
  carCount: 6,
  doorsPerCar: 4,
};

export interface TrainLinePlatformDefinition {
  readonly lineCode: string;
  readonly formation?: TrainFormationOverride;
  readonly platforms?: Readonly<
    Record<string, readonly TrainPlatformDirectionConfig[] | undefined>
  >;
}

export function defineTrainLinePlatformConfig(
  definition: TrainLinePlatformDefinition,
): TrainLinePlatformConfig {
  const stations = getStaticRailStationsByLine(definition.lineCode);
  if (!stations) {
    throw new Error(`Unknown rail line: ${definition.lineCode}`);
  }

  const formation = resolveFormation(
    `${definition.lineCode.toLowerCase()}-default`,
    definition.formation,
    getRailLineFormation(definition.lineCode),
  );

  const stationCodes = new Set(stations.map((station) => station.code));
  for (const stationCode of Object.keys(definition.platforms ?? {})) {
    if (!stationCodes.has(stationCode)) {
      throw new Error(
        `Station ${stationCode} does not belong to ${definition.lineCode}`,
      );
    }

    for (const platform of definition.platforms?.[stationCode] ?? []) {
      const platformFormation = resolveFormation(
        platform.id,
        platform.formation,
        formation,
      );

      for (const feature of platform.features) {
        const invalidReason = getInvalidFeatureReason(
          feature,
          platformFormation,
        );
        if (invalidReason) {
          throw new Error(invalidReason);
        }
      }
    }
  }

  return {
    lineCode: definition.lineCode,
    formation,
    stations,
    platforms: definition.platforms ?? {},
  };
}

export function findTrainPlatformConfig(
  configs: readonly TrainLinePlatformConfig[],
  lineCode: string,
  stationCode: string,
  destinationCode: string,
  destinationName: string,
): TrainPlatformConfig | undefined {
  const line = findTrainLinePlatformConfig(configs, lineCode);
  const station = line ? findStationByCodeOrName(line, stationCode) : undefined;
  const platform = station?.code
    ? line?.platforms[station.code]?.find((candidate) =>
        matchesDirection(candidate.direction, destinationCode, destinationName),
      )
    : undefined;

  return line && station && platform
    ? toTrainPlatformConfig(line, station, platform)
    : undefined;
}

export function resolveTrainCompositionConfig(
  configs: readonly TrainLinePlatformConfig[],
  lineCode: string,
  stationCode: string,
  destinationCode: string,
  destinationName: string,
): ResolvedTrainCompositionConfig {
  const platform = findTrainPlatformConfig(
    configs,
    lineCode,
    stationCode,
    destinationCode,
    destinationName,
  );

  return {
    trainFacingSideRelativeToBoarding:
      platform?.trainFacingSideRelativeToBoarding,
    platform,
  };
}

export function resolveTrainCompositionView(
  configs: readonly TrainLinePlatformConfig[],
  lineCode: string,
  stationCode: string,
  destinationCode: string,
  destinationName: string,
  cars: readonly TrainCarOccupancy[] | undefined,
): TrainCompositionView | undefined {
  const line = findTrainLinePlatformConfig(configs, lineCode);
  const resolvedConfig = resolveTrainCompositionConfig(
    configs,
    lineCode,
    stationCode,
    destinationCode,
    destinationName,
  );

  if (resolvedConfig.platform) {
    return buildTrainCompositionView({
      platform: resolvedConfig.platform,
      cars,
      directionName: destinationName,
    });
  }

  if (!cars || cars.length === 0) {
    return undefined;
  }

  return buildTrainCompositionView({
    platform: createLiveOccupancyFallbackPlatform(
      line,
      lineCode,
      stationCode,
      destinationCode,
      destinationName,
      cars,
      resolvedConfig.trainFacingSideRelativeToBoarding,
    ),
    cars,
    directionName: destinationName,
  });
}

export function resolveStationTrainCompositionViews(
  configs: readonly TrainLinePlatformConfig[],
  lineCode: string,
  stationCode: string,
): readonly TrainCompositionView[] {
  const line = findTrainLinePlatformConfig(configs, lineCode);
  const station = line ? findStationByCodeOrName(line, stationCode) : undefined;
  const platforms = station ? (line?.platforms[station.code] ?? []) : [];

  if (!line || !station || platforms.length === 0) {
    return [];
  }

  return platforms.map((platform) =>
    buildTrainCompositionView({
      platform: toTrainPlatformConfig(line, station, platform),
      directionName: getDirectionName(line, platform.direction),
    }),
  );
}

function findTrainLinePlatformConfig(
  configs: readonly TrainLinePlatformConfig[],
  lineCode: string,
): TrainLinePlatformConfig | undefined {
  return configs.find((config) => config.lineCode === lineCode);
}

function findStationByCodeOrName(
  line: TrainLinePlatformConfig,
  stationCodeOrName: string,
): StaticRailStation | undefined {
  const normalized = hardNormalizeString(stationCodeOrName);

  return line.stations.find(
    (station) =>
      station.code === stationCodeOrName ||
      hardNormalizeString(station.name) === normalized ||
      station.alternativeNames?.some(
        (name) => hardNormalizeString(name) === normalized,
      ) === true,
  );
}

function toTrainPlatformConfig(
  line: TrainLinePlatformConfig,
  station: StaticRailStation,
  platform: TrainPlatformDirectionConfig,
): TrainPlatformConfig {
  return {
    ...platform,
    lineCode: line.lineCode,
    station,
    formation: resolveFormation(
      platform.id,
      platform.formation,
      line.formation,
    ),
  };
}

function getDirectionName(
  line: TrainLinePlatformConfig,
  direction: TrainPlatformDirection,
): string {
  const destinationName = direction.destinationNames?.[0];
  if (destinationName) {
    return destinationName;
  }

  const destinationCode = direction.destinationCodes?.[0];
  return (
    line.stations.find((station) => station.code === destinationCode)?.name ??
    destinationCode ??
    'Destino'
  );
}

function createLiveOccupancyFallbackPlatform(
  line: TrainLinePlatformConfig | undefined,
  lineCode: string,
  stationCode: string,
  destinationCode: string,
  destinationName: string,
  cars: readonly TrainCarOccupancy[],
  trainFacingSideRelativeToBoarding?: TrainFacingSideRelativeToBoarding,
): TrainPlatformConfig {
  const station = line?.stations.find(
    (candidate) => candidate.code === stationCode,
  );
  const formation = line?.formation ?? getRailLineFormation(lineCode);
  const carCount = Math.max(
    formation.carCount,
    ...cars.map((car) => car.position),
  );

  return {
    id: `${lineCode.toLowerCase()}-${stationCode.toLowerCase()}-live-fallback`,
    lineCode,
    station: station ?? { code: stationCode, name: stationCode },
    trainFacingSideRelativeToBoarding,
    direction: {
      destinationCodes: [destinationCode],
      destinationNames: [destinationName],
    },
    formation: {
      ...formation,
      id: `${lineCode.toLowerCase()}-live-fallback`,
      carCount,
    },
    features: [],
  };
}

function resolveFormation(
  id: string,
  override?: TrainFormationOverride,
  base: TrainFormation = DEFAULT_TRAIN_FORMATION,
): TrainFormation {
  const formation = {
    ...base,
    ...override,
    id,
  };

  assertPositiveInteger(formation.carCount, `Formation ${id} carCount`);
  assertPositiveInteger(formation.doorsPerCar, `Formation ${id} doorsPerCar`);

  return formation;
}

function getRailLineFormation(lineCode: string): TrainFormation {
  const line = getRailLineById(lineCode);

  return line
    ? {
        id: `${line.lineId.toLowerCase()}-rail-line`,
        carCount: line.carCount,
        doorsPerCar: line.carDoorCount,
      }
    : DEFAULT_TRAIN_FORMATION;
}

function assertPositiveInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${label} must be a positive integer`);
  }
}

function matchesDirection(
  direction: TrainPlatformDirection,
  destinationCode: string,
  destinationName: string,
): boolean {
  return (
    direction.destinationCodes?.includes(destinationCode) === true ||
    direction.destinationNames?.includes(destinationName) === true
  );
}
