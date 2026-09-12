import type { Routes } from '@angular/router';
import { DEFAULT_CITY, SAO_PAULO_CITY } from '@metro/shared/cities';
import { CityNotFoundComponent } from './cities/city-not-found.component';
import { createCityRoute } from './cities/city.routes';
import { homeRoute, spFeatureRoutes } from './cities/sp/sp.routes';

export const routes: Routes = [
  createCityRoute(DEFAULT_CITY, [homeRoute], ''),
  createCityRoute(SAO_PAULO_CITY, spFeatureRoutes),
  {
    path: '**',
    component: CityNotFoundComponent,
  },
];
