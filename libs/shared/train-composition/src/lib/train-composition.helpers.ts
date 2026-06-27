import { TrainCarOccupancy, TrainCarLoadLevel } from '@metro/shared/utils';
import {
  TrainBetweenCarsFeatureView,
  TrainCarLoadStatus,
  TrainCarMode,
  TrainCarView,
  TrainCompositionView,
  TrainFacingSideRelativeToBoarding,
  TrainFormation,
  TrainPlatformConfig,
  TrainPlatformFeature,
  TrainPlatformFeatureAnchor,
  TrainPlatformFeatureStackView,
  TrainPlatformFeatureType,
  TrainPlatformFeatureView,
} from './train-composition.models';

export function getCarMode(
  displayIndex: number,
  carCount: number,
): TrainCarMode {
  if (displayIndex === 1) {
    return 'left';
  }

  if (displayIndex === carCount) {
    return 'right';
  }

  return 'center';
}

export function getDoorPositionRatio(
  doorPosition: number,
  doorCount: number,
): number {
  return (doorPosition - 0.5) / doorCount;
}

export function getBetweenDoorsPositionRatio(
  fromDoorPosition: number,
  toDoorPosition: number,
  doorCount: number,
): number {
  return (
    getDoorPositionRatio(fromDoorPosition, doorCount) +
    getDoorPositionRatio(toDoorPosition, doorCount)
  ) / 2;
}

export function getFeatureIcon(type: TrainPlatformFeatureType): string {
  switch (type) {
    case 'exit':
      return 'logout';
    case 'stairs':
      return 'stairs';
    case 'escalator-up':
      return 'north_east';
    case 'escalator-down':
      return 'south_west';
    case 'escalator-both':
      return 'swap_vert';
    case 'elevator':
      return 'elevator';
    case 'transfer':
      return 'sync_alt';
  }
}

export function getFeaturePositionRatio(
  anchor: TrainPlatformFeatureAnchor,
  doorCount: number,
): number {
  switch (anchor.type) {
    case 'door':
      return getDoorPositionRatio(anchor.doorPosition, doorCount);
    case 'between-doors':
      return getBetweenDoorsPositionRatio(
        anchor.fromDoorPosition,
        anchor.toDoorPosition,
        doorCount,
      );
    case 'car':
      return anchor.positionRatio ?? 0.5;
    case 'before-first-car':
    case 'after-last-car':
    case 'between-cars':
      return 0.5;
  }
}

export function getDisplayPositionRatio(
  anchor: TrainPlatformFeatureAnchor,
  doorCount: number,
  trainFacingSideRelativeToBoarding?: TrainFacingSideRelativeToBoarding,
): number {
  const logicalRatio = getFeaturePositionRatio(anchor, doorCount);
  return trainFacingSideRelativeToBoarding === 'right'
    ? 1 - logicalRatio
    : logicalRatio;
}

export function isValidFeatureForFormation(
  feature: TrainPlatformFeature,
  formation: TrainFormation,
): boolean {
  const anchor = feature.anchor;

  switch (anchor.type) {
    case 'before-first-car':
    case 'after-last-car':
      return true;
    case 'door':
      return (
        isValidCarPosition(anchor.carPosition, formation) &&
        isValidDoorPosition(anchor.doorPosition, formation)
      );
    case 'between-doors':
      return (
        isValidCarPosition(anchor.carPosition, formation) &&
        isValidDoorPosition(anchor.fromDoorPosition, formation) &&
        isValidDoorPosition(anchor.toDoorPosition, formation) &&
        anchor.toDoorPosition === anchor.fromDoorPosition + 1
      );
    case 'between-cars':
      return (
        anchor.afterCarPosition >= 1 &&
        anchor.afterCarPosition < formation.carCount
      );
    case 'car':
      return (
        isValidCarPosition(anchor.carPosition, formation) &&
        (anchor.positionRatio === undefined ||
          (anchor.positionRatio >= 0 && anchor.positionRatio <= 1))
      );
  }
}

export function getInvalidFeatureReason(
  feature: TrainPlatformFeature,
  formation: TrainFormation,
): string | undefined {
  if (isValidFeatureForFormation(feature, formation)) {
    return undefined;
  }

  const anchor = feature.anchor;

  switch (anchor.type) {
    case 'door':
      return `Feature ${feature.id} has an invalid car or door position`;
    case 'between-doors':
      return `Feature ${feature.id} must point to adjacent valid doors`;
    case 'between-cars':
      return `Feature ${feature.id} must point between two valid cars`;
    case 'car':
      return `Feature ${feature.id} has an invalid car or positionRatio`;
    case 'before-first-car':
    case 'after-last-car':
      return undefined;
  }
}

export function buildTrainCompositionView(params: {
  readonly platform: TrainPlatformConfig;
  readonly cars?: readonly TrainCarOccupancy[];
  readonly directionName: string;
}): TrainCompositionView {
  const { platform, cars, directionName } = params;
  const { trainFacingSideRelativeToBoarding } = platform;
  const formation = platform.formation;
  const loadByCar = new Map<number, TrainCarOccupancy>(
    cars?.map((car) => [car.position, car]) ?? [],
  );
  const providerSupportsLoad = cars !== undefined;

  const validFeatures = platform.features.filter((feature) =>
    isValidFeatureForFormation(feature, formation),
  );

  const featuresByCar = new Map<number, TrainPlatformFeatureView[]>();
  const betweenCarsFeatures: TrainBetweenCarsFeatureView[] = [];
  const beforeFirstCarFeatures: TrainPlatformFeatureView[] = [];
  const afterLastCarFeatures: TrainPlatformFeatureView[] = [];

  for (const feature of validFeatures) {
    const anchor = feature.anchor;

    if (anchor.type === 'before-first-car') {
      beforeFirstCarFeatures.push(toFeatureView(feature, 0.5));
      continue;
    }

    if (anchor.type === 'after-last-car') {
      afterLastCarFeatures.push(toFeatureView(feature, 0.5));
      continue;
    }

    if (anchor.type === 'between-cars') {
      betweenCarsFeatures.push({
        id: feature.id,
        type: feature.type,
        label: feature.label,
        afterCarPosition: anchor.afterCarPosition,
        targetLine: feature.targetLine,
      });
      continue;
    }

    const carFeatures = featuresByCar.get(anchor.carPosition) ?? [];
    carFeatures.push(
      toFeatureView(
        feature,
        getDisplayPositionRatio(
          anchor,
          formation.doorsPerCar,
          trainFacingSideRelativeToBoarding,
        ),
      ),
    );
    featuresByCar.set(anchor.carPosition, carFeatures);
  }

  const displayCarPositions = Array.from(
    { length: formation.carCount },
    (_, index) => index + 1,
  );

  if (trainFacingSideRelativeToBoarding === 'right') {
    displayCarPositions.reverse();
  }

  const carViews: TrainCarView[] = displayCarPositions.map(
    (carPosition, index) => {
      const car = loadByCar.get(carPosition);
      const features = featuresByCar.get(carPosition) ?? [];

      return {
        carPosition,
        displayIndex: index + 1,
        mode: getCarMode(index + 1, formation.carCount),
        doorCount: formation.doorsPerCar,
        load: getLoadStatus(car, providerSupportsLoad),
        wheelchairAccessible: car?.wheelchairAccessible ?? false,
        features,
        featureStacks: getFeatureStacks(features),
      };
    },
  );

  return {
    stationName: platform.station.name,
    lineCode: platform.lineCode,
    directionName,
    trainFacingSideRelativeToBoarding,
    disembarkingSide: platform.disembarkingSide,
    hasLiveOccupancy:
      cars?.some((car) => car.occupancyAvailable !== false) === true,
    cars: carViews,
    betweenCarsFeatures,
    leftExtremityFeatures:
      trainFacingSideRelativeToBoarding === 'right'
        ? afterLastCarFeatures
        : beforeFirstCarFeatures,
    rightExtremityFeatures:
      trainFacingSideRelativeToBoarding === 'right'
        ? beforeFirstCarFeatures
        : afterLastCarFeatures,
  };
}

function getLoadStatus(
  car: TrainCarOccupancy | undefined,
  providerSupportsLoad: boolean,
): TrainCarLoadStatus {
  if (!car || car.occupancyAvailable === false) {
    return {
      kind: 'unavailable',
      reason: providerSupportsLoad ? 'not-reported' : 'api-not-supported',
    };
  }

  return {
    kind: 'available',
    level: car.loadLevel as TrainCarLoadLevel,
  };
}

function toFeatureView(
  feature: TrainPlatformFeature,
  positionRatio: number,
): TrainPlatformFeatureView {
  return {
    id: feature.id,
    type: feature.type,
    label: feature.label,
    anchorType: feature.anchor.type,
    positionRatio,
    targetLine: feature.targetLine,
  };
}

function getFeatureStacks(
  features: readonly TrainPlatformFeatureView[],
): readonly TrainPlatformFeatureStackView[] {
  const featuresByPosition = new Map<number, TrainPlatformFeatureView[]>();

  for (const feature of features) {
    const stack = featuresByPosition.get(feature.positionRatio) ?? [];
    stack.push(feature);
    featuresByPosition.set(feature.positionRatio, stack);
  }

  return Array.from(featuresByPosition, ([positionRatio, stackFeatures]) => ({
    positionRatio,
    features: stackFeatures,
  }));
}

function isValidCarPosition(
  carPosition: number,
  formation: TrainFormation,
): boolean {
  return (
    Number.isInteger(carPosition) &&
    carPosition >= 1 &&
    carPosition <= formation.carCount
  );
}

function isValidDoorPosition(
  doorPosition: number,
  formation: TrainFormation,
): boolean {
  return (
    Number.isInteger(doorPosition) &&
    doorPosition >= 1 &&
    doorPosition <= formation.doorsPerCar
  );
}
