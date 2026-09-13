import { afterNextRender, effect, inject, Injectable, Injector } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { FavoritesService } from '@metro/shared/api';
import { AnonymousFavoritesImportDialogComponent } from './anonymous-favorites-import-dialog.component';

@Injectable({ providedIn: 'root' })
export class AnonymousFavoritesImportPromptService {
  private readonly favorites = inject(FavoritesService);
  private readonly dialog = inject(MatDialog);
  private readonly injector = inject(Injector);

  constructor() {
    // Browser storage consent must not open an overlay during SSR or hydration.
    afterNextRender(() => {
      effect((onCleanup) => {
        if (!this.favorites.anonymousFavoritesImportCount()) return;

        const dialogRef = this.dialog.open(AnonymousFavoritesImportDialogComponent, {
          width: '440px',
          maxWidth: 'calc(100vw - 32px)',
          closeOnNavigation: false,
          autoFocus: 'first-heading',
        });
        // A logout/account switch clears the request and closes stale consent UI.
        onCleanup(() => dialogRef.close());
      }, { injector: this.injector });
    });
  }
}
