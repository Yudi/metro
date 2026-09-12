import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import type { Route } from '@angular/router';
import { DEFAULT_CITY } from '@metro/shared/cities';
import { CityNotFoundComponent } from './cities/city-not-found.component';
import { createCityRoute } from './cities/city.routes';
import { spFeatureRoutes } from './cities/sp/sp.routes';
import { HomeComponent } from './home/home.component';
import { routes } from './app.routes';

describe('application city routes', () => {
  it('assembles a city route from metadata and feature routes', () => {
    const fixtureCity = {
      id: 'campinas',
      name: 'Campinas',
      timeZone: 'America/Sao_Paulo',
      locale: 'pt-BR',
      siteTitle: 'Transporte Metropolitano de Campinas',
      description: 'Informações de transporte de Campinas',
      map: {
        center: { latitude: -22.9056, longitude: -47.0608 },
        zoom: 12,
      },
      searchPriorityCities: ['campinas'],
    } as const;
    const cityRoute = createCityRoute(fixtureCity, [{ path: 'painel' }]);

    expect(cityRoute.path).toBe('campinas');
    expect(cityRoute.data?.['cityId']).toBe('campinas');
    expect(cityRoute.children?.[0].path).toBe('painel');
  });

  it('renders the São Paulo rail status at root and /sp', async () => {
    const rootRoute = routes.find((route) => route.path === '');
    const cityRoute = routes.find(
      (route) => route.path === DEFAULT_CITY.id,
    );
    const rootHome = rootRoute?.children?.find((route) => route.path === '');
    const cityHome = cityRoute?.children?.find((route) => route.path === '');
    const featurePaths = cityRoute?.children?.map((route) => route.path);

    expect(rootRoute?.pathMatch).toBe('full');
    expect(await rootHome?.loadComponent?.()).toBe(HomeComponent);
    expect(await cityHome?.loadComponent?.()).toBe(HomeComponent);
    expect(rootHome?.redirectTo).toBeUndefined();
    expect(cityRoute?.data?.['cityId']).toBe(DEFAULT_CITY.id);
    expect(featurePaths).toEqual(
      expect.arrayContaining(spFeatureRoutes.map((route) => route.path)),
    );
    expect(routes.map((route) => route.path)).toEqual(['', 'sp', '**']);
  });

  it('contains no redirects', () => {
    const visit = (routeList: readonly Route[]): boolean =>
      routeList.some(
        (route) =>
          route.redirectTo !== undefined ||
          (route.children ? visit(route.children) : false),
      );

    expect(visit(routes)).toBe(false);
  });

  it('shows the not found page for old and unsupported paths', async () => {
    TestBed.configureTestingModule({ providers: [provideRouter(routes)] });
    const harness = await RouterTestingHarness.create();

    await harness.navigateByUrl('/mapa', CityNotFoundComponent);
    expect(TestBed.inject(Router).url).toBe('/mapa');

    await harness.navigateByUrl('/sao-paulo/painel', CityNotFoundComponent);
    expect(TestBed.inject(Router).url).toBe('/sao-paulo/painel');

    expect(harness.routeNativeElement?.textContent).toContain(
      'Página não encontrada',
    );
  });
});
