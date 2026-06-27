import { Routes } from '@angular/router';
import { SeoGuard } from '@metro/shared/seo';
import { redirectRootToDashboardGuard } from './home/redirect-root-to-dashboard.guard';

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
        canActivate: [redirectRootToDashboardGuard],
        loadComponent: () =>
          import('./home/home.component').then((m) => m.HomeComponent),
        title:
          'Estado das linhas de trem | Transporte Metropolitano de São Paulo',
      },
      {
        path: 'proxima-chegada',
        loadComponent: () =>
          import('./next-arrival/next-arrival.component').then(
            (m) => m.NextArrivalComponent,
          ),
        title: 'Próxima chegada | Transporte Metropolitano de São Paulo',
      },
      {
        path: 'proximo-trem',
        loadComponent: () =>
          import('./next-train/next-train.component').then(
            (m) => m.NextTrainComponent,
          ),
        title: 'Próxima chegada | Transporte Metropolitano de São Paulo',
      },
      {
        path: 'painel',
        loadComponent: () =>
          import('./insights-dashboard/insights-dashboard.component').then(
            (m) => m.InsightsDashboardComponent,
          ),
        title: 'Painel | Transporte Metropolitano de São Paulo',
      },
      {
        path: 'mapa',
        loadComponent: () =>
          import('./map-main/map-main.component').then(
            (m) => m.MapMainComponent,
          ),
        title: 'Mapa | Transporte Metropolitano de São Paulo',
        data: { noXPadding: true },
      },
      {
        path: 'historico/ocorrencias',
        loadComponent: () =>
          import('./incident-history/incident-history.component').then(
            (m) => m.IncidentHistoryComponent,
          ),
        title:
          'Histórico de ocorrências | Transporte Metropolitano de São Paulo',
      },
      {
        path: 'historico/intervalos',
        loadComponent: () =>
          import('./headway-history/headway-history.component').then(
            (m) => m.HeadwayHistoryComponent,
          ),
        title:
          'Histórico de intervalos | Transporte Metropolitano de São Paulo',
      },
      {
        path: 'sobre',
        loadComponent: () =>
          import('./about/about.component').then((m) => m.AboutComponent),
        title: 'Sobre | Transporte Metropolitano de São Paulo',
      },
      {
        path: 'menu',
        loadComponent: () =>
          import('./menu/menu.component').then((m) => m.MenuComponent),
        title: 'Menu | Transporte Metropolitano de São Paulo',
      },
      {
        path: 'favoritos',
        loadComponent: () =>
          import('./favorites/favorites.component').then(
            (m) => m.FavoritesComponent,
          ),
        title: 'Favoritos | Transporte Metropolitano de São Paulo',
      },
    ],
  },
  // Needs to be the last route
  {
    path: '**',
    redirectTo: '',
  },
];
