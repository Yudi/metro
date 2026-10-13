import { getRouteColor, getRouteTextColor } from './transit-utils';

describe('transit route color helpers', () => {
  it('normalizes valid route colors with or without a leading hash', () => {
    expect(getRouteColor({ color: ' #12aBcD ' })).toBe('#12aBcD');
    expect(getRouteColor({ color: '#abc' })).toBe('#aabbcc');
  });

  it('uses a valid fallback when the route color is missing or malformed', () => {
    expect(getRouteColor({ color: '' })).toBe('#1976d2');
    expect(getRouteColor({ color: 'not-a-color' }, '#123456')).toBe('#123456');
    expect(getRouteColor({ color: '##123456' }, 'invalid')).toBe('#1976d2');
  });

  it('normalizes valid feed text colors and computes contrast when absent', () => {
    expect(getRouteTextColor({ color: '#ffffff', textColor: '000' })).toBe(
      '#000000',
    );
    expect(getRouteTextColor({ color: '000000', textColor: '' })).toBe(
      '#ffffff',
    );
    expect(
      getRouteTextColor({ color: 'not-a-color', textColor: 'invalid' }),
    ).toBe('#ffffff');
  });
});
