import { Route } from '@angular/router';

export const routes: Route[] = [
  {
    path: 'painel',
    loadComponent: () => import('./dashboard/dashboard').then((m) => m.Dashboard),
  },
  {
    path: 'estado',
    loadComponent: () => import('./status/status').then((m) => m.Status),
  },
  {
    path: 'telefones',
    loadComponent: () => import('./contacts/contacts').then((m) => m.Contacts),
  },
  {
    path: 'proxima-chegada',
    loadComponent: () => import('./search/search').then((m) => m.Search),
  },
];
