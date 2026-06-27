import { DatePipe } from '@angular/common';
import { Component, inject, signal, WritableSignal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { ApiService, FavoritesService } from '@metro/shared/api';
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
})
export class Status {
  apiService = inject(ApiService);
  favoritesService = inject(FavoritesService);
  lineStatusSignal = toSignal(this.apiService.getRailStatus(), {
    initialValue: null,
  });
  expandedLine: WritableSignal<string | null> = signal(null);

  normalizeColor(color: string): string {
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

  formatLineName(line: string): string {
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

  lineClick(line: RailLineStatus): void {
    if (this.isOperationNormal(line.statusColor, line.statusCode)) {
      return;
    }
    // Toggle the expanded state
    this.expandedLine.set(
      this.expandedLine() === line.code.toString()
        ? null
        : line.code.toString(),
    );
  }

  specialLineClick(line: SpecialRailLineStatus): void {
    this.expandedLine.set(this.expandedLine() === line.code ? null : line.code);
  }

  isSpecialFavorite(code: string): boolean {
    return this.favoritesService.isFavorite(code, 'railLine');
  }

  toggleSpecialFavorite(code: string): void {
    if (this.isSpecialFavorite(code)) {
      this.favoritesService.removeFavorite(code, 'railLine');
    } else {
      this.favoritesService.addFavorite(code, 'railLine');
    }
  }
}
