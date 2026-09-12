import { collectPaths } from './route-path.utils';

describe('route paths', () => {
  it('retains city prefixes through nested and pathless layouts', () => {
    expect(collectPaths([{ path: 'sp', children: [{ children: [
      { path: '' }, { path: 'mapa' },
      { path: 'historico', children: [{ path: 'ocorrencias' }] },
    ] }] }])).toEqual([
      '/sp', '/sp/mapa', '/sp/historico', '/sp/historico/ocorrencias',
    ]);
  });

  it('omits wildcards and unresolved parameters', () => {
    expect(collectPaths([
      { path: 'itinerarios/:agency/:line' },
      { path: '**' }, { path: 'sp' },
    ])).toEqual(['/sp']);
  });
});
