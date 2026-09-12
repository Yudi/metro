import { cityPath, DEFAULT_CITY, getCity, SUPPORTED_CITIES } from './city-registry';

describe('city registry and paths', () => {
  it('enables only implemented São Paulo and does not resolve an unknown city', () => {
    expect(DEFAULT_CITY.id).toBe('sp');
    expect(SUPPORTED_CITIES.map((city) => city.id)).toEqual(['sp']);
    expect(getCity('sp')).toBe(DEFAULT_CITY);
    expect(getCity('unknown-city')).toBeUndefined();
  });

  it('constructs city roots, feature paths and deep links with query and fragment', () => {
    expect(cityPath()).toBe('/sp');
    expect(cityPath('/mapa?lat=-23&lon=-46#selection')).toBe('/sp/mapa?lat=-23&lon=-46#selection');
    expect(cityPath('itinerarios/example/123', 'other-city')).toBe('/other-city/itinerarios/example/123');
    expect(cityPath('?restoreMapState=1')).toBe('/sp?restoreMapState=1');
  });

  it('does not duplicate an existing city prefix', () => {
    expect(cityPath('/sp/mapa')).toBe('/sp/mapa');
    expect(cityPath('/sp#home')).toBe('/sp#home');
  });

  it('rejects external URLs and malformed city identifiers', () => {
    expect(() => cityPath('//example.com')).toThrow();
    expect(() => cityPath('https://example.com')).toThrow();
    expect(() => cityPath('mapa', '../other')).toThrow();
  });
});
