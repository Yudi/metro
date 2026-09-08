import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { notificationRetentionExpiry, notificationRetentionStage } from './notification-retention';

@Injectable()
export class NotificationRetentionService {
  constructor(private readonly prisma: PrismaService) {}

  async maintain(now = new Date()): Promise<void> {
    let cursor: string | undefined;
    const approaching = new Date(now.getTime() + 7 * 86_400_000);
    approaching.setUTCFullYear(approaching.getUTCFullYear() - 2);
    for (;;) {
      const users = await this.prisma.user.findMany({
        where: { last_login: { lte: approaching }, OR: [
          { notificationTriggers: { some: {} } },
          { push_subscriptions: { some: {} } },
        ] },
        orderBy: { id: 'asc' }, take: 100,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        select: { id: true },
      });
      if (!users.length) return;
      for (const { id } of users) {
        await this.prisma.$transaction(async tx => {
          // Authentication updates the same row, so login and expiry serialize.
          await tx.$queryRaw`SELECT "id" FROM "public"."User" WHERE "id" = ${id} FOR UPDATE`;
          const user = await tx.user.findUnique({ where: { id } });
          if (!user) return;
          const expiry = notificationRetentionExpiry(user.last_login);
          if (expiry <= now) {
            await tx.notificationTrigger.deleteMany({ where: { userId: id } });
            await tx.pushSubscription.deleteMany({ where: { user_id: id } });
            await tx.notificationIssueReceipt.deleteMany({ where: { userId: id } });
            return;
          }
          const stage = notificationRetentionStage(expiry, now);
          if (stage === null) return;
          const subscriptions = await tx.pushSubscription.findMany({ where: { user_id: id }, select: { id: true } });
          const retentionKey = `${expiry.toISOString()}:${stage}`;
          // Expire each reminder when the next reminder stage begins.
          const nextStage = stage === 7 ? 3 : stage === 3 ? 1 : 0;
          const expiresAt = new Date(expiry.getTime() - nextStage * 86_400_000);
          await tx.notificationDelivery.createMany({
            data: subscriptions.map(subscription => ({
              subscriptionId: subscription.id, retentionKey, retentionExpiresAt: expiry,
              fingerprint: retentionKey, expiresAt,
              payload: { notification: {
                title: 'Seus avisos vão expirar',
                body: `Seus avisos e dispositivos serão excluídos em até ${stage} ${stage === 1 ? 'dia' : 'dias'} por inatividade. Entre na sua conta para mantê-los.`,
                tag: 'metro-notification-retention', renotify: false,
                data: { expiresAt: expiresAt.getTime(), onActionClick: {
                  default: { operation: 'navigateLastFocusedOrOpen', url: 'notifications' },
                } },
              } },
            })), skipDuplicates: true,
          });
        });
      }
      cursor = users[users.length - 1].id;
    }
  }
}
