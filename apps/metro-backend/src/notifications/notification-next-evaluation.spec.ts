import { NotificationTriggerInput } from '@metro/shared/notification-contracts';
import { nextNotificationEvaluation } from './notification-next-evaluation';
const trigger: NotificationTriggerInput = {
  name: 'Ida',
  enabled: true,
  days: [1],
  windows: [{ start: '08:00', end: '09:00' }],
  timezone: 'America/Sao_Paulo',
  smart: false,
  leadMinutes: 30,
  intervalMinutes: 15,
  kind: 'rail_status',
  targetIds: ['target'],
  statusMode: 'abnormal',
};
describe('indexed notification wakeups', () => {
  it('sleeps until the next selected weekday', () => {
    expect(
      nextNotificationEvaluation(
        trigger,
        new Date('2026-09-08T11:00:00Z'),
      ).toISOString(),
    ).toBe('2026-09-14T11:00:00.000Z');
  });
  it('wakes before the window in smart mode', () => {
    expect(
      nextNotificationEvaluation(
        { ...trigger, smart: true },
        new Date('2026-09-07T10:00:00Z'),
      ).toISOString(),
    ).toBe('2026-09-07T10:30:00.000Z');
  });
  it('always schedules using Sao Paulo even if given another timezone', () => {
    expect(
      nextNotificationEvaluation(
        { ...trigger, days: [0], timezone: 'UTC' },
        new Date('2026-03-07T15:00:00Z'),
      ).toISOString(),
    ).toBe('2026-03-08T11:00:00.000Z');
  });
});
