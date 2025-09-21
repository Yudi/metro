import { Component, inject, WritableSignal, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  LineData,
  LineStatusService,
} from '../../services/line-status.service';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-line-status',
  imports: [CommonModule],
  templateUrl: './line-status.component.html',
  styleUrl: './line-status.component.scss',
})
export class LineStatusComponent {
  lineStatusService = inject(LineStatusService);
  lineStatusSignal = toSignal(this.lineStatusService.requestStatus(), {
    initialValue: null,
  });
  expandedLine: WritableSignal<string | null> = signal(null); // Track the currently expanded line using WritableSignal

  normalizeColor(color: string): string {
    return color
      .normalize('NFD') // Decomposes characters (e.g., "lilás" → "lila"+"s")
      .replace(/[\u0300-\u036f]/g, '') // Removes diacritics
      .toLowerCase(); // Converts to lowercase
  }

  getStatusColor(color: string): string {
    switch (color) {
      case 'amarelo':
        return 'yellow-circle';
      case 'cinza':
        return 'gray-circle';
      case 'verde':
        return 'green-circle';
      case 'vermelho':
        return 'red-circle';
      default:
        return 'gray-circle';
    }
  }

  formatLineName(line: string): string {
    return line.charAt(0).toUpperCase() + line.slice(1).toLowerCase();
  }

  isOperationNormal(StatusColor: string): boolean {
    return StatusColor === 'verde' || StatusColor === 'cinza';
  }

  statusLabelFormat(StatusLabel: string): string {
    switch (StatusLabel) {
      case 'Operação Normal':
        return 'Normal';
      case 'Operação Encerrada':
        return 'Encerrada';
      default:
        return StatusLabel;
    }
  }

  lineClick(line: LineData): void {
    if (this.isOperationNormal(line.StatusColor)) {
      return;
    }
    // Toggle the expanded state
    this.expandedLine.set(
      this.expandedLine() === line.Code.toString()
        ? null
        : line.Code.toString(),
    );
  }
}
