import { Component, inject } from '@angular/core';
import {
  MatDialogModule,
  MatDialogRef,
  MAT_DIALOG_DATA,
} from '@angular/material/dialog';
import { CommonModule } from '@angular/common';
import { LineData } from '../../../shared/services/api.service';
import { MatButtonModule } from '@angular/material/button';
@Component({
  selector: 'app-line-description-dialog',
  imports: [CommonModule, MatDialogModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>{{ data.Code }} - {{ data.ColorName }}</h2>
    <mat-dialog-content>
      <p>{{ data.Description }}</p>
    </mat-dialog-content>
    <mat-dialog-actions>
      <button matButton (click)="close()">Fechar</button>
    </mat-dialog-actions>
  `,
})
export class LineDescriptionDialogComponent {
  readonly dialogRef = inject(MatDialogRef<LineDescriptionDialogComponent>);
  readonly data = inject<LineData>(MAT_DIALOG_DATA);

  close(): void {
    this.dialogRef.close();
  }
}
