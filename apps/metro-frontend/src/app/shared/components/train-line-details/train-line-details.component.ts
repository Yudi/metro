import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import type { ExtendedNextTrainLineCode } from '@metro/shared/utils';
import {
  TrainCompositionComponent,
  type TrainCompositionView,
} from '@metro/shared/train-composition';
import { NextTrainCardComponent } from '../../../next-train/components/next-train-card/next-train-card.component';

@Component({
  selector: 'app-train-line-details',
  imports: [
    MatIconModule,
    NgTemplateOutlet,
    NextTrainCardComponent,
    TrainCompositionComponent,
  ],
  templateUrl: './train-line-details.component.html',
  styleUrl: './train-line-details.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TrainLineDetailsComponent {
  readonly lineCode = input<ExtendedNextTrainLineCode | null>(null);
  readonly stationCode = input<string | null>(null);
  readonly stationName = input.required<string>();
  readonly mode = input<'schedule' | 'composition'>('schedule');
  readonly compositions = input<readonly TrainCompositionView[] | null>(null);
}
