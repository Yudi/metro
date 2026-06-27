import { Injectable, effect, inject, Injector } from '@angular/core';
import { Apollo, gql } from 'apollo-angular';
import { firebaseUser } from './auth.signal';

@Injectable({ providedIn: 'root' })
export class AuthBackendSyncService {
  private apollo = inject(Apollo);
  private injector = inject(Injector);

  constructor() {
    effect(() => {
      const user = firebaseUser();
      if (!user) return;

      this.apollo
        .query<true>({
          query: gql`
            query {
              validateToken
            }
          `,
        })
        .subscribe((result) => {
          if (result) {
            void this.syncFavorites();
          }
        });
    });
  }

  private async syncFavorites() {
    // eslint-disable-next-line @nx/enforce-module-boundaries
    const { FavoritesService } = await import('@metro/shared/api');
    const favoritesService = this.injector.get(FavoritesService);
    favoritesService.syncWithServer();
  }
}
