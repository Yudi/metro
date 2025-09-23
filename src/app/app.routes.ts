import { Routes } from '@angular/router';
import { SeoGuard } from './shared/seo/seo.guard';

export const routes: Routes = [
  {
    path: '',
    canActivate: [SeoGuard],
    loadComponent: () =>
      import('./shared/layout/toolbar-layout/toolbar-layout.component').then(
        (m) => m.ToolbarLayoutComponent,
      ),
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./home/home.component').then((m) => m.HomeComponent),
        title:
          'Estado das linhas de trem | Transporte Metropolitano de São Paulo',
      },
      {
        path: 'proximo-trem',
        loadComponent: () =>
          import('./next-train/next-train.component').then(
            (m) => m.NextTrainComponent,
          ),
        title: 'Próximo trem | Transporte Metropolitano de São Paulo',
      },
      {
        path: 'sobre',
        loadComponent: () =>
          import('./about/about.component').then((m) => m.AboutComponent),
        title: 'Sobre | Transporte Metropolitano de São Paulo',
      },
    ],
  },
  // Needs to be the last route
  {
    path: '**',
    redirectTo: '',
  },
];
