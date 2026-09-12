import { Route } from '@angular/router';

export const routes: Route[] = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () =>
      import('../../sp/dashboard/dashboard').then((m) => m.Dashboard),
  },
  {
    path: 'painel',
    loadComponent: () =>
      import('../../sp/dashboard/dashboard').then((m) => m.Dashboard),
  },
  {
    path: 'estado',
    loadComponent: () => import('../../sp/status/status').then((m) => m.Status),
  },
  {
    path: 'telefones',
    loadComponent: () =>
      import('../../sp/contacts/contacts').then((m) => m.Contacts),
  },
  {
    path: 'proxima-chegada',
    loadComponent: () => import('../../sp/search/search').then((m) => m.Search),
  },
];
