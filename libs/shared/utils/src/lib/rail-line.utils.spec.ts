import { describe, expect, it } from '@jest/globals';

import { getRailLineByCode, getRailLinesByAgency } from './rail-line.utils';
import { getRouteAgency, TransitAgency } from './transit-agency.utils';

describe('Linha 17 agency', () => {
  it('registers Linha 17 as operated by Metro', () => {
    expect(getRailLineByCode(17)?.agency).toBe(TransitAgency.METRO);
    expect(getRouteAgency('L17')).toBe(TransitAgency.METRO);
    expect(
      getRailLinesByAgency(TransitAgency.METRO).some((line) => line.code === 17),
    ).toBe(true);
    expect(
      getRailLinesByAgency(TransitAgency.VIAMOBILIDADE).some(
        (line) => line.code === 17,
      ),
    ).toBe(false);
  });
});
