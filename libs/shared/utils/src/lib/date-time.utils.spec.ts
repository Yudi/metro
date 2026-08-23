import {
  formatTransitTime,
  getTransitTimeDifferenceMinutes,
} from './date-time.utils';

describe('date-time utilities', () => {
  it('formats absolute timestamps in the transit timezone', () => {
    expect(
      formatTransitTime('2026-01-01T03:15:00.000Z', {
        timeZone: 'America/Sao_Paulo',
      }),
    ).toBe('00:15');
  });

  it('treats an after-midnight arrival as the next service day', () => {
    expect(
      getTransitTimeDifferenceMinutes('00:05', {
        now: new Date('2026-08-24T02:55:00.000Z'),
      }),
    ).toBe(10);
  });

  it('keeps recently passed arrivals negative', () => {
    expect(
      getTransitTimeDifferenceMinutes('23:50', {
        now: new Date('2026-08-24T02:55:00.000Z'),
      }),
    ).toBe(-5);
  });

  it.each(['24:00', '12:60', 'bad', ''])('rejects invalid time %p', (value) => {
    expect(getTransitTimeDifferenceMinutes(value)).toBeNull();
  });
});
