import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import {
  TrainCarLoadStatus,
  TrainCarMode,
} from '../train-composition.models';
import { TrainCarLoadLevel } from '@metro/shared/utils';

interface LoadBand {
  readonly value: TrainCarLoadLevel;
  readonly y: number;
}

let nextClipPathId = 0;

@Component({
  selector: 'lib-train-car-load-indicator',
  imports: [],
  templateUrl: './train-car-load-indicator.html',
  styleUrl: './train-car-load-indicator.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TrainCarLoadIndicatorComponent {
  readonly load = input.required<TrainCarLoadStatus>();
  readonly mode = input<TrainCarMode>('center');
  readonly doorsPerCar = input(4);
  readonly carPosition = input<number | null>(null);

  protected readonly clipPathId = `train-car-load-clip-${nextClipPathId++}`;
  protected readonly bandHeight = 17;

  protected readonly bands: readonly LoadBand[] = [
    { value: 6, y: 24 },
    { value: 5, y: 43 },
    { value: 4, y: 62 },
    { value: 3, y: 81 },
    { value: 2, y: 100 },
    { value: 1, y: 119 },
  ];

  protected readonly level = computed<TrainCarLoadLevel>(() => {
    const load = this.load();
    return load.kind === 'available' ? load.level : 0;
  });

  protected readonly doorMarkers = computed(() => {
    const doorsPerCar = this.doorsPerCar();

    return Array.from({ length: doorsPerCar }, (_, index) => {
      const ratio = (index + 0.5) / doorsPerCar;

      return {
        index: index + 1,
        x: 20 + 280 * ratio,
      };
    });
  });

  protected readonly shapePath = computed(() => {
    switch (this.mode()) {
      case 'left':
        return this.leftExtremityPath;
      case 'right':
        return this.rightExtremityPath;
      case 'center':
        return this.centerPath;
    }
  });

  protected readonly colorClass = computed(() => {
    const load = this.load();

    if (load.kind === 'unavailable') {
      return 'load-unavailable';
    }

    if (load.level >= 1 && load.level <= 2) {
      return 'load-low';
    }

    if (load.level >= 3 && load.level <= 4) {
      return 'load-medium';
    }

    if (load.level >= 5) {
      return 'load-high';
    }

    return 'load-empty';
  });

  protected readonly ariaLabel = computed(() => {
    const carPosition = this.carPosition();
    const carPrefix =
      carPosition === null ? 'Carro do trem' : `Carro ${carPosition}`;
    const load = this.load();

    if (load.kind === 'unavailable') {
      return `${carPrefix}: lotação indisponível`;
    }

    if (load.level === 0) {
      return `${carPrefix}: lotação zero de seis`;
    }

    const intensity =
      load.level <= 2 ? 'baixa' : load.level <= 4 ? 'média' : 'alta';

    return `${carPrefix}: lotação ${intensity}, ${load.level} de 6`;
  });

  protected isActive(band: LoadBand): boolean {
    return this.load().kind === 'available' && band.value <= this.level();
  }

  private readonly centerPath = `
    M 56 20
    H 264
    Q 300 20 300 56
    V 104
    Q 300 140 264 140
    H 56
    Q 20 140 20 104
    V 56
    Q 20 20 56 20
    Z
  `;

  private readonly leftExtremityPath = `
    M 112 24
    H 264
    Q 296 24 296 56
    V 104
    Q 296 136 264 136
    H 64
    C 42 136 22 128 18 114
    C 16 108 18 104 22 100
    L 72 40
    Q 86 24 112 24
    Z
  `;

  private readonly rightExtremityPath = `
    M 56 24
    H 208
    Q 234 24 248 40
    L 298 100
    C 302 104 304 108 302 114
    C 298 128 278 136 256 136
    H 56
    Q 24 136 24 104
    V 56
    Q 24 24 56 24
    Z
  `;
}
