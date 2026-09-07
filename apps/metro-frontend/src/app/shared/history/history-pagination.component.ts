import { Component, EventEmitter, Input, Output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-history-pagination',
  imports: [MatButtonModule, MatIconModule],
  template: `
    <nav class="pagination" [attr.aria-label]="ariaLabel">
      <button
        mat-stroked-button
        type="button"
        (click)="previousPage.emit()"
        [disabled]="currentPage === 1"
      >
        <mat-icon>chevron_left</mat-icon>
        Anterior
      </button>
      <span>Página {{ currentPage }} de {{ totalPages }}</span>
      <button
        mat-stroked-button
        type="button"
        (click)="nextPage.emit()"
        [disabled]="currentPage === totalPages"
      >
        Próxima
        <mat-icon>chevron_right</mat-icon>
      </button>
    </nav>
  `,
  styles: [
    `
      .pagination {
        align-items: center;
        display: flex;
        gap: 16px;
        justify-content: flex-end;
      }

      @media (max-width: 720px) {
        .pagination {
          align-items: flex-start;
          flex-direction: column;
        }
      }
    `,
  ],
})
export class HistoryPaginationComponent {
  @Input({ required: true }) currentPage!: number;
  @Input({ required: true }) totalPages!: number;
  @Input() ariaLabel = 'Paginação do histórico';
  @Output() previousPage = new EventEmitter<void>();
  @Output() nextPage = new EventEmitter<void>();
}
