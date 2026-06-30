import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

@Component({
  selector: 'app-history-date-range-fields',
  imports: [FormsModule, MatFormFieldModule, MatInputModule],
  template: `
    <mat-form-field appearance="outline">
      <mat-label>Início</mat-label>
      <input
        matInput
        type="date"
        [ngModel]="startDate"
        (ngModelChange)="startDateChange.emit($event)"
      />
    </mat-form-field>

    <mat-form-field appearance="outline">
      <mat-label>Fim</mat-label>
      <input
        matInput
        type="date"
        [ngModel]="endDate"
        (ngModelChange)="endDateChange.emit($event)"
      />
    </mat-form-field>
  `,
  styles: [
    `
      :host {
        display: contents;
      }
    `,
  ],
})
export class HistoryDateRangeFieldsComponent {
  @Input({ required: true }) startDate!: string;
  @Input({ required: true }) endDate!: string;
  @Output() startDateChange = new EventEmitter<string>();
  @Output() endDateChange = new EventEmitter<string>();
}
