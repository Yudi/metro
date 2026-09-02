import {
  findOlhoVivoGtfsDirection,
  getOlhoVivoDestination,
  getOlhoVivoGtfsDirectionId,
  getOlhoVivoOrigin,
} from './olhovivo-direction.utils';

describe('OlhoVivo direction utilities', () => {
  const directionOne = {
    sl: 1,
    lt0: 'VL. OLÍMPIA',
    lt1: 'TERM. PIRITUBA',
  };
  const directionTwo = { ...directionOne, sl: 2 };

  it('selects the direction-one destination and origin', () => {
    expect(getOlhoVivoDestination(directionOne)).toBe('VL. OLÍMPIA');
    expect(getOlhoVivoOrigin(directionOne)).toBe('TERM. PIRITUBA');
  });

  it('selects the direction-two destination and origin', () => {
    expect(getOlhoVivoDestination(directionTwo)).toBe('TERM. PIRITUBA');
    expect(getOlhoVivoOrigin(directionTwo)).toBe('VL. OLÍMPIA');
  });

  it.each([
    [1, 0],
    [2, 1],
    [0, null],
    [3, null],
  ])('maps OlhoVivo direction %p to GTFS direction %p', (sentido, expected) => {
    expect(getOlhoVivoGtfsDirectionId(sentido)).toBe(expected);
  });

  it('uses the numeric direction before an opposite matching headsign', () => {
    const directions = [
      { directionId: 0, headsign: 'Vl. Olímpia' },
      { directionId: 1, headsign: 'Term. Pirituba' },
    ];

    expect(findOlhoVivoGtfsDirection(directionTwo, directions)).toEqual(
      directions[1],
    );
  });

  it('falls back to a normalized destination when the direction is invalid', () => {
    const directions = [
      { directionId: 5, headsign: 'Terminal Pirituba' },
      { directionId: 6, headsign: 'Vila Olímpia' },
    ];

    expect(
      findOlhoVivoGtfsDirection(
        { ...directionOne, sl: 0, lt0: 'Vila Olimpia' },
        directions,
      ),
    ).toEqual(directions[1]);
  });

  it('does not loosely match an empty destination', () => {
    expect(
      findOlhoVivoGtfsDirection(
        { sl: 0, lt0: '', lt1: '' },
        [{ directionId: 0, headsign: '' }],
      ),
    ).toBeUndefined();
  });
});
