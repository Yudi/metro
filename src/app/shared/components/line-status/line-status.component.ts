import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { LineStatusService } from '../../services/line-status.service';
import { NgClass } from '@angular/common';

@Component({
  selector: 'app-line-status',
  imports: [NgClass],
  templateUrl: './line-status.component.html',
  styleUrl: './line-status.component.scss',
})
export class LineStatusComponent {
  lineStatusService = inject(LineStatusService);
  lineStatus = toSignal(this.lineStatusService.requestStatus());

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
      default:
        return 'gray-circle';
    }
  }

  formatLineName(line: string): string {
    return line.charAt(0).toUpperCase() + line.slice(1).toLowerCase();
  }

  displayStatus(StatusColor: string, Description: string): void {
    if (this.isOperationNormal(StatusColor)) {
      return;
    }

    return;
  }

  isOperationNormal(StatusColor: string): boolean {
    return StatusColor === 'verde' || StatusColor === 'cinza';
  }
}
