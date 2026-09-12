import { Route } from '@angular/router';
import { SAO_PAULO_CITY } from '@metro/shared/cities';
import { SeoGuard } from '@metro/shared/seo';
import { routes as spRoutes } from './cities/sp/sp.routes';

export const routes: Route[] = [
  {
    path: '',
    canActivateChild: [SeoGuard],
    loadComponent: () =>
      import('./shared/layout/main-layout/main-layout').then(
        (m) => m.MainLayout,
      ),

    children: [
      {
        path: '',
        pathMatch: 'full',
        loadComponent: () =>
          import('./sp/dashboard/dashboard').then((m) => m.Dashboard),
      },
      {
        path: SAO_PAULO_CITY.id,
        children: spRoutes,
      },
    ],
  },
];
