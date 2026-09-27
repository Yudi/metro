import { SAO_PAULO_CITY } from '@metro/shared/cities';
import { spFeatureRoutes } from '../cities/sp/sp.routes';
import {
  matchDestinations,
  menuDestinations,
  searchDestinations,
} from './menu-destinations';

describe('omnibox destination catalog', () => {
  const destinations = searchDestinations(SAO_PAULO_CITY);

  it('covers every concrete application page and uses existing routes', () => {
    const paths = spFeatureRoutes
      .map((route) => `/${route.path}`)
      .map((path) => (path === '/' ? '' : path));
    const searchablePaths = destinations.flatMap((item) =>
      item.route === undefined ? [] : [item.route],
    );
    expect(new Set(searchablePaths)).toEqual(new Set(paths));
    expect(paths).not.toContain('/itinerarios');
    expect(paths).not.toContain('/proxima-chegada');
  });

  it('shares map presets and external links with the menu', () => {
    for (const item of Object.values(menuDestinations(SAO_PAULO_CITY)).flat()) {
      expect(destinations).toContainEqual(item);
    }
    expect(
      matchDestinations('circulares usp', destinations)[0].queryParams?.[
        'busRoutes'
      ],
    ).toContain('8082-10');
  });

  it('ignores accents and requires every word, ranking exact labels first', () => {
    expect(matchDestinations('NOTIFICACOES', destinations)[0].route).toBe(
      '/notifications',
    );
    expect(matchDestinations('mapa', destinations)[0].label).toBe('Mapa');
    expect(
      matchDestinations('historico intervalos', destinations)[0].route,
    ).toBe('/historico/intervalos');
    expect(matchDestinations('nao existe', destinations)).toEqual([]);
    expect(matchDestinations(' ', destinations)).toEqual([]);
  });
});
