import { Routes } from '@angular/router';
import { SeoGuard } from './shared/seo/seo.guard';

export const routes: Routes = [
  {
    path: '',
    canActivate: [SeoGuard],
    loadComponent: () => import('./app.component').then((m) => m.AppComponent),
  },
];
