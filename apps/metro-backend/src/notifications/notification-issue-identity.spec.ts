import type { Prisma } from '../../generated/prisma/client';
import { notificationIssueIdentity } from './notification-issue-identity';
import { NotificationSnapshot } from './notification-message';

describe('issue episode identities', () => {
  const snapshot: NotificationSnapshot = { title: 'Linha 1', body: 'Ocorrência', fingerprint: 'details', normal: false, important: true, observedAt: new Date('2026-09-07T11:00:00Z'), url: '/' };
  const update = jest.fn();
  const findUniqueOrThrow = jest.fn();
  const tx = { $queryRaw: jest.fn(), notificationTarget: { findUniqueOrThrow, update } } as unknown as Prisma.TransactionClient;
  beforeEach(() => { jest.clearAllMocks(); findUniqueOrThrow.mockResolvedValue({ observationClass: 'incident', observationEpisode: 'episode-1', observationAt: snapshot.observedAt }); });
  it('keeps the same episode despite content updates, triggers or schedule changes', async () => {
    const first = await notificationIssueIdentity(tx, 'rail_status', 'line', snapshot);
    const updated = await notificationIssueIdentity(tx, 'rail_status', 'line', { ...snapshot, fingerprint: 'reworded-description' });
    expect(first).toBe(updated);
    expect(await notificationIssueIdentity(tx, 'rail_status', 'line', { ...snapshot, important: false, fingerprint: 'different-severity' })).toBe(first);
  });
  it('starts a new episode only after a known recovery', async () => {
    const previous = await notificationIssueIdentity(tx, 'rail_status', 'line', snapshot);
    findUniqueOrThrow.mockResolvedValue({ observationClass: 'normal', observationEpisode: 'recovery', observationAt: new Date(snapshot.observedAt.getTime() - 1000) });
    expect(await notificationIssueIdentity(tx, 'rail_status', 'line', snapshot)).not.toBe(previous);
  });
  it('does not let an older replica observation reset the episode', async () => {
    expect(await notificationIssueIdentity(tx, 'rail_status', 'line', { ...snapshot, normal: true, observedAt: new Date('2026-09-07T10:00:00Z') })).toBeUndefined();
    expect(update).not.toHaveBeenCalled();
  });
  it('deduplicates the same bus notice across different route targets', async () => {
    expect(await notificationIssueIdentity(tx, 'bus_notices', 'route-a', snapshot)).toBe(await notificationIssueIdentity(tx, 'bus_notices', 'route-b', snapshot));
  });
});
