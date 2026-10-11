import { convertToBusRoute } from './geography-graphql.mapper';

describe('convertToBusRoute', () => {
  it('retains the direction identity and destination for map features', () => {
    const feature = convertToBusRoute({
      id: 'direction', routeId: '100', shortName: '100', longName: 'Centro - Bairro',
      color: '1976d2', textColor: 'ffffff', favoriteCode: 'direction-key',
      requestedCode: 'saved-key', destination: 'Terminal Centro', directionId: 0, isCircular: true,
    });
    expect(feature.properties).toEqual(expect.objectContaining({
      favoriteCode: 'direction-key', requestedCode: 'saved-key',
      destination: 'Terminal Centro', directionId: 0, isCircular: true,
    }));
  });
});
