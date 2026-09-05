import { describe, expect, it } from '@jest/globals';
import { SearchTypes, SearchTypesEnum, StopsAndStationsValues } from './search.utils';

// Keep string literals assignable to both the public type and array element type.
const literalSearchType: SearchTypes = 'busRoute';
const literalArrayElement: (typeof SearchTypes)[number] = 'busRoute';

describe('search type contracts', () => {
  it('preserves public values, ordering, and string literal compatibility', () => {
    expect(SearchTypes).toEqual([
      'busRoute',
      'busStop',
      'railLine',
      'railStation',
      'bikeStation',
    ]);
    expect(SearchTypes).toEqual(Object.values(SearchTypesEnum));
    expect(SearchTypes.includes(literalSearchType)).toBe(true);
    expect(SearchTypes.includes(literalArrayElement)).toBe(true);
    expect(StopsAndStationsValues).toEqual([
      'busStop',
      'railStation',
      'bikeStation',
    ]);
  });
});
