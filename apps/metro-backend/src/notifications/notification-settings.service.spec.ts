import { ConfigService } from '@nestjs/config';
import { ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  NotificationTriggerInput,
  NotificationTarget,
} from '@metro/shared/notification-contracts';
import {
  MAX_NOTIFICATION_DEVICES_PER_USER,
  MAX_NOTIFICATION_TRIGGERS_PER_USER,
  NotificationSettingsService,
  parsePushEndpoint,
} from './notification-settings.service';
import { NotificationTargetsService } from './notification-targets.service';

const targetId = '018f3a37-9c5e-7a8b-8c2d-000000000001';
const triggerId = '018f3a37-9c5e-7a8b-8c2d-000000000002';
const deviceId = '018f3a37-9c5e-7a8b-8c2d-000000000003';
const validP256dh = Buffer.alloc(65, 1).toString('base64url');
const validAuth = Buffer.alloc(16, 2).toString('base64url');

const triggerInput: NotificationTriggerInput = {
  name: 'Linha 1',
  enabled: true,
  days: [1, 2, 3, 4, 5],
  windows: [{ start: '08:00', end: '09:00' }],
  timezone: 'America/Sao_Paulo',
  smart: true,
  leadMinutes: 10,
  intervalMinutes: 15,
  kind: 'rail_status',
  targetIds: [targetId],
  statusMode: 'abnormal',
};

interface MockPrisma {
  $transaction: jest.Mock;
  $queryRaw: jest.Mock;
  user: { upsert: jest.Mock };
  notificationTarget: { findMany: jest.Mock };
  notificationTrigger: {
    count: jest.Mock;
    create: jest.Mock;
    findFirst: jest.Mock;
    findMany: jest.Mock;
    updateMany: jest.Mock;
    deleteMany: jest.Mock;
  };
  notificationTriggerTarget: {
    deleteMany: jest.Mock;
    createMany: jest.Mock;
  };
  pushSubscription: {
    findMany: jest.Mock;
    findUnique: jest.Mock;
    count: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    deleteMany: jest.Mock;
  };
}

describe('NotificationSettingsService', () => {
  let service: NotificationSettingsService;
  let prisma: MockPrisma;
  let targets: { search: jest.Mock };

  beforeEach(() => {
    prisma = {
      $transaction: jest.fn(),
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'user-id' }]),
      user: { upsert: jest.fn().mockResolvedValue({ id: 'user-id' }) },
      notificationTarget: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: targetId,
            kind: 'rail_line',
            label: 'Linha 1-Azul',
            available: true,
          },
        ]),
      },
      notificationTrigger: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      notificationTriggerTarget: {
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      pushSubscription: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({ id: deviceId }),
        update: jest.fn().mockResolvedValue({ id: deviceId }),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    prisma.$transaction.mockImplementation(
      async (callback: (transaction: MockPrisma) => unknown) =>
        callback(prisma),
    );
    targets = { search: jest.fn().mockResolvedValue([]) };
    service = new NotificationSettingsService(
      prisma as unknown as PrismaService,
      new ConfigService({
        VAPID_PUBLIC_KEY: validP256dh,
        VAPID_PRIVATE_KEY: 'b'.repeat(43),
        VAPID_SUBJECT: 'mailto:operations@example.com',
      }),
      targets as unknown as NotificationTargetsService,
    );
  });

  it('rejects invalid shared trigger input before opening a transaction', async () => {
    await expect(
      service.saveTrigger('user-id', { ...triggerInput, windows: [] }),
    ).rejects.toMatchObject({ status: 400 });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects a target that is missing, unavailable, or of another type', async () => {
    prisma.notificationTarget.findMany.mockResolvedValueOnce([]);

    await expect(service.saveTrigger('user-id', triggerInput)).rejects.toThrow(
      'indisponíveis ou são inválidos',
    );
    expect(prisma.notificationTarget.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ kind: 'rail_line' }),
      }),
    );
  });

  it('allows a disabled trigger to retain an unavailable target', async () => {
    const paused = { ...triggerInput, enabled: false };
    prisma.notificationTarget.findMany.mockResolvedValueOnce([
      {
        id: targetId,
        kind: 'rail_line',
        label: 'Linha 1-Azul',
        available: false,
      },
    ]);
    prisma.notificationTrigger.create.mockResolvedValueOnce({
      id: triggerId,
      revision: 0,
      config: paused,
      targets: [
        {
          target: {
            id: targetId,
            kind: 'rail_line',
            label: 'Linha 1-Azul',
            available: false,
          },
        },
      ],
    });

    await expect(service.saveTrigger('user-id', paused)).resolves.toMatchObject(
      {
        id: triggerId,
        targets: [{ id: targetId, available: false }],
      },
    );
  });

  it('allows the 500th trigger', async () => {
    prisma.notificationTrigger.count.mockResolvedValueOnce(499);
    prisma.notificationTrigger.create.mockResolvedValueOnce({
      id: triggerId,
      revision: 0,
      config: triggerInput,
      targets: [],
    });
    await expect(
      service.saveTrigger('user-id', triggerInput),
    ).resolves.toMatchObject({ id: triggerId });
  });

  it('enforces the trigger cap after locking the account row', async () => {
    prisma.notificationTrigger.count.mockResolvedValueOnce(500);

    await expect(service.saveTrigger('user-id', triggerInput)).rejects.toThrow(
      `até ${MAX_NOTIFICATION_TRIGGERS_PER_USER}`,
    );
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(prisma.notificationTrigger.create).not.toHaveBeenCalled();
  });

  it('requires the current revision and increments it on update', async () => {
    prisma.notificationTrigger.findFirst
      .mockResolvedValueOnce({ revision: 4 })
      .mockResolvedValueOnce({
        id: triggerId,
        revision: 5,
        config: triggerInput,
        targets: [
          {
            target: {
              id: targetId,
              kind: 'rail_line',
              label: 'Linha 1-Azul',
              available: true,
            },
          },
        ],
      });

    await expect(
      service.saveTrigger('user-id', triggerInput, triggerId, 4),
    ).resolves.toMatchObject({ id: triggerId, revision: 5 });
    expect(prisma.notificationTrigger.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: triggerId, userId: 'user-id', revision: 4 },
        data: expect.objectContaining({ revision: { increment: 1 } }),
      }),
    );
  });

  it('returns an actionable conflict for a stale revision', async () => {
    prisma.notificationTrigger.findFirst.mockResolvedValueOnce({ revision: 4 });

    await expect(
      service.saveTrigger('user-id', triggerInput, triggerId, 3),
    ).rejects.toMatchObject({
      status: 409,
      message: expect.stringContaining('revisão 4'),
    });
    expect(prisma.notificationTrigger.updateMany).not.toHaveBeenCalled();
  });

  it('does not permit an update without expectedRevision', async () => {
    await expect(
      service.saveTrigger('user-id', triggerInput, triggerId),
    ).rejects.toThrow('Informe a revisão');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('does not transfer a push endpoint owned by another account', async () => {
    prisma.pushSubscription.findUnique.mockResolvedValueOnce({
      id: deviceId,
      user_id: 'another-user',
    });

    await expect(
      service.registerDevice('user-id', {
        endpoint: 'https://fcm.googleapis.com/fcm/send/example',
        keys: { p256dh: validP256dh, auth: validAuth },
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.pushSubscription.update).not.toHaveBeenCalled();
    expect(prisma.pushSubscription.create).not.toHaveBeenCalled();
  });

  it('validates push service hosts and standard key lengths before persistence', async () => {
    expect(parsePushEndpoint('https://FCM.GOOGLEAPIS.COM:443/send/token')).toBe(
      'https://fcm.googleapis.com/send/token',
    );
    expect(() =>
      parsePushEndpoint('https://fcm.googleapis.com/send/token#duplicate'),
    ).toThrow();
    expect(() => parsePushEndpoint('http://fcm.googleapis.com/send')).toThrow(
      'serviço de notificações HTTPS reconhecido',
    );
    expect(() => parsePushEndpoint('https://example.com/send')).toThrow(
      'serviço de notificações HTTPS reconhecido',
    );

    await expect(
      service.registerDevice('user-id', {
        endpoint: 'https://fcm.googleapis.com/fcm/send/example',
        keys: { p256dh: validP256dh.slice(1), auth: validAuth },
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('caps newly registered devices and exposes only safe device fields', async () => {
    prisma.pushSubscription.count.mockResolvedValueOnce(
      MAX_NOTIFICATION_DEVICES_PER_USER,
    );
    await expect(
      service.registerDevice('user-id', {
        endpoint: 'https://fcm.googleapis.com/fcm/send/example',
        keys: { p256dh: validP256dh, auth: validAuth },
      }),
    ).rejects.toThrow(`até ${MAX_NOTIFICATION_DEVICES_PER_USER}`);

    prisma.pushSubscription.count.mockResolvedValueOnce(0);
    prisma.notificationTrigger.findMany.mockResolvedValueOnce([
      {
        id: triggerId,
        revision: 0,
        config: triggerInput,
        targets: [
          {
            target: {
              id: targetId,
              kind: 'rail_line',
              label: 'Linha 1-Azul',
              available: true,
              descriptor: { endpoint: 'https://internal.example' },
            },
          },
        ],
      },
    ]);
    prisma.pushSubscription.findMany.mockResolvedValueOnce([
      {
        id: deviceId,
        label: 'Meu celular',
        created_at: new Date('2026-09-08T12:00:00.000Z'),
        endpoint: 'https://fcm.googleapis.com/private',
        p256dh: validP256dh,
        auth: validAuth,
      },
    ]);

    const configuration = await service.getConfiguration('user-id');
    expect(configuration.devices).toEqual([
      {
        id: deviceId,
        label: 'Meu celular',
        createdAt: '2026-09-08T12:00:00.000Z',
      },
    ]);
    expect(JSON.stringify(configuration)).not.toContain('private');
    expect(JSON.stringify(configuration)).not.toContain('internal.example');
  });

  it('filters target search results to the requested public kind', async () => {
    const target: NotificationTarget = {
      id: targetId,
      kind: 'rail_line',
      label: 'Linha 1-Azul',
      available: true,
    };
    targets.search.mockResolvedValueOnce([
      target,
      { ...target, id: deviceId, kind: 'bus_stop' },
    ]);

    await expect(service.getTargets('rail_line', 'linha')).resolves.toEqual([
      target,
    ]);
    expect(targets.search).toHaveBeenCalledWith('rail_line', 'linha');
  });

  it('projects safe bus route presentation fields from target search', async () => {
    targets.search.mockResolvedValueOnce([
      {
        id: targetId,
        kind: 'bus_route',
        label: '702P-10 · Metrô Belém - Vila Industrial',
        available: true,
        busRouteShortName: '702P-10',
        busRouteColor: '0066CC',
        busRouteTextColor: 'FFFFFF',
      },
    ]);

    await expect(service.getTargets('bus_route', '702P')).resolves.toEqual([
      {
        id: targetId,
        kind: 'bus_route',
        label: '702P-10 · Metrô Belém - Vila Industrial',
        available: true,
        busRouteShortName: '702P-10',
        busRouteColor: '#0066CC',
        busRouteTextColor: '#FFFFFF',
      },
    ]);
  });

  it('recovers bus route presentation from a persisted target descriptor', async () => {
    const busInput = {
      ...triggerInput,
      kind: 'bus_notices' as const,
    };
    prisma.notificationTrigger.findMany.mockResolvedValueOnce([
      {
        id: triggerId,
        revision: 0,
        config: { ...busInput, targetIds: [targetId] },
        targets: [
          {
            target: {
              id: targetId,
              kind: 'bus_route',
              label: '702P-10 · Metrô Belém - Vila Industrial',
              available: true,
              descriptor: {
                routeName: '702P-10',
                agency: 'sptrans',
                presentation: {
                  busRouteShortName: '702P-10',
                  busRouteColor: '0066CC',
                  busRouteTextColor: 'FFFFFF',
                },
              },
            },
          },
        ],
      },
    ]);
    prisma.pushSubscription.findMany.mockResolvedValueOnce([]);

    const configuration = await service.getConfiguration('user-id');

    expect(configuration.triggers[0].targets[0]).toMatchObject({
      kind: 'bus_route',
      busRouteShortName: '702P-10',
      busRouteColor: '#0066CC',
      busRouteTextColor: '#FFFFFF',
    });
  });

  it('publishes trigger and device changes only after their mutations resolve', async () => {
    const realtime = {
      getCurrentRevision: jest.fn().mockResolvedValue(0),
      publishTriggerUpsert: jest.fn().mockResolvedValue(1),
      publishTriggerRemove: jest.fn().mockResolvedValue(2),
      publishDeviceUpsert: jest.fn().mockResolvedValue(3),
      publishDeviceRemoved: jest.fn().mockResolvedValue(4),
    };
    const withRealtime = new NotificationSettingsService(
      prisma as unknown as PrismaService,
      new ConfigService({
        VAPID_PUBLIC_KEY: validP256dh,
        VAPID_PRIVATE_KEY: 'b'.repeat(43),
        VAPID_SUBJECT: 'mailto:operations@example.com',
      }),
      targets as unknown as NotificationTargetsService,
      realtime as never,
    );
    prisma.notificationTrigger.create.mockResolvedValueOnce({
      id: triggerId,
      revision: 0,
      config: triggerInput,
      targets: [
        {
          target: {
            id: targetId,
            kind: 'rail_line',
            label: 'Linha 1-Azul',
            available: true,
          },
        },
      ],
    });

    await withRealtime.saveTrigger('user-id', triggerInput);
    expect(realtime.publishTriggerUpsert).toHaveBeenCalledWith(
      'user-id',
      expect.objectContaining({ id: triggerId }),
    );

    prisma.notificationTrigger.findFirst.mockResolvedValueOnce({ revision: 0 });
    await withRealtime.deleteTrigger('user-id', triggerId, 0);
    expect(realtime.publishTriggerRemove).toHaveBeenCalledWith(
      'user-id',
      triggerId,
      0,
    );

    prisma.pushSubscription.deleteMany.mockResolvedValueOnce({ count: 1 });
    await withRealtime.removeDevice('user-id', deviceId);
    expect(realtime.publishDeviceRemoved).toHaveBeenCalledWith(
      'user-id',
      deviceId,
    );
  });
});
