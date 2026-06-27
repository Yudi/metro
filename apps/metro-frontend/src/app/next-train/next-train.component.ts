import { Component } from '@angular/core';
import { Line8Component } from '../shared/components/train-tracking/line-8/line-8.component';
import { Line9Component } from '../shared/components/train-tracking/line-9/line-9.component';

@Component({
  selector: 'app-next-train',
  imports: [Line8Component, Line9Component],
  templateUrl: './next-train.component.html',
  styleUrl: './next-train.component.scss',
})
export class NextTrainComponent {}
