import {
  NotificationTriggerInput,
  validateNotificationTrigger,
} from './notifications';
import { notificationEligibility } from './schedule';

const trigger: NotificationTriggerInput = {
  name: 'Volta',
  enabled: true,
  days: [1],
  windows: [{ start: '23:00', end: '01:00' }],
  timezone: 'America/Sao_Paulo',
  smart: false,
  leadMinutes: 30,
  intervalMinutes: 15,
  kind: 'rail_status',
  targetIds: ['target-1'],
  statusMode: 'abnormal',
};
describe('notification schedules', () => {
  it('assigns overnight hours to the selected starting day', () => {
    expect(
      notificationEligibility(trigger, new Date('2026-09-08T03:30:00Z'))
        ?.windowKey,
    ).toBe('2026-09-07-23:00-01:00');
    expect(
      notificationEligibility(trigger, new Date('2026-09-09T03:30:00Z')),
    ).toBeNull();
  });
  it('uses inclusive starts and exclusive ends', () => {
    expect(
      notificationEligibility(trigger, new Date('2026-09-08T02:00:00Z')),
    ).not.toBeNull();
    expect(
      notificationEligibility(trigger, new Date('2026-09-08T04:00:00Z')),
    ).toBeNull();
  });
  it('never extends strict windows even for an important event', () => {
    expect(
      notificationEligibility(trigger, new Date('2026-09-08T01:45:00Z'), true),
    ).toBeNull();
  });
  it('extends only important events and respects the configured limit', () => {
    const smart = { ...trigger, smart: true };
    expect(
      notificationEligibility(smart, new Date('2026-09-08T01:45:00Z'), true)
        ?.advance,
    ).toBe(true);
    expect(
      notificationEligibility(smart, new Date('2026-09-08T01:45:00Z'), false),
    ).toBeNull();
    expect(
      notificationEligibility(smart, new Date('2026-09-08T01:29:00Z'), true),
    ).toBeNull();
  });
  it('supports advance warnings crossing midnight before a selected day', () => {
    const smart = {
      ...trigger,
      smart: true,
      windows: [{ start: '00:15', end: '01:00' }],
    };
    expect(
      notificationEligibility(smart, new Date('2026-09-07T02:50:00Z'), true)
        ?.windowKey,
    ).toBe('2026-09-07-00:15-01:00');
  });
  it('supports multiple days and ranges', () => {
    const multiple = {
      ...trigger,
      days: [1, 2],
      windows: [
        { start: '08:00', end: '09:00' },
        { start: '17:00', end: '18:00' },
      ],
    };
    expect(
      notificationEligibility(multiple, new Date('2026-09-08T20:15:00Z'))
        ?.cadenceSlot,
    ).toBe(1);
    expect(
      notificationEligibility(multiple, new Date('2026-09-08T19:15:00Z')),
    ).toBeNull();
  });
  it('rejects other time zones', () => {
    expect(
      validateNotificationTrigger({ ...trigger, timezone: 'America/New_York' }),
    ).not.toBeNull();
  });
  it('rejects malformed schedules and bounded settings', () => {
    expect(validateNotificationTrigger(trigger)).toBeNull();
    for (const patch of [
      { days: [] },
      { days: [8] },
      { windows: [{ start: '25:00', end: '01:00' }] },
      { timezone: 'invalid' },
      { leadMinutes: 61 },
      { intervalMinutes: 0 },
      { targetIds: [] },
    ]) {
      expect(
        validateNotificationTrigger({ ...trigger, ...patch }),
      ).not.toBeNull();
    }
  });
});
