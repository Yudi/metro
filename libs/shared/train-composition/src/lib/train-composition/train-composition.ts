import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { MatTooltipModule } from '@angular/material/tooltip';
import {
  TrainBetweenCarsFeatureView,
  TrainCarView,
  TrainCompositionView,
  TrainDisembarkingSide,
  TrainPlatformFeatureView,
} from '../train-composition.models';
import { getFeatureIcon } from '../train-composition.helpers';
import { TrainCarLoadIndicatorComponent } from '../train-car-load-indicator/train-car-load-indicator';

@Component({
  selector: 'lib-train-composition',
  imports: [MatTooltipModule, TrainCarLoadIndicatorComponent],
  templateUrl: './train-composition.html',
  styleUrl: './train-composition.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TrainCompositionComponent {
  readonly composition = input.required<TrainCompositionView>();
  readonly compactContext = input(false);

  protected readonly title = computed(() =>
    this.composition().hasLiveOccupancy
      ? 'Lotação por carro'
      : 'Composição do trem',
  );

  protected readonly ariaLabel = computed(() => {
    const composition = this.composition();
    const disembarkingSideLabel = composition.disembarkingSide
      ? this.getDisembarkingSideLabel(composition.disembarkingSide)
      : undefined;

    return [
      this.title(),
      composition.stationName,
      composition.lineCode,
      `sentido ${composition.directionName}`,
      `${composition.cars.length} carros`,
      disembarkingSideLabel,
    ]
      .filter((item): item is string => item !== undefined)
      .join(', ');
  });

  protected readonly disembarkingSideLabel = computed(() => {
    const side = this.composition().disembarkingSide;
    return side ? this.getDisembarkingSideLabel(side) : null;
  });

  protected getFeatureIcon(feature: TrainPlatformFeatureView): string {
    return getFeatureIcon(feature.type);
  }

  protected getBetweenCarsFeatureIcon(
    feature: TrainBetweenCarsFeatureView,
  ): string {
    return getFeatureIcon(feature.type);
  }

  protected getBetweenCarsFeaturesAfterDisplayedCar(
    car: TrainCarView,
  ): readonly TrainBetweenCarsFeatureView[] {
    const composition = this.composition();
    const afterCarPosition =
      composition.trainFacingSideRelativeToBoarding === 'right'
        ? car.carPosition - 1
        : car.carPosition;

    return composition.betweenCarsFeatures.filter(
      (feature) => feature.afterCarPosition === afterCarPosition,
    );
  }

  protected getCarAriaLabel(car: TrainCarView): string {
    if (car.load.kind === 'unavailable') {
      return `Carro ${car.carPosition}: lotação indisponível`;
    }

    return `Carro ${car.carPosition}: lotação ${car.load.level} de 6`;
  }

  private getDisembarkingSideLabel(side: TrainDisembarkingSide): string {
    switch (side) {
      case 'left':
        return 'Desembarque pelo lado esquerdo';
      case 'right':
        return 'Desembarque pelo lado direito';
      case 'both':
        return 'Desembarque pelos dois lados';
    }
  }
}
