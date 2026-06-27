import { Component, computed, inject, signal } from '@angular/core';
import {
  MatDialogModule,
  MatDialogRef,
  MAT_DIALOG_DATA,
} from '@angular/material/dialog';

import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { FavoritesService } from '@metro/shared/api';
import { Router } from '@angular/router';
import { SpecialRailIssue } from '@metro/shared/utils';

export interface LineDescriptionDialogData {
  title: string;
  description?: string | null;
  detail?: string | null;
  issues?: SpecialRailIssue[];
  details?: string[];
  link?: {
    label: string;
    url: string;
  };
  specialLineCode?: string;
}

@Component({
  selector: 'app-line-description-dialog',
  imports: [MatDialogModule, MatButtonModule, MatIconModule],
  template: `
    <h2 mat-dialog-title>{{ data.title }}</h2>
    <mat-dialog-content>
      @if (data.description) {
        <p>{{ data.description }}</p>
      }

      @if (data.detail) {
        <p>{{ data.detail }}</p>
      }

      @if (data.issues?.length) {
        <p><strong>Ocorrências relacionadas:</strong></p>
        <ul>
          @for (issue of data.issues; track issue.code) {
            <li>
              <strong>{{ issue.line }}:</strong>
              {{ issue.description }}
            </li>
          }
        </ul>
      }

      @if (data.details?.length) {
        @for (detail of data.details; track detail) {
          <p>{{ detail }}</p>
        }
      }

      @if (data.link) {
        <a [href]="data.link.url" target="_blank" rel="noopener noreferrer">
          {{ data.link.label }}
        </a>
      }
    </mat-dialog-content>
    <mat-dialog-actions>
      @if (data.specialLineCode) {
        <button
          mat-icon-button
          type="button"
          class="favorite-button"
          [class.favorited]="isFavorite()"
          (click)="toggleFavorite()"
          (mouseenter)="setFavoriteHover(true)"
          (mouseleave)="setFavoriteHover(false)"
          [attr.aria-label]="
            isFavorite() ? 'Remover dos favoritos' : 'Adicionar aos favoritos'
          "
        >
          <mat-icon>{{ favoriteIcon() }}</mat-icon>
        </button>
        <button matButton (click)="viewOnMap()">Ver no mapa</button>
      }
      <button matButton (click)="close()">Fechar</button>
    </mat-dialog-actions>
  `,
  styles: `
    .favorite-button {
      color: var(--mat-sys-on-surface-variant);
    }

    .favorite-button:hover,
    .favorite-button.favorited {
      color: #e91e63;
    }

    .favorite-button.favorited:hover {
      color: var(--mat-sys-error);
    }
  `,
})
export class LineDescriptionDialogComponent {
  readonly dialogRef = inject(MatDialogRef<LineDescriptionDialogComponent>);
  readonly data = inject<LineDescriptionDialogData>(MAT_DIALOG_DATA);
  private readonly favoritesService = inject(FavoritesService);
  private readonly router = inject(Router);
  readonly isFavorite = computed(() =>
    this.data.specialLineCode
      ? this.favoritesService.isFavorite(this.data.specialLineCode, 'railLine')
      : false,
  );
  readonly favoriteHovered = signal(false);
  readonly favoriteIcon = computed(() => {
    if (this.isFavorite()) {
      return this.favoriteHovered() ? 'favorite_border' : 'favorite';
    }

    return this.favoriteHovered() ? 'favorite' : 'favorite_border';
  });

  close(): void {
    this.dialogRef.close();
  }

  toggleFavorite(): void {
    const code = this.data.specialLineCode;
    if (!code) {
      return;
    }

    if (this.isFavorite()) {
      this.favoritesService.removeFavorite(code, 'railLine');
    } else {
      this.favoritesService.addFavorite(code, 'railLine');
    }
  }

  setFavoriteHover(hovered: boolean): void {
    this.favoriteHovered.set(hovered);
  }

  viewOnMap(): void {
    const code = this.data.specialLineCode;
    if (!code) {
      return;
    }

    this.dialogRef.close();
    void this.router.navigate(['/mapa'], { queryParams: { railLine: code } });
  }
}
