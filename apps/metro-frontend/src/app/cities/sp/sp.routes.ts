import type { Route, Routes } from '@angular/router';
import { SAO_PAULO_CITY } from '@metro/shared/cities';

const title = (label: string) => `${label} | ${SAO_PAULO_CITY.siteTitle}`;
const page = (label: string, data: Record<string, unknown> = {}) => ({
  title: title(label),
  data: { title: label, ...data },
});

export const homeRoute: Route = {
  path: '',
  pathMatch: 'full',
  ...page('Estado das linhas de trem'),
  loadComponent: () =>
    import('../../home/home.component').then((m) => m.HomeComponent),
};

export const spFeatureRoutes: Routes = [
  homeRoute,
  {
    path: 'proximo-trem',
    ...page('Próxima chegada'),
    loadComponent: () =>
      import('../../next-train/next-train.component').then(
        (m) => m.NextTrainComponent,
      ),
  },
  {
    path: 'painel',
    ...page('Painel', { preserveDashboard: true }),
    loadComponent: () =>
      import('../../insights-dashboard/insights-dashboard.component').then(
        (m) => m.InsightsDashboardComponent,
      ),
  },
  {
    path: 'mapa',
    ...page('Mapa', { noXPadding: true, viewportLayout: true }),
    loadComponent: () =>
      import('../../map-main/map-main.component').then(
        (m) => m.MapMainComponent,
      ),
  },
  {
    path: 'busca/:kind/:id',
    ...page('Resultado da busca'),
    loadComponent: () =>
      import('../../omnibox/omnibox-result-page.component').then(
        (m) => m.OmniboxResultPageComponent,
      ),
  },
  {
    path: 'historico/ocorrencias',
    ...page('Histórico de ocorrências'),
    loadComponent: () =>
      import('../../incident-history/incident-history.component').then(
        (m) => m.IncidentHistoryComponent,
      ),
  },
  {
    path: 'historico/intervalos',
    ...page('Histórico de intervalos'),
    loadComponent: () =>
      import('../../headway-history/headway-history.component').then(
        (m) => m.HeadwayHistoryComponent,
      ),
  },
  {
    path: 'sobre',
    ...page('Sobre'),
    loadComponent: () =>
      import('../../about/about.component').then((m) => m.AboutComponent),
  },
  {
    path: 'telefones',
    ...page('Telefones úteis'),
    loadComponent: () =>
      import('../../useful-phones/useful-phones.component').then(
        (m) => m.UsefulPhonesComponent,
      ),
  },
  {
    path: 'menu',
    ...page('Menu'),
    loadComponent: () =>
      import('../../menu/menu.component').then((m) => m.MenuComponent),
  },
  {
    path: 'favoritos',
    ...page('Favoritos'),
    loadComponent: () =>
      import('../../favorites/favorites.component').then(
        (m) => m.FavoritesComponent,
      ),
  },
  {
    path: 'notifications',
    ...page('Notificações'),
    loadComponent: () =>
      import('../../notifications/notifications.component').then(
        (m) => m.NotificationsComponent,
      ),
  },
];
