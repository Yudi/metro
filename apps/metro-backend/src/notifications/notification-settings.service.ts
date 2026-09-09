import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  TARGET_KIND_FOR_NOTIFICATION,
  NotificationConfiguration,
  NotificationDevice,
  NotificationTarget,
  NotificationTargetKind,
  NotificationTrigger,
  NotificationTriggerInput,
  validateNotificationTrigger,
} from '@metro/shared/notification-contracts';
import { NotificationTargetsService } from './notification-targets.service';
import { NotificationRealtimeService } from './notification-realtime.service';

export const MAX_NOTIFICATION_TRIGGERS_PER_USER = 500;
export const MAX_NOTIFICATION_SEARCH_LENGTH = 100;
export const MAX_NOTIFICATION_DEVICES_PER_USER = 20;
export const MAX_PUSH_ENDPOINT_LENGTH = 2048;
export const MAX_PUSH_LABEL_LENGTH = 120;

const DEFAULT_DEVICE_LABEL = 'Dispositivo';
const BASE64_URL_PATTERN = /^[A-Za-z0-9_-]+$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PUSH_SERVICE_HOSTS = new Set([
  'fcm.googleapis.com',
  'web.push.apple.com',
  'updates.push.services.mozilla.com',
  'push.services.mozilla.com',
  'notify.windows.com',
  'wns.windows.com',
]);

type TransactionClient = Prisma.TransactionClient;
type DatabaseClient = PrismaService | TransactionClient;

interface PushRegistration {
  endpoint: string;
  p256dh: string;
  auth: string;
  label: string;
}

interface TargetRecord {
  id: string;
  kind: string;
  label: string;
  available: boolean;
  descriptor?: unknown;
}

interface TriggerTargetRecord {
  target: TargetRecord;
}

interface TriggerRecord {
  id: string;
  revision: number;
  config: unknown;
  targets?: TriggerTargetRecord[];
}

interface DeviceRecord {
  id: string;
  label: string | null;
  created_at: Date;
}

/**
 * Account-scoped persistence for the notification settings surface.
 *
 * The JSON scalar is deliberately reduced to the shared trigger contract
 * before it reaches Prisma. Target descriptors and push credentials never
 * leave this service; clients receive only the safe public projection.
 */
@Injectable()
export class NotificationSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly notificationTargets: NotificationTargetsService,
    @Optional() private readonly realtime?: NotificationRealtimeService,
  ) {}

  async getConfiguration(userId: string): Promise<NotificationConfiguration> {
    await this.ensureUser(this.prisma, userId);

    // A mutation allocates the account version only after its database
    // transaction commits. Read the version on both sides of the database
    // snapshot so an in-flight delta cannot be mislabeled as part of an older
    // or newer HTTP response.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const revisionBefore = await this.currentRevision(userId);
      const [triggerRows, deviceRows] = await Promise.all([
        this.prisma.notificationTrigger.findMany({
          where: { userId },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          include: {
            targets: {
              include: { target: true },
            },
          },
        }),
        this.prisma.pushSubscription.findMany({
          where: { user_id: userId },
          orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
          select: { id: true, label: true, created_at: true },
        }),
      ]);
      const revisionAfter = await this.currentRevision(userId);
      const vapid = this.getVapidConfiguration();
      if (revisionBefore !== revisionAfter) {
        if (attempt < 2) {
          continue;
        }

        // Do not label a potentially mixed database read with the newer
        // version. The client will keep its current state for this stale
        // snapshot and the socket resync path will retry it.
        return {
          revision: revisionBefore,
          available: vapid.available,
          publicKey: vapid.available ? vapid.publicKey : null,
          triggers: triggerRows.map((row) => this.toNotificationTrigger(row)),
          devices: deviceRows.map((row) => this.toNotificationDevice(row)),
        };
      }

      return {
        revision: revisionAfter,
        available: vapid.available,
        publicKey: vapid.available ? vapid.publicKey : null,
        triggers: triggerRows.map((row) => this.toNotificationTrigger(row)),
        devices: deviceRows.map((row) => this.toNotificationDevice(row)),
      };
    }

    throw new Error('Não foi possível carregar as configurações de notificações.');
  }

  async getTargets(
    kind: string,
    search: string,
  ): Promise<NotificationTarget[]> {
    const normalizedKind = parseTargetKind(kind);
    if (!normalizedKind) {
      throw new BadRequestException('Tipo de destino inválido.');
    }
    if (typeof search !== 'string' || search.length > MAX_NOTIFICATION_SEARCH_LENGTH) {
      throw new BadRequestException('A busca deve ter até 100 caracteres.');
    }

    const targets = await this.notificationTargets.search(
      normalizedKind,
      search,
    );
    return targets
      .filter((target) => target.kind === normalizedKind)
      .map((target) => this.toPublicTarget(target))
      .filter((target): target is NotificationTarget => target !== null);
  }

  async saveTrigger(
    userId: string,
    value: unknown,
    id?: string | null,
    expectedRevision?: number | null,
  ): Promise<NotificationTrigger> {
    const normalized = parseTriggerInput(value);
    const triggerId = normalizeOptionalId(id);
    const revision = normalizeOptionalRevision(expectedRevision);

    if (!triggerId && revision !== undefined) {
      throw new BadRequestException(
        'A revisão só se aplica à edição de um aviso existente.',
      );
    }
    if (triggerId && revision === undefined) {
      throw new BadRequestException(
        'Informe a revisão do aviso antes de salvar a edição.',
      );
    }

    const saved = await this.withTransactionRetry(() =>
      this.prisma.$transaction(
        async (tx) => {
          await this.ensureAndLockUser(tx, userId);
          const targets = await this.findAvailableTargets(tx, normalized);
          const config = {
            ...normalized,
            targetIds: targets.map((target) => target.id),
          } satisfies NotificationTriggerInput;

          if (!triggerId) {
            const count = await tx.notificationTrigger.count({
              where: { userId },
            });
            if (count >= MAX_NOTIFICATION_TRIGGERS_PER_USER) {
              throw new BadRequestException(
                `Sua conta pode ter até ${MAX_NOTIFICATION_TRIGGERS_PER_USER} avisos.`,
              );
            }

            const created = await tx.notificationTrigger.create({
              data: {
                userId,
                config: toPrismaJson(config),
                enabled: config.enabled,
                targets: {
                  create: targets.map((target) => ({
                    target: { connect: { id: target.id } },
                  })),
                },
              },
              include: {
                targets: { include: { target: true } },
              },
            });
            return this.toNotificationTrigger(created);
          }

          const existing = await tx.notificationTrigger.findFirst({
            where: { id: triggerId, userId },
            select: { revision: true },
          });
          if (!existing) {
            throw new NotFoundException('Aviso não encontrado nesta conta.');
          }
          if (revision !== undefined && existing.revision !== revision) {
            throw this.revisionConflict(existing.revision);
          }

          const changed = await tx.notificationTrigger.updateMany({
            where: {
              id: triggerId,
              userId,
              ...(revision === undefined ? {} : { revision }),
            },
            data: {
              config: toPrismaJson(config),
              enabled: config.enabled,
              revision: { increment: 1 },
              nextEvaluationAt: new Date(),
              claimToken: null,
              claimUntil: null,
            },
          });
          if (changed.count === 0) {
            throw this.revisionConflict(existing.revision);
          }

          await tx.notificationTriggerTarget.deleteMany({
            where: { triggerId },
          });
          await tx.notificationTriggerTarget.createMany({
            data: targets.map((target) => ({
              triggerId,
              targetId: target.id,
            })),
          });

          const updated = await tx.notificationTrigger.findFirst({
            where: { id: triggerId, userId },
            include: {
              targets: { include: { target: true } },
            },
          });
          if (!updated) {
            throw new NotFoundException('Aviso não encontrado nesta conta.');
          }
          return this.toNotificationTrigger(updated);
        },
        { isolationLevel: 'Serializable' },
      ),
    );
    await this.publishTriggerUpsert(userId, saved);
    return saved;
  }

  async deleteTrigger(
    userId: string,
    id: string,
    expectedRevision: number,
  ): Promise<boolean> {
    const triggerId = normalizeRequiredId(id, 'Identificador do aviso');
    const revision = normalizeRequiredRevision(expectedRevision);

    const deleted = await this.withTransactionRetry(() =>
      this.prisma.$transaction(
        async (tx) => {
          await this.ensureAndLockUser(tx, userId);
          const existing = await tx.notificationTrigger.findFirst({
            where: { id: triggerId, userId },
            select: { revision: true },
          });
          if (!existing) {
            throw new NotFoundException('Aviso não encontrado nesta conta.');
          }
          if (existing.revision !== revision) {
            throw this.revisionConflict(existing.revision);
          }

          const deleted = await tx.notificationTrigger.deleteMany({
            where: { id: triggerId, userId, revision },
          });
          if (deleted.count === 0) {
            throw this.revisionConflict(existing.revision);
          }
          return true;
        },
        { isolationLevel: 'Serializable' },
      ),
    );
    if (deleted) {
      await this.publishTriggerRemove(userId, triggerId, revision);
    }
    return deleted;
  }

  async registerDevice(userId: string, value: unknown): Promise<string> {
    const input = parsePushRegistration(value);
    const id = await this.withTransactionRetry(() =>
      this.prisma.$transaction(
        async (tx) => {
          await this.ensureAndLockUser(tx, userId);
          const existing = await tx.pushSubscription.findUnique({
            where: { endpoint: input.endpoint },
            select: { id: true, user_id: true },
          });

          if (existing?.user_id && existing.user_id !== userId) {
            throw new ConflictException(
              'Este navegador já está vinculado a outra conta.',
            );
          }

          if (existing) {
            if (!existing.user_id) {
              const deviceCount = await tx.pushSubscription.count({
                where: { user_id: userId },
              });
              if (deviceCount >= MAX_NOTIFICATION_DEVICES_PER_USER) {
                throw new BadRequestException(
                  `Sua conta pode ter até ${MAX_NOTIFICATION_DEVICES_PER_USER} dispositivos.`,
                );
              }
            }
            const updated = await tx.pushSubscription.update({
              where: { id: existing.id },
              data: {
                user_id: userId,
                p256dh: input.p256dh,
                auth: input.auth,
                label: input.label,
                last_seen_at: new Date(),
              },
              select: { id: true },
            });
            return updated.id;
          }

          const deviceCount = await tx.pushSubscription.count({
            where: { user_id: userId },
          });
          if (deviceCount >= MAX_NOTIFICATION_DEVICES_PER_USER) {
            throw new BadRequestException(
              `Sua conta pode ter até ${MAX_NOTIFICATION_DEVICES_PER_USER} dispositivos.`,
            );
          }

          const created = await tx.pushSubscription.create({
            data: {
              user_id: userId,
              endpoint: input.endpoint,
              p256dh: input.p256dh,
              auth: input.auth,
              label: input.label,
              last_seen_at: new Date(),
            },
            select: { id: true },
          });
          return created.id;
        },
        { isolationLevel: 'Serializable' },
      ),
    );
    if (this.realtime) {
      const device = await this.getDeviceProjection(userId, id);
      if (device) {
        await this.publishDeviceUpsert(userId, device);
      }
    }
    return id;
  }

  async removeDevice(userId: string, id: string): Promise<boolean> {
    const deviceId = normalizeRequiredId(id, 'Identificador do dispositivo');
    const deleted = await this.prisma.pushSubscription.deleteMany({
      where: { id: deviceId, user_id: userId },
    });
    const removed = deleted.count > 0;
    if (removed) {
      await this.publishDeviceRemoved(userId, deviceId);
    }
    return removed;
  }

  private async currentRevision(userId: string): Promise<number> {
    return this.realtime?.getCurrentRevision(userId) ?? 0;
  }

  private async publishTriggerUpsert(
    userId: string,
    trigger: NotificationTrigger,
  ): Promise<void> {
    if (!this.realtime) {
      return;
    }
    try {
      await this.realtime.publishTriggerUpsert(userId, trigger);
    } catch {
      // The committed mutation remains authoritative if realtime delivery is
      // temporarily unavailable; a reconnect requests a fresh snapshot.
    }
  }

  private async publishTriggerRemove(
    userId: string,
    triggerId: string,
    triggerRevision: number,
  ): Promise<void> {
    if (!this.realtime) {
      return;
    }
    try {
      await this.realtime.publishTriggerRemove(
        userId,
        triggerId,
        triggerRevision,
      );
    } catch {
      // See publishTriggerUpsert: database success must not depend on socket
      // transport availability.
    }
  }

  private async publishDeviceUpsert(
    userId: string,
    device: NotificationDevice,
  ): Promise<void> {
    if (!this.realtime) {
      return;
    }
    try {
      await this.realtime.publishDeviceUpsert(userId, device);
    } catch {
      // Reconnect/resync recovers a missed device event.
    }
  }

  private async publishDeviceRemoved(
    userId: string,
    deviceId: string,
  ): Promise<void> {
    if (!this.realtime) {
      return;
    }
    try {
      await this.realtime.publishDeviceRemoved(userId, deviceId);
    } catch {
      // Reconnect/resync recovers a missed device event.
    }
  }

  private async getDeviceProjection(
    userId: string,
    deviceId: string,
  ): Promise<NotificationDevice | null> {
    try {
      const rows = await this.prisma.pushSubscription.findMany({
        where: { id: deviceId, user_id: userId },
        orderBy: { id: 'asc' },
        take: 1,
        select: { id: true, label: true, created_at: true },
      });
      const row = rows[0] as DeviceRecord | undefined;
      return row ? this.toNotificationDevice(row) : null;
    } catch {
      return null;
    }
  }

  private async findAvailableTargets(
    tx: TransactionClient,
    input: NotificationTriggerInput,
  ): Promise<TargetRecord[]> {
    const expectedKind = TARGET_KIND_FOR_NOTIFICATION[input.kind];
    if (input.targetIds.some((targetId) => !UUID_PATTERN.test(targetId))) {
      throw new BadRequestException(
        'Selecione destinos válidos na busca de linhas, estações ou pontos.',
      );
    }
    const records = await tx.notificationTarget.findMany({
      where: {
        id: { in: input.targetIds },
        kind: expectedKind,
      },
      select: { id: true, kind: true, label: true, available: true, descriptor: true },
    });

    const byRequestedId = new Map<string, TargetRecord>();
    for (const record of records) {
      byRequestedId.set(record.id, record);
    }

    const resolved = input.targetIds.map((targetId) =>
      byRequestedId.get(targetId),
    );
    if (resolved.some((target) => !target)) {
      throw new BadRequestException(
        'Um ou mais destinos estão indisponíveis ou são inválidos.',
      );
    }
    if (input.enabled && resolved.some((target) => !target?.available)) {
      throw new BadRequestException(
        'Um ou mais destinos estão indisponíveis.',
      );
    }

    const unique = new Map<string, TargetRecord>();
    for (const target of resolved) {
      if (target) {
        unique.set(target.id, target);
      }
    }
    if (unique.size !== input.targetIds.length) {
      throw new BadRequestException(
        'Selecione destinos diferentes e compatíveis com o tipo de aviso.',
      );
    }
    return input.targetIds.map((targetId) => byRequestedId.get(targetId) as TargetRecord);
  }

  private async ensureUser(
    client: DatabaseClient,
    userId: string,
  ): Promise<void> {
    await client.user.upsert({
      where: { id: userId },
      update: {},
      create: { id: userId },
    });
  }

  private async ensureAndLockUser(
    client: TransactionClient,
    userId: string,
  ): Promise<void> {
    await this.ensureUser(client, userId);
    // Every trigger mutation locks the account row before counting or
    // replacing rows. This serializes concurrent creates without relying on
    // an application process-local mutex.
    await client.$queryRaw`
      SELECT "id"
      FROM "public"."User"
      WHERE "id" = ${userId}
      FOR UPDATE
    `;
  }

  private getVapidConfiguration(): {
    available: boolean;
    publicKey: string | null;
  } {
    const publicKey = this.getConfigValue('VAPID_PUBLIC_KEY');
    const privateKey = this.getConfigValue('VAPID_PRIVATE_KEY');
    const subject = this.getConfigValue('VAPID_SUBJECT');
    const available = Boolean(publicKey && privateKey && subject);
    return {
      available,
      publicKey: publicKey ?? null,
    };
  }

  private getConfigValue(name: string): string | undefined {
    const configured = this.config.get<string | undefined>(name);
    if (typeof configured === 'string' && configured.trim()) {
      return configured.trim();
    }
    const environmentValue = process.env[name];
    return typeof environmentValue === 'string' && environmentValue.trim()
      ? environmentValue.trim()
      : undefined;
  }

  private toNotificationTrigger(record: TriggerRecord): NotificationTrigger {
    const config = parseTriggerInput(record.config);
    const targets = (record.targets ?? [])
      .map(({ target }) => this.toPublicTarget(target))
      .filter((target): target is NotificationTarget => target !== null);
    const targetById = new Map(targets.map((target) => [target.id, target]));
    const orderedTargets = config.targetIds
      .map((targetId) => targetById.get(targetId))
      .filter((target): target is NotificationTarget => target !== undefined);

    return {
      ...config,
      id: record.id,
      revision: record.revision,
      targets: orderedTargets,
    };
  }

  private toPublicTarget(
    target: NotificationTarget | TargetRecord,
  ): NotificationTarget | null {
    const kind = parseTargetKind(target.kind);
    if (!kind) {
      return null;
    }
    return {
      id: target.id,
      kind,
      label: target.label,
      available: target.available,
      ...this.busRoutePresentation(target),
      ...this.railLinePresentation(target),
    };
  }

  private busRoutePresentation(
    target: NotificationTarget | TargetRecord,
  ): Pick<
    NotificationTarget,
    'busRouteShortName' | 'busRouteColor' | 'busRouteTextColor'
  > {
    if (target.kind !== 'bus_route') {
      return {};
    }

    const candidate = target as TargetRecord & {
      busRouteShortName?: unknown;
      busRouteColor?: unknown;
      busRouteTextColor?: unknown;
    };
    const descriptor = readObject(candidate.descriptor);
    const descriptorPresentation = readObject(descriptor?.['presentation']);
    const shortName =
      readNonEmptyString(candidate.busRouteShortName) ??
      readNonEmptyString(descriptorPresentation?.['busRouteShortName']) ??
      target.label.split('·', 1)[0]?.trim();
    const color =
      publicHexColor(candidate.busRouteColor) ??
      publicHexColor(descriptorPresentation?.['busRouteColor']);
    const textColor =
      publicHexColor(candidate.busRouteTextColor) ??
      publicHexColor(descriptorPresentation?.['busRouteTextColor']);

    return {
      ...(shortName ? { busRouteShortName: shortName } : {}),
      ...(color ? { busRouteColor: color } : {}),
      ...(textColor ? { busRouteTextColor: textColor } : {}),
    };
  }

  private railLinePresentation(
    target: NotificationTarget | TargetRecord,
  ): Pick<NotificationTarget, 'railLineCode'> {
    if (target.kind !== 'rail_line' && target.kind !== 'rail_station') {
      return {};
    }
    if ('railLineCode' in target && typeof target.railLineCode === 'number') {
      return { railLineCode: target.railLineCode };
    }
    if (!('descriptor' in target) || !target.descriptor || typeof target.descriptor !== 'object') {
      return {};
    }

    const lineCode = (target.descriptor as { lineCode?: unknown }).lineCode;
    if (typeof lineCode !== 'string' || !/^L\d{1,2}$/u.test(lineCode)) {
      return {};
    }
    return { railLineCode: Number(lineCode.slice(1)) };
  }

  private toNotificationDevice(record: DeviceRecord): NotificationDevice {
    return {
      id: record.id,
      label: record.label?.trim() || DEFAULT_DEVICE_LABEL,
      createdAt: record.created_at.toISOString(),
    };
  }

  private revisionConflict(currentRevision: number): ConflictException {
    return new ConflictException(
      `Este aviso foi alterado em outro dispositivo. Recarregue a revisão ${currentRevision} antes de editar.`,
    );
  }

  private async withTransactionRetry<T>(
    operation: () => Promise<T>,
  ): Promise<T> {
    const maximumAttempts = 3;
    for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        if (!isRetryableTransactionError(error) || attempt === maximumAttempts) {
          throw error;
        }
        await new Promise((resolve) =>
          setTimeout(resolve, 10 * 2 ** (attempt - 1)),
        );
      }
    }
    throw new Error('Não foi possível salvar agora. Tente novamente.');
  }
}

function parseTriggerInput(value: unknown): NotificationTriggerInput {
  const validationError = validateNotificationTrigger(value);
  if (validationError) {
    throw new BadRequestException(validationError);
  }
  const input = value as NotificationTriggerInput;
  return {
    name: input.name.trim(),
    enabled: input.enabled,
    days: [...input.days],
    windows: input.windows.map((window) => ({
      start: window.start,
      end: window.end,
    })),
    timezone: input.timezone,
    smart: (input.kind === 'rail_status' || input.kind === 'bus_notices') && input.smart,
    leadMinutes: input.leadMinutes,
    intervalMinutes: input.intervalMinutes,
    arrivalLeadMinutes: input.arrivalLeadMinutes ?? 5,
    kind: input.kind,
    targetIds: [...input.targetIds],
    statusMode: input.statusMode,
  };
}

function parseTargetKind(value: string): NotificationTargetKind | null {
  if (
    value === 'rail_line' ||
    value === 'rail_station' ||
    value === 'bus_route' ||
    value === 'bus_stop' ||
    value === 'special_line'
  ) {
    return value;
  }
  return null;
}

function parsePushRegistration(value: unknown): PushRegistration {
  if (!isRecord(value)) {
    throw new BadRequestException('Configuração do dispositivo inválida.');
  }
  const endpoint = parsePushEndpoint(value.endpoint);
  const keys = value.keys;
  if (!isRecord(keys)) {
    throw new BadRequestException('A assinatura do navegador está incompleta. Ative novamente as notificações.');
  }
  const p256dh = parsePushKey(keys.p256dh, 65, 'p256dh');
  const auth = parsePushKey(keys.auth, 16, 'auth');
  let label = DEFAULT_DEVICE_LABEL;
  if (value.label !== undefined) {
    if (typeof value.label !== 'string' || value.label.length > MAX_PUSH_LABEL_LENGTH) {
      throw new BadRequestException(
        `O nome do dispositivo deve ter até ${MAX_PUSH_LABEL_LENGTH} caracteres.`,
      );
    }
    label = value.label.trim() || DEFAULT_DEVICE_LABEL;
  }
  return { endpoint, p256dh, auth, label };
}

export function parsePushEndpoint(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !value ||
    value.length > MAX_PUSH_ENDPOINT_LENGTH ||
    value.trim() !== value
  ) {
    throw new BadRequestException('A assinatura do navegador é inválida.');
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new BadRequestException('A assinatura do navegador é inválida.');
  }
  const hostname = url.hostname.toLowerCase();
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.hash ||
    (url.port !== '' && url.port !== '443') ||
    (!PUSH_SERVICE_HOSTS.has(hostname) &&
      !hostname.endsWith('.notify.windows.com'))
  ) {
    throw new BadRequestException('O navegador deve usar um serviço de notificações HTTPS reconhecido.');
  }
  return url.href;
}

function parsePushKey(
  value: unknown,
  expectedBytes: number,
  name: string,
): string {
  if (
    typeof value !== 'string' ||
    value.length > 256 ||
    !BASE64_URL_PATTERN.test(value) ||
    value.length % 4 === 1
  ) {
    throw new BadRequestException(`A chave ${name} da assinatura do navegador é inválida.`);
  }
  const decoded = Buffer.from(value, 'base64url');
  if (decoded.length !== expectedBytes) {
    throw new BadRequestException(
      `A chave ${name} da assinatura do navegador tem tamanho inválido.`,
    );
  }
  return value;
}

function normalizeOptionalId(id: string | null | undefined): string | undefined {
  if (id === null || id === undefined) {
    return undefined;
  }
  return normalizeRequiredId(id, 'Identificador do aviso');
}

function normalizeRequiredId(id: string, field: string): string {
  if (
    typeof id !== 'string' ||
    !id.trim() ||
    id.length > 80 ||
    !UUID_PATTERN.test(id.trim())
  ) {
    throw new BadRequestException(`${field} inválido.`);
  }
  return id.trim();
}

function normalizeOptionalRevision(
  revision: number | null | undefined,
): number | undefined {
  if (revision === null || revision === undefined) {
    return undefined;
  }
  return normalizeRequiredRevision(revision);
}

function normalizeRequiredRevision(revision: number): number {
  if (!Number.isInteger(revision) || revision < 0) {
    throw new BadRequestException(
      'A revisão do aviso deve ser um número inteiro não negativo.',
    );
  }
  return revision;
}

function toPrismaJson(value: NotificationTriggerInput): Prisma.InputJsonValue {
  return value as unknown as Prisma.InputJsonValue;
}

function readObject(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

function readNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const result = value.trim();
  return result || undefined;
}

function publicHexColor(value: unknown): string | undefined {
  const normalized = readNonEmptyString(value)?.replace(/^#/u, '');
  return normalized && /^[0-9a-f]{6}$/iu.test(normalized)
    ? `#${normalized}`
    : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isRetryableTransactionError(error: unknown): boolean {
  return (
    isRecord(error) &&
    (error.code === 'P2034' || error.code === 'P2002')
  );
}
