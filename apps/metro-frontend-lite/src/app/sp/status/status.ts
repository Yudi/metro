import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal, WritableSignal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { ApiService } from '@metro/shared/api';
import {
  RailLineStatus,
  RailStatusCode,
  SpecialRailLineStatus,
  isStatusClickable,
} from '@metro/shared/utils';

@Component({
  selector: 'app-status',
  imports: [RouterLink, DatePipe],
  templateUrl: './status.html',
  styleUrl: './status.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Status {
  apiService = inject(ApiService);
  lineStatusSignal = toSignal(this.apiService.getRailStatus(), {
    initialValue: null,
  });
  expandedLine: WritableSignal<string | null> = signal(null);

  normalizeColor(color: unknown): string {
    if (typeof color !== 'string') {
      return '';
    }

    return color
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
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

  formatLineName(line: unknown): string {
    if (typeof line !== 'string') {
      return '';
    }

    return line.charAt(0).toUpperCase() + line.slice(1).toLowerCase();
  }

  isOperationNormal(_statusColor: string, statusCode: RailStatusCode): boolean {
    return !isStatusClickable(statusCode);
  }

  statusLabelFormat(statusLabel: string): string {
    switch (statusLabel) {
      case 'Operação Normal':
        return 'Normal';
      case 'Operação Encerrada':
        return 'Encerrada';
      default:
        return statusLabel;
    }
  }

  formatLineCode(code: unknown): string | null {
    return typeof code === 'number' && Number.isFinite(code)
      ? String(code)
      : null;
  }

  lineClick(line: RailLineStatus): void {
    const code = this.formatLineCode(line.code);
    if (code === null || this.isOperationNormal(line.statusColor, line.statusCode)) {
      return;
    }
    // Toggle the expanded state
    this.expandedLine.set(
      this.expandedLine() === code ? null : code,
    );
  }

  specialLineClick(line: SpecialRailLineStatus): void {
    this.expandedLine.set(this.expandedLine() === line.code ? null : line.code);
  }
}
