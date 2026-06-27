import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { LiteSearchStop } from '../../../services/lite-search.service';

@Component({
  selector: 'app-lite-bike-availability',
  templateUrl: './lite-bike-availability.html',
  styleUrl: './lite-bike-availability.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LiteBikeAvailability {
  readonly station = input.required<LiteSearchStop>();

  readonly availability = computed(() => this.station().bikeAvailability);
  readonly capacity = computed(() => {
    const availability = this.availability();
    return availability?.capacity ?? availability?.effectiveCapacity ?? null;
  });
  readonly availableDocks = computed(() => {
    const availability = this.availability();
    const capacity = this.capacity();

    if (!availability || capacity === null) {
      return null;
    }

    return Math.max(capacity - availability.numBikesAvailable, 0);
  });
}
