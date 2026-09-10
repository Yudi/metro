import { formatScheduledRailTime } from './rail-schedule-display.utils';

describe('formatScheduledRailTime', () => {
  const timeZone = 'America/Sao_Paulo';

  it('uses the transit date even when UTC has rolled over', () => {
    expect(
      formatScheduledRailTime(
        '2026-09-10T02:55:00Z',
        timeZone,
        new Date('2026-09-10T02:45:00Z'),
      ),
    ).toBe('23:55');
  });

  it('identifies the following local date across month boundaries', () => {
    expect(
      formatScheduledRailTime(
        '2026-10-01T07:00:00Z',
        timeZone,
        new Date('2026-10-01T02:45:00Z'),
      ),
    ).toBe('Amanhã, 04:00');
  });

  it('shows the actual date when a service resumes after the weekend', () => {
    const label = formatScheduledRailTime(
      '2026-09-14T07:00:00Z',
      timeZone,
      new Date('2026-09-11T22:00:00Z'),
    );
    expect(label).toContain('14/09');
    expect(label).toContain('04:00');
    expect(label).not.toContain('Amanhã');
  });

  it('increments the calendar date across a daylight-saving boundary', () => {
    expect(
      formatScheduledRailTime(
        '2026-11-02T12:00:00Z',
        'America/New_York',
        new Date('2026-11-01T04:30:00Z'),
      ),
    ).toBe('Amanhã, 07:00');
  });

  it('does not render invalid timestamps as clock times', () => {
    expect(formatScheduledRailTime('invalid')).toBe('');
  });
});
