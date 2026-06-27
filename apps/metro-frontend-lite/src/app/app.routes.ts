import { Route } from '@angular/router';
import { SeoGuard } from '@metro/shared/seo';

export const routes: Route[] = [
  {
    path: '',
    canActivate: [SeoGuard],
    loadComponent: () =>
      import('./shared/layout/main-layout/main-layout').then(
        (m) => m.MainLayout
      ),

    children: [
      {
        path: '',
        loadComponent: () => import('./home/home').then((m) => m.Home),
      },
      {
        path: 'sp',
        loadChildren: () => import('./sp/sp.routes').then((m) => m.routes),
      },
    ],
  },
];
