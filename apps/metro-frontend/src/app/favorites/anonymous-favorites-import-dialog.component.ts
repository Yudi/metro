import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule } from '@angular/material/dialog';
import { FavoritesService } from '@metro/shared/api';

@Component({
  selector: 'app-anonymous-favorites-import-dialog',
  imports: [MatButtonModule, MatDialogModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>Favoritos salvos neste navegador</h2>
    <mat-dialog-content>
      <p>
        Encontramos {{ count() }} {{ count() === 1 ? 'favorito' : 'favoritos' }}
        de antes do login. Deseja transferir para esta conta?
      </p>
      @if (error(); as message) {
        <p role="alert">{{ message }}</p>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close type="button" [disabled]="pending()">
        Agora não
      </button>
      <button
        mat-button
        type="button"
        [disabled]="pending()"
        (click)="resolve(false)"
      >
        Descartar
      </button>
      <button
        mat-flat-button
        type="button"
        [disabled]="pending()"
        (click)="resolve(true)"
      >
        Transferir
      </button>
    </mat-dialog-actions>
  `,
})
export class AnonymousFavoritesImportDialogComponent {
  private readonly favorites = inject(FavoritesService);
  readonly count = this.favorites.anonymousFavoritesImportCount;
  readonly pending = signal(false);
  readonly error = signal<string | null>(null);

  async resolve(importFavorites: boolean): Promise<void> {
    if (this.pending()) return;

    this.pending.set(true);
    this.error.set(null);
    try {
      if (importFavorites) {
        await this.favorites.importAnonymousFavorites();
      } else {
        await this.favorites.discardAnonymousFavorites();
      }
    } catch {
      this.error.set('Não foi possível salvar sua escolha. Tente novamente.');
    } finally {
      this.pending.set(false);
    }
  }
}
