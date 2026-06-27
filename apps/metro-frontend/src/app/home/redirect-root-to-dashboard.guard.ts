import { isPlatformBrowser } from '@angular/common';
import { inject, PLATFORM_ID } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { FavoritesService } from '@metro/shared/api';

const rootDashboardRedirectStorageKey =
  'metro.root-dashboard-redirect-completed';

export const redirectRootToDashboardGuard: CanActivateFn = async (
  _route,
  state,
) => {
  const platformId = inject(PLATFORM_ID);
  if (!isPlatformBrowser(platformId) || state.url !== '/') {
    return true;
  }

  const router = inject(Router);
  const navigation = router.getCurrentNavigation();
  if (navigation?.id !== 1) {
    return true;
  }

  if (sessionStorage.getItem(rootDashboardRedirectStorageKey) === 'true') {
    return true;
  }

  const favoritesService = inject(FavoritesService);
  const hasStoredFavorites = await favoritesService.hasStoredFavorites();
  if (!hasStoredFavorites) {
    return true;
  }

  sessionStorage.setItem(rootDashboardRedirectStorageKey, 'true');
  return router.createUrlTree(['/painel']);
};
