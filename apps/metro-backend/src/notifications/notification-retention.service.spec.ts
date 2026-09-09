import { PrismaService } from '../prisma/prisma.service';
import { NotificationRetentionService } from './notification-retention.service';
import {
  notificationRetentionExpiry,
  notificationRetentionStage,
} from './notification-retention';

describe('notification retention', () => {
  const now = new Date('2026-09-08T12:00:00Z');
  const prisma = {
    user: { findMany: jest.fn(), findUnique: jest.fn() },
    pushSubscription: { findMany: jest.fn(), deleteMany: jest.fn() },
    notificationTrigger: { deleteMany: jest.fn() },
    notificationIssueReceipt: { deleteMany: jest.fn() },
    notificationDelivery: { createMany: jest.fn() },
    $queryRaw: jest.fn(),
    $transaction: jest.fn(),
  };
  const service = new NotificationRetentionService(
    prisma as unknown as PrismaService,
  );
  beforeEach(() => {
    jest.resetAllMocks();
    prisma.user.findMany
      .mockResolvedValueOnce([{ id: 'u' }])
      .mockResolvedValue([]);
    prisma.user.findUnique.mockResolvedValue({
      id: 'u',
      last_login: new Date('2024-09-15T12:00:00Z'),
    });
    prisma.pushSubscription.findMany.mockResolvedValue([{ id: 's' }]);
    prisma.$transaction.mockImplementation((callback) => callback(prisma));
  });

  it.each([7, 3, 1])(
    'queues a deduplicated reminder %s days before expiry',
    async (days) => {
      const lastLogin = new Date(
        `2024-09-${String(8 + days).padStart(2, '0')}T12:00:00Z`,
      );
      prisma.user.findUnique.mockResolvedValue({
        id: 'u',
        last_login: lastLogin,
      });
      await service.maintain(now);
      const expiry = notificationRetentionExpiry(lastLogin);
      expect(prisma.notificationDelivery.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            subscriptionId: 's',
            retentionKey: `${expiry.toISOString()}:${days}`,
            retentionExpiresAt: expiry,
          }),
        ],
        skipDuplicates: true,
      });
      expect(prisma.notificationTrigger.deleteMany).not.toHaveBeenCalled();
    },
  );

  it('deletes notification data at the two-year boundary under the account lock', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'u',
      last_login: new Date('2024-09-08T12:00:00Z'),
    });
    await service.maintain(now);
    expect(prisma.$queryRaw).toHaveBeenCalled();
    expect(prisma.notificationTrigger.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'u' },
    });
    expect(prisma.pushSubscription.deleteMany).toHaveBeenCalledWith({
      where: { user_id: 'u' },
    });
    expect(prisma.notificationIssueReceipt.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'u' },
    });
    expect(prisma.notificationDelivery.createMany).not.toHaveBeenCalled();
  });

  it('rechecks login after acquiring the account lock', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'u', last_login: now });
    await service.maintain(now);
    expect(prisma.notificationDelivery.createMany).not.toHaveBeenCalled();
    expect(prisma.notificationTrigger.deleteMany).not.toHaveBeenCalled();
  });

  it('selects only the current reminder stage after downtime', () => {
    const expiry = new Date(now.getTime() + 2 * 86_400_000);
    expect(notificationRetentionStage(expiry, now)).toBe(3);
    expect(notificationRetentionStage(now, now)).toBeNull();
    expect(
      notificationRetentionStage(new Date(now.getTime() + 8 * 86_400_000), now),
    ).toBeNull();
  });
});
