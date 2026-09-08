import { NotificationTriggerInput } from '@metro/shared/notification-contracts';
import { buildNotificationMessage, NotificationSnapshot } from './notification-message';

const trigger: NotificationTriggerInput = { name: 'Ida', enabled: true, days: [1], windows: [{ start: '08:00', end: '09:00' }], timezone: 'America/Sao_Paulo', smart: false, leadMinutes: 30, intervalMinutes: 15, kind: 'rail_status', targetIds: ['one'], statusMode: 'abnormal' };
const incident: NotificationSnapshot = { title: 'Linha 1', body: 'Velocidade reduzida', fingerprint: 'slow', important: true, normal: false, observedAt: new Date('2026-09-07T10:00:00Z'), url: '/' };
describe('notification messages', () => {
  it('delivers an ongoing incident when the window opens even when it started earlier', () => {
    expect(buildNotificationMessage(trigger, 't', 'one', incident, new Date('2026-09-07T11:00:00Z'))).not.toBeNull();
  });
  it('does not deliver off-window or normal states in incident-only mode', () => {
    expect(buildNotificationMessage(trigger, 't', 'one', incident, new Date('2026-09-07T10:59:00Z'))).toBeNull();
    expect(buildNotificationMessage(trigger, 't', 'one', { ...incident, normal: true }, new Date('2026-09-07T11:00:00Z'))).toBeNull();
  });
  it('deduplicates an unchanged incident, ignoring fetch timestamps', () => {
    const first = buildNotificationMessage(trigger, 't', 'one', incident, new Date('2026-09-07T11:00:00Z'));
    const next = buildNotificationMessage(trigger, 't', 'one', { ...incident, observedAt: new Date() }, new Date('2026-09-07T11:15:00Z'));
    expect(first?.fingerprint).toBe(next?.fingerprint);
  });
  it('expires messages before the strict window ends and provides setup actions', () => {
    const message = buildNotificationMessage(trigger, 't', 'one', incident, new Date('2026-09-07T11:59:00Z'));
    expect(message?.expiresAt.toISOString()).toBe('2026-09-07T12:00:00.000Z');
    expect(message?.payload.notification.data.onActionClick.settings.url).toBe('notifications');
  });
  it('groups only upcoming arrivals in the configured lead horizon', () => {
    const now = new Date('2026-09-07T11:00:00Z');
    const arrivalTrigger = { ...trigger, kind: 'rail_arrivals' as const, arrivalLeadMinutes: 5 };
    const snapshot = { ...incident, important: false, normal: true, arrivals: [
      { destination: 'Luz', expectedAt: now.getTime() + 120_000 },
      { destination: 'Jundiaí', expectedAt: now.getTime() + 600_000 },
      { destination: 'Já passou', expectedAt: now.getTime() - 60_000 },
    ] };
    const message = buildNotificationMessage(arrivalTrigger, 't', 'one', snapshot, now);
    expect(message?.payload.notification.body).toContain('Luz: 08:02 (em 2 min)');
    expect(message?.payload.notification.body).not.toContain('Jundiaí');
    expect(message?.payload.notification.body).not.toContain('Já passou');
    expect(message?.expiresAt.getTime()).toBe(now.getTime() + 120_000);
  });
  it('stays quiet without a known approaching arrival, even in smart mode', () => {
    const arrivalTrigger = { ...trigger, kind: 'bus_arrivals' as const, smart: true };
    expect(buildNotificationMessage(arrivalTrigger, 't', 'one', { ...incident, arrivals: [] }, new Date('2026-09-07T11:00:00Z'))).toBeNull();
  });
});
