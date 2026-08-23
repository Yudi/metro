import { Service, effect, inject, Injector } from '@angular/core';
import {
  firebaseIdToken,
  firebaseUser,
  isAuthenticatedSnapshotReady,
} from './auth.signal';

@Service()
export class AuthBackendSyncService {
  private injector = inject(Injector);

  constructor() {
    effect(() => {
      const user = firebaseUser();
      const token = firebaseIdToken();
      if (!isAuthenticatedSnapshotReady(user, token)) return;

      void this.syncFavorites(user.uid);
    });
  }

  private async syncFavorites(userId: string): Promise<void> {
    try {
      // eslint-disable-next-line @nx/enforce-module-boundaries
      const { FavoritesService } = await import('@metro/shared/api');
      if (firebaseUser()?.uid !== userId) {
        return;
      }

      const favoritesService = this.injector.get(FavoritesService);
      favoritesService.syncWithServer();
    } catch (error: unknown) {
      console.error('Failed to synchronize authenticated favorites', error);
    }
  }
}
