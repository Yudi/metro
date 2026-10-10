import {
  encodeBusDirectionFavorite,
  encodeBusLineFavorite,
  parseBusLineFavorite,
  isBusLineFavorite,
  getBusLineDirectionAnchor,
  isBusDirectionFavorite,
  matchBusDirectionFavorite,
  parseBusDirectionFavorite,
  type BusDirectionFavoriteCandidate,
  type BusDirectionFavoriteKey,
} from './bus-direction-favorite.utils';

const favorite: BusDirectionFavoriteKey = {
  sourceAgency: 'SPTrans',
  shortName: '  8055  ',
  originLatitude: -23.55052,
  originLongitude: -46.63331,
  viaLatitude: -23.5555,
  viaLongitude: -46.644,
  destinationLatitude: -23.5612,
  destinationLongitude: -46.6558,
};

function candidate(
  overrides: Partial<BusDirectionFavoriteCandidate> = {},
): BusDirectionFavoriteCandidate {
  return {
    sourceAgency: 'sptrans',
    shortName: '8055',
    directionId: 0,
    destination: 'Terminal atual',
    originLatitude: -23.5505,
    originLongitude: -46.6333,
    viaLatitude: -23.5555,
    viaLongitude: -46.644,
    destinationLatitude: -23.5612,
    destinationLongitude: -46.6558,
    ...overrides,
  };
}

function getFavoriteCode(
  value: BusDirectionFavoriteKey = favorite,
): string {
  const code = encodeBusDirectionFavorite(value);
  if (code === null) {
    throw new Error('Expected a valid bus direction favorite code.');
  }

  return code;
}

describe('bus direction favorite identity', () => {
  it('encodes a canonical v1 code with normalized feed identity and four-decimal coordinates', () => {
    const code = getFavoriteCode();

    expect(code).toMatch(/^bus:v1:sptrans:8055:/);
    expect(code).not.toContain(',');
    expect(code.length).toBeLessThan(128);
    expect(parseBusDirectionFavorite(code)).toEqual({
      sourceAgency: 'sptrans',
      shortName: '8055',
      originLatitude: -23.5505,
      originLongitude: -46.6333,
      viaLatitude: -23.5555,
      viaLongitude: -46.644,
      destinationLatitude: -23.5612,
      destinationLongitude: -46.6558,
    });
    expect(isBusDirectionFavorite(code)).toBe(true);
  });

  it('URI-encodes short names and rejects codes that exceed the storage limit', () => {
    const encoded = getFavoriteCode({
      ...favorite,
      shortName: 'Linha 10: São Paulo',
    });
    expect(encoded).toContain('LINHA%2010%3A%20S%C3%83O%20PAULO');
    expect(parseBusDirectionFavorite(encoded)?.shortName).toBe(
      'LINHA 10: SÃO PAULO',
    );
    expect(
      encodeBusDirectionFavorite({ ...favorite, shortName: 'x'.repeat(100) }),
    ).toBeNull();
    expect(
      encodeBusDirectionFavorite({ ...favorite, shortName: 'x'.repeat(59) }),
    ).toBeNull();
    expect(
      encodeBusDirectionFavorite({ ...favorite, shortName: 'x'.repeat(58) })
        ?.length,
    ).toBe(127);
  });

  it('matches after provider direction ID and destination label changes', () => {
    const code = getFavoriteCode();
    const renamedDirection = candidate({
      directionId: 1,
      destination: 'Novo terminal',
    });

    expect(matchBusDirectionFavorite(code, [renamedDirection])).toBe(
      renamedDirection,
    );
  });

  it('matches small terminal coordinate changes and normalized agency/name casing', () => {
    const code = getFavoriteCode();
    const movedDirection = candidate({
      sourceAgency: ' SPTRANS ',
      shortName: ' 8055 ',
      originLatitude: -23.5507,
      originLongitude: -46.6334,
    });

    expect(matchBusDirectionFavorite(code, [movedDirection])).toBe(
      movedDirection,
    );
  });

  it('does not match another agency with the same route short name and endpoints', () => {
    const code = getFavoriteCode();
    expect(
      matchBusDirectionFavorite(code, [candidate({ sourceAgency: 'artesp' })]),
    ).toBeNull();
  });

  it('rejects endpoints or the ordered via anchor outside their matching radii', () => {
    const code = getFavoriteCode();
    const distant = candidate({ originLatitude: -23.5705 });
    const reversed = candidate({
      originLatitude: favorite.destinationLatitude,
      originLongitude: favorite.destinationLongitude,
      viaLatitude: -23.5555,
      viaLongitude: -46.644,
      destinationLatitude: favorite.originLatitude,
      destinationLongitude: favorite.originLongitude,
    });

    expect(matchBusDirectionFavorite(code, [distant])).toBeNull();
    expect(matchBusDirectionFavorite(code, [reversed])).toBeNull();

    const nearbyTerminals = {
      ...favorite,
      originLatitude: -23.55,
      originLongitude: -46.63,
      viaLatitude: -23.555,
      viaLongitude: -46.63,
      destinationLatitude: -23.56,
      destinationLongitude: -46.63,
    };
    const nearbyCode = getFavoriteCode(nearbyTerminals);
    const nearbyReversed = candidate({
      originLatitude: nearbyTerminals.destinationLatitude,
      originLongitude: nearbyTerminals.destinationLongitude,
      viaLatitude: -23.6,
      viaLongitude: -46.63,
      destinationLatitude: nearbyTerminals.originLatitude,
      destinationLongitude: nearbyTerminals.originLongitude,
    });
    expect(matchBusDirectionFavorite(nearbyCode, [nearbyReversed])).toBeNull();
  });

  it('rejects tied or close candidate directions instead of guessing', () => {
    const code = getFavoriteCode();
    const nearest = candidate();
    const closeContender = candidate({
      directionId: 1,
      originLatitude: -23.5506,
      destination: 'Outro destino',
    });

    expect(
      matchBusDirectionFavorite(code, [nearest, { ...nearest }]),
    ).toBeNull();
    expect(
      matchBusDirectionFavorite(code, [nearest, closeContender]),
    ).toBeNull();
  });

  it('uses the ordered via anchor to resolve circular directions', () => {
    const loopCode = getFavoriteCode({
      ...favorite,
      originLatitude: -23.55,
      originLongitude: -46.63,
      viaLatitude: -23.56,
      viaLongitude: -46.64,
      destinationLatitude: -23.55,
      destinationLongitude: -46.63,
    });
    const sameLoopDirection = candidate({
      originLatitude: -23.55,
      originLongitude: -46.63,
      viaLatitude: -23.56,
      viaLongitude: -46.64,
      destinationLatitude: -23.55,
      destinationLongitude: -46.63,
    });
    const oppositeLoopDirection = candidate({
      directionId: 1,
      originLatitude: -23.55,
      originLongitude: -46.63,
      viaLatitude: -23.6,
      viaLongitude: -46.62,
      destinationLatitude: -23.55,
      destinationLongitude: -46.63,
    });

    expect(
      matchBusDirectionFavorite(loopCode, [
        sameLoopDirection,
        oppositeLoopDirection,
      ]),
    ).toBe(sameLoopDirection);
    expect(
      matchBusDirectionFavorite(loopCode, [oppositeLoopDirection]),
    ).toBeNull();
  });

  it('rejects malformed, non-canonical, out-of-range, and overlong codes', () => {
    const valid = getFavoriteCode();
    const codes = [
      'bus:v2:sptrans:8055:-23.5505~-46.6333:-23.5555~-46.6440:-23.5612~-46.6558',
      'bus:v1:sptrans:%ZZ:-23.5505~-46.6333:-23.5555~-46.6440:-23.5612~-46.6558',
      'bus:v1:sptrans:8055:91.0000~-46.6333:-23.5555~-46.6440:-23.5612~-46.6558',
      'bus:v1:sptrans:8055:-23.55050~-46.6333:-23.5555~-46.6440:-23.5612~-46.6558',
      `${valid}${'x'.repeat(128)}`,
    ];

    for (const code of codes) {
      expect(parseBusDirectionFavorite(code)).toBeNull();
      expect(isBusDirectionFavorite(code)).toBe(false);
    }

    expect(
      encodeBusDirectionFavorite({ ...favorite, originLongitude: 181 }),
    ).toBeNull();
  });
});

it('retains a whole-line identity using geographic anchors while waiting for complete directions', () => {
  const directionCode = encodeBusDirectionFavorite({
    sourceAgency: 'sptrans', shortName: '001',
    originLatitude: -23.5, originLongitude: -46.6,
    viaLatitude: -23.6, viaLongitude: -46.7,
    destinationLatitude: -23.5, destinationLongitude: -46.6,
  });
  if (!directionCode) throw new Error('Fixture key is invalid');
  const lineCode = encodeBusLineFavorite(directionCode);
  if (!lineCode) throw new Error('Fixture line key is invalid');
  expect(isBusDirectionFavorite(lineCode)).toBe(false);
  expect(isBusLineFavorite(lineCode)).toBe(true);
  expect(parseBusLineFavorite(lineCode)).toEqual(parseBusDirectionFavorite(directionCode));
  expect(getBusLineDirectionAnchor(lineCode)).toBe(directionCode);
});

it('does not switch a short route to its reversed service when the original direction disappears', () => {
  const snapshot = {
    sourceAgency: 'sptrans', shortName: 'short',
    originLatitude: -23.5, originLongitude: -46.6,
    viaLatitude: -23.502, viaLongitude: -46.6,
    destinationLatitude: -23.505, destinationLongitude: -46.6,
  };
  const code = encodeBusDirectionFavorite(snapshot);
  if (!code) throw new Error('Invalid fixture');
  expect(matchBusDirectionFavorite(code, [{
    ...snapshot, directionId: 1, destination: 'Opposite',
    originLatitude: snapshot.destinationLatitude,
    destinationLatitude: snapshot.originLatitude,
  }])).toBeNull();
});
