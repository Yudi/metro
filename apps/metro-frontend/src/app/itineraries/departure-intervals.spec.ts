import { summarizeDepartureIntervals } from './departure-intervals';

describe('published departure interval summaries', () => {
  it('combines neighboring windows with identical intervals into one concise span', () => {
    expect(
      summarizeDepartureIntervals([
        '04:00',
        '05:00',
        '06:00',
        '07:00',
        '08:00',
        '09:00',
      ]),
    ).toEqual([
      {
        startTime: '04:00:00',
        endTime: '09:00:00',
        minimumMinutes: 60,
        maximumMinutes: 60,
      },
    ]);
  });
  it('shows a min/max range for irregular gaps without extrapolating first or last service', () => {
    expect(
      summarizeDepartureIntervals(['04:00', '04:20', '04:45', '05:00']),
    ).toEqual([
      {
        startTime: '04:00:00',
        endTime: '05:00:00',
        minimumMinutes: 15,
        maximumMinutes: 25,
      },
    ]);
  });
  it('preserves after-midnight service hours and accounts for a boundary-crossing gap once', () => {
    expect(
      summarizeDepartureIntervals(['23:40', '24:10', '24:25', '24:40']),
    ).toEqual([
      {
        startTime: '23:40:00',
        endTime: '24:10:00',
        minimumMinutes: 30,
        maximumMinutes: 30,
      },
      {
        startTime: '24:10:00',
        endTime: '24:40:00',
        minimumMinutes: 15,
        maximumMinutes: 15,
      },
    ]);
  });
  it('does not invent an interval for a single departure or count duplicate times', () => {
    expect(summarizeDepartureIntervals(['08:00', '08:00', 'invalid'])).toEqual(
      [],
    );
    expect(summarizeDepartureIntervals(['09:00', '08:00', '08:00'])).toEqual([
      {
        startTime: '08:00:00',
        endTime: '09:00:00',
        minimumMinutes: 60,
        maximumMinutes: 60,
      },
    ]);
  });
});
