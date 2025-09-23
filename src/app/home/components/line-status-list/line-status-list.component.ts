import { Component, inject, WritableSignal, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { ApiService, LineData } from '../../../shared/services/api.service';

@Component({
  selector: 'app-line-status-list',
  imports: [CommonModule],
  templateUrl: './line-status-list.component.html',
  styleUrl: './line-status-list.component.scss',
})
export class LineStatusListComponent {
  apiService = inject(ApiService);
  lineStatusSignal = toSignal(this.apiService.getOverallStatus(), {
    initialValue: null,
  });
  expandedLine: WritableSignal<string | null> = signal(null);

  normalizeColor(color: string): string {
    return color
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
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
