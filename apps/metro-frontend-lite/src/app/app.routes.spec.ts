import { Route } from '@angular/router';
import { SAO_PAULO_CITY } from '@metro/shared/cities';
import { SeoGuard } from '@metro/shared/seo';
import { collectPaths } from '@metro/shared/utils';
import { routes } from './app.routes';
import { routes as spRoutes } from './cities/sp/sp.routes';

function layoutChildren(): readonly Route[] {
  return routes[0]?.children ?? [];
}

function flattenRoutes(routeList: readonly Route[]): Route[] {
  return routeList.flatMap((route) => [
    route,
    ...(route.children ? flattenRoutes(route.children) : []),
  ]);
}

describe('lite application routes', () => {
  it('renders the dashboard directly at the root and city root', () => {
    const children = layoutChildren();
    const rootRoute = children.find(
      (route) => route.path === '' && route.pathMatch === 'full',
    );
    const cityRoute = children.find(
      (route) => route.path === SAO_PAULO_CITY.id,
    );
    const cityRootRoute = cityRoute?.children?.find(
      (route) => route.path === '' && route.pathMatch === 'full',
    );

    expect(rootRoute?.loadComponent).toEqual(expect.any(Function));
    expect(cityRoute?.children).toBe(spRoutes);
    expect(cityRootRoute?.loadComponent).toEqual(expect.any(Function));
  });

  it('keeps every route canonical and removes the retired aliases', () => {
    const routeList = flattenRoutes(routes);
    const topLevelPaths = layoutChildren().map((route) => route.path);

    expect(routeList.some((route) => route.redirectTo !== undefined)).toBe(
      false,
    );
    expect(topLevelPaths).not.toEqual(
      expect.arrayContaining([
        'sao-paulo',
        'painel',
        'estado',
        'proxima-chegada',
        'telefones',
      ]),
    );
  });

  it('keeps feature components lazy', () => {
    const cityRoute = layoutChildren().find(
      (route) => route.path === SAO_PAULO_CITY.id,
    );

    expect(
      cityRoute?.children?.every(
        (route) => route.loadComponent !== undefined,
      ),
    ).toBe(true);
  });

  it('protects the rendered route tree with the SEO guard', () => {
    expect(routes[0]?.canActivateChild).toContain(SeoGuard);
  });

  it('derives sitemap paths from the rendered route tree', () => {
    expect(collectPaths(routes)).toEqual([
      '/',
      '/sp',
      '/sp/painel',
      '/sp/estado',
      '/sp/telefones',
      '/sp/proxima-chegada',
    ]);
  });

  it('does not register a parameterized city catch-all', () => {
    expect(layoutChildren().some((route) => route.path === ':city')).toBe(
      false,
    );
  });
});
