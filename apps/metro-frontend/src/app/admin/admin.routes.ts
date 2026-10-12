import type { Routes } from '@angular/router';

export const adminRoutes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./admin-shell.component').then((module) => module.AdminShellComponent),
    children: [
      {
        path: '',
        pathMatch: 'full',
        loadComponent: () =>
          import('./admin-overview.component').then(
            (module) => module.AdminOverviewComponent,
          ),
      },
      {
        path: 'administradores',
        loadComponent: () =>
          import('./admin-accounts.component').then(
            (module) => module.AdminAccountsComponent,
          ),
      },
      {
        path: 'imagens',
        loadComponent: () =>
          import('./admin-images.component').then(
            (module) => module.AdminImagesComponent,
          ),
      },
      {
        path: 'direitos-autorais',
        loadComponent: () =>
          import('./admin-licenses.component').then(
            (module) => module.AdminLicensesComponent,
          ),
      },
    ],
  },
];
