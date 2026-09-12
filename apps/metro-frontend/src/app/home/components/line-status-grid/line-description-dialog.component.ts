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
import { ScheduledDeparturesComponent } from '../../../shared/components/scheduled-departures/scheduled-departures.component';
import { CityContextService } from '../../../cities/city-context.service';

export interface LineScheduleSection {
  title: string;
  description?: string;
  times: readonly string[];
}

export interface LineDescriptionDialogData {
  title: string;
  description?: string | null;
  detail?: string | null;
  issues?: SpecialRailIssue[];
  details?: string[];
  scheduleSections?: readonly LineScheduleSection[];
  note?: string;
  link?: {
    label: string;
    url: string;
  };
  specialLineCode?: string;
}

@Component({
  selector: 'app-line-description-dialog',
  imports: [
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    ScheduledDeparturesComponent,
  ],
  template: `
    <h2 mat-dialog-title>{{ data.title }}</h2>
    <mat-dialog-content class="line-description-content">
      @if (data.description) {
        <p class="lead">{{ data.description }}</p>
      }

      @if (data.detail) {
        <p>{{ data.detail }}</p>
      }

      @if (data.scheduleSections?.length) {
        <div class="schedule-list">
          @for (section of data.scheduleSections; track section.title) {
            <section class="schedule-section">
              <div class="schedule-section-header">
                <h3>{{ section.title }}</h3>
                @if (section.description) {
                  <p>{{ section.description }}</p>
                }
              </div>

              <app-scheduled-departures
                [times]="section.times"
                [ariaLabel]="'Partidas na faixa de ' + section.title + ': '"
              />
            </section>
          }
        </div>
      }

      @if (data.note) {
        <p class="note">{{ data.note }}</p>
      }

      @if (data.issues?.length) {
        <section class="issue-section">
          <h3>Alterações</h3>
          <ul>
            @for (issue of data.issues; track issue.code) {
              <li>
                <strong>{{ issue.line }}:</strong>
                {{ issue.description }}
              </li>
            }
          </ul>
        </section>
      }

      @if (data.details?.length) {
        @for (detail of data.details; track detail) {
          <p>{{ detail }}</p>
        }
      }

      @if (data.link) {
        <a
          class="source-link"
          [href]="data.link.url"
          target="_blank"
          rel="noopener noreferrer"
        >
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
    :host {
      color: var(--mat-sys-on-surface);
    }

    h2[mat-dialog-title] {
      padding-bottom: 0;
      line-height: 1.2;
      text-wrap: balance;
    }

    .line-description-content {
      display: flex;
      flex-direction: column;
      gap: 0.9rem;
      min-width: min(560px, calc(100vw - 64px));
      max-width: 680px;
    }

    p {
      margin: 0;
      line-height: 1.5;
      text-wrap: pretty;
    }

    .lead {
      color: var(--mat-sys-on-surface);
    }

    .schedule-list {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .schedule-section {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      padding: 0.9rem;
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: 12px;
      background: var(--mat-sys-surface-container-lowest);
    }

    .schedule-section-header {
      display: flex;
      flex-direction: column;
      gap: 0.2rem;
    }

    .schedule-section h3,
    .issue-section h3 {
      margin: 0;
      color: var(--mat-sys-on-surface);
      font-size: 0.95rem;
      font-weight: 700;
      line-height: 1.25;
    }

    .schedule-section p,
    .note,
    .source-link {
      color: var(--mat-sys-on-surface-variant);
      font-size: 0.88rem;
    }

    .issue-section {
      display: flex;
      flex-direction: column;
      gap: 0.45rem;
      padding: 0.8rem 0.9rem;
      border-radius: 12px;
      background: var(--mat-sys-error-container);
      color: var(--mat-sys-on-error-container);
    }

    .issue-section h3 {
      color: inherit;
    }

    .issue-section ul {
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
      margin: 0;
      padding-left: 1.1rem;
    }

    .issue-section li {
      line-height: 1.45;
    }

    .source-link {
      width: fit-content;
      color: var(--mat-sys-primary);
      font-weight: 600;
      text-decoration-thickness: 0.08em;
      text-underline-offset: 0.18em;
    }

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

    @media (max-width: 599px) {
      .line-description-content {
        min-width: 0;
      }

      .schedule-section {
        padding: 0.8rem;
      }
    }
  `,
})
export class LineDescriptionDialogComponent {
  readonly dialogRef = inject(MatDialogRef<LineDescriptionDialogComponent>);
  readonly data = inject<LineDescriptionDialogData>(MAT_DIALOG_DATA);
  private readonly favoritesService = inject(FavoritesService);
  private readonly router = inject(Router);
  private readonly cityContext = inject(CityContextService);
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
    void this.router.navigate([this.cityContext.path('/mapa')], {
      queryParams: { railLine: code },
    });
  }
}
