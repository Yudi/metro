import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  PLATFORM_ID,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import {
  AuthService,
  authReady,
  firebaseIdToken,
  firebaseUser,
} from '@metro/shared/firebase';
import {
  NotificationApiError,
  NotificationApiService,
} from '@metro/shared/api';
import type {
  NotificationConfiguration,
  NotificationConfigurationDelta,
  NotificationConfigurationRealtimeEvent,
  NotificationDevice,
  NotificationKind,
  NotificationTrigger,
  NotificationTriggerInput,
} from '@metro/shared/notification-contracts';
import { firstValueFrom, fromEvent, merge, filter, auditTime } from 'rxjs';
import { NotificationPushService } from './notification-push.service';
import {
  NotificationTriggerEditorComponent,
  NotificationTriggerEditorSave,
} from './notification-trigger-editor.component';
import { NotificationTargetIdentityComponent } from './notification-target-identity.component';
import { NotificationWebsocketService } from './notification-websocket.service';

type NotificationPageState =
  | 'authenticating'
  | 'signed-out'
  | 'loading'
  | 'ready'
  | 'error';

type NotificationTriggerInputWithArrival = NotificationTriggerInput & {
  arrivalLeadMinutes?: number;
};

const DAY_LABELS: Record<number, string> = {
  0: 'Dom',
  1: 'Seg',
  2: 'Ter',
  3: 'Qua',
  4: 'Qui',
  5: 'Sex',
  6: 'Sáb',
};

const KIND_LABELS: Record<NotificationKind, string> = {
  rail_status: 'Status do metrô e trem',
  rail_headway: 'Intervalo entre trens',
  rail_arrivals: 'Próximos trens',
  bus_arrivals: 'Chegadas de ônibus',
  bus_notices: 'Avisos de ônibus',
  special_departures: 'Partidas especiais',
};

const REVISION_CONFLICT_MESSAGE =
  'Este aviso foi alterado em outro dispositivo. Descarte a edição para carregar a versão atual.';

const DEVICE_STORAGE_PREFIX = 'metro.notifications.device.';

@Component({
  selector: 'app-notifications',
  imports: [
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSlideToggleModule,
    NotificationTriggerEditorComponent,
    NotificationTargetIdentityComponent,
  ],
  templateUrl: './notifications.component.html',
  styleUrl: './notifications.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotificationsComponent {
  readonly authReady = authReady;
  readonly firebaseUser = firebaseUser;
  readonly pageState = signal<NotificationPageState>('authenticating');
  readonly configuration = signal<NotificationConfiguration | null>(null);
  readonly errorMessage = signal<string | null>(null);
  readonly operationError = signal<string | null>(null);
  readonly pushError = signal<string | null>(null);
  readonly refreshing = signal(false);
  readonly pushBusy = signal(false);
  readonly pendingTriggerId = signal<string | null>(null);
  readonly deletingTriggerId = signal<string | null>(null);
  readonly editingTriggerId = signal<string | null>(null);
  readonly deviceId = signal<string | null>(null);

  readonly triggers = computed(() => this.configuration()?.triggers ?? []);
  readonly devices = computed(() => this.configuration()?.devices ?? []);
  readonly currentDevice = computed(() => {
    const id = this.deviceId();
    return id
      ? (this.devices().find((device) => device.id === id) ?? null)
      : null;
  });
  readonly editingTrigger = computed(() => {
    const id = this.editingTriggerId();
    return id && id !== 'new'
      ? (this.triggers().find((trigger) => trigger.id === id) ?? null)
      : null;
  });
  readonly canEditTriggers = computed(
    () => this.pageState() === 'ready' && this.configuration() !== null,
  );

  private readonly api = inject(NotificationApiService);
  private readonly authService = inject(AuthService);
  private readonly pushService = inject(NotificationPushService);
  private readonly realtime = inject(NotificationWebsocketService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly destroyRef = inject(DestroyRef);
  private sessionUid: string | null = null;
  private sessionToken: string | null = null;
  private sessionGeneration = 0;
  private requestGeneration = 0;
  private configurationSubscription?: { unsubscribe(): void };
  private mutationSubscription?: { unsubscribe(): void };
  private realtimeResyncPending = false;
  private realtimeRevisionWatermark = 0;
  private deviceLabelAttempted = false;
  private readonly triggerTombstones = new Map<string, number>();
  private readonly deviceTombstones = new Set<string>();
  private readonly localTriggerUpserts = new Map<string, number>();
  private readonly localDeviceUpserts = new Set<string>();

  readonly permission = this.pushService.permission;
  readonly pushSupported = this.pushService.supported;

  constructor() {
    effect(() => {
      const ready = authReady();
      const user = firebaseUser();
      const token = firebaseIdToken();

      if (!ready) {
        if (this.sessionUid !== null) {
          this.resetSession();
        }
        this.pageState.set('authenticating');
        return;
      }

      if (!user) {
        this.resetSession();
        this.pageState.set('signed-out');
        return;
      }

      // Firebase clears the token while changing accounts or refreshing it.
      // A same-account refresh keeps the draft in memory while all cloud
      // operations and the old authenticated socket are stopped.
      if (!token) {
        if (user && this.sessionUid === user.uid) {
          // A token refresh keeps the same account. Tear down the old socket
          // and cancel in-flight writes, but retain the draft and cloud state
          // until the replacement token reconnects the account.
          this.realtime.disconnect();
          this.configurationSubscription?.unsubscribe();
          this.mutationSubscription?.unsubscribe();
          this.configurationSubscription = undefined;
          this.mutationSubscription = undefined;
          this.sessionToken = null;
          this.pendingTriggerId.set(null);
          this.deletingTriggerId.set(null);
          this.pushBusy.set(false);
          this.refreshing.set(false);
        } else {
          this.resetSession();
        }
        this.pageState.set('authenticating');
        return;
      }

      if (this.sessionUid === user.uid && this.sessionToken === token) {
        return;
      }

      if (this.sessionUid === user.uid) {
        this.sessionToken = token;
        this.realtime.connect(user.uid, token);
        if (this.configuration()) {
          this.pageState.set('ready');
        }
        return;
      }

      this.startSession(user.uid, token);
    });

    if (isPlatformBrowser(this.platformId)) {
      merge(
        fromEvent(window, 'focus'),
        fromEvent(document, 'visibilitychange').pipe(
          filter(() => document.visibilityState === 'visible'),
        ),
      )
        .pipe(auditTime(400), takeUntilDestroyed(this.destroyRef))
        .subscribe(() => this.pushService.refreshPermission());
    }

    this.realtime.events$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((event) => this.handleRealtimeEvent(event));
    this.destroyRef.onDestroy(() => this.realtime.disconnect());
  }

  login(): void {
    this.authService.loginGoogle();
  }

  refreshConfiguration(): void {
    const uid = this.sessionUid;
    if (
      !uid ||
      firebaseUser()?.uid !== uid ||
      !firebaseIdToken() ||
      this.pageState() === 'authenticating' ||
      this.pageState() === 'signed-out'
    ) {
      return;
    }

    this.loadConfiguration(uid, false);
  }

  startNewTrigger(): void {
    if (!this.canEditTriggers()) {
      return;
    }

    this.operationError.set(null);
    this.editingTriggerId.set('new');
  }

  editTrigger(trigger: NotificationTrigger): void {
    if (!this.canEditTriggers()) {
      return;
    }

    this.operationError.set(null);
    this.editingTriggerId.set(trigger.id);
  }

  cancelEditing(): void {
    this.editingTriggerId.set(null);
    this.operationError.set(null);
  }

  reloadAfterOperationError(): void {
    this.cancelEditing();
    this.refreshConfiguration();
  }

  saveTrigger(event: NotificationTriggerEditorSave): void {
    const uid = this.sessionUid;
    const generation = this.sessionGeneration;
    if (!uid || !this.isCurrentSession(uid, generation)) {
      return;
    }

    this.operationError.set(null);
    this.persistTrigger(event.input, event.id, event.expectedRevision, {
      uid,
      generation,
      closeEditor: true,
    });
  }

  toggleTrigger(trigger: NotificationTrigger, enabled: boolean): void {
    const uid = this.sessionUid;
    const generation = this.sessionGeneration;
    if (
      !uid ||
      !this.isCurrentSession(uid, generation) ||
      this.pendingTriggerId() !== null
    ) {
      return;
    }

    this.operationError.set(null);
    this.persistTrigger(
      this.toTriggerInput(trigger, enabled),
      trigger.id,
      trigger.revision,
      { uid, generation, closeEditor: false, pendingTriggerId: trigger.id },
    );
  }

  deleteTrigger(trigger: NotificationTrigger): void {
    const uid = this.sessionUid;
    const generation = this.sessionGeneration;
    if (
      !uid ||
      !this.isCurrentSession(uid, generation) ||
      this.deletingTriggerId() !== null ||
      this.pendingTriggerId() !== null
    ) {
      return;
    }

    this.operationError.set(null);
    this.deletingTriggerId.set(trigger.id);
    this.mutationSubscription?.unsubscribe();
    this.mutationSubscription = this.api
      .deleteTrigger(trigger.id, trigger.revision)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (deleted) => {
          if (!this.isCurrentSession(uid, generation)) {
            return;
          }

          if (!deleted) {
            this.operationError.set('O aviso não pôde ser removido.');
          } else {
            this.triggerTombstones.set(trigger.id, trigger.revision);
            this.localTriggerUpserts.delete(trigger.id);
            this.configuration.update((configuration) =>
              configuration
                ? {
                    ...configuration,
                    triggers: configuration.triggers.filter(
                      (item) => item.id !== trigger.id,
                    ),
                  }
                : configuration,
            );
            if (this.editingTriggerId() === trigger.id) {
              this.editingTriggerId.set(null);
            }
          }

          this.deletingTriggerId.set(null);
        },
        error: (error: unknown) => {
          if (!this.isCurrentSession(uid, generation)) {
            return;
          }

          this.deletingTriggerId.set(null);
          this.handleOperationError(error, uid);
        },
      });
  }

  async enableNotifications(): Promise<void> {
    const uid = this.sessionUid;
    const generation = this.sessionGeneration;
    const publicKey = this.configuration()?.publicKey;
    if (
      !uid ||
      !publicKey ||
      !this.isCurrentSession(uid, generation) ||
      this.pushBusy()
    ) {
      return;
    }

    this.pushBusy.set(true);
    this.pushError.set(null);

    try {
      const input = await this.pushService.requestSubscription(publicKey);
      if (!this.isCurrentSession(uid, generation)) {
        return;
      }

      const id = await firstValueFrom(
        this.api
          .registerDevice(input)
          .pipe(takeUntilDestroyed(this.destroyRef)),
      );

      if (!this.isCurrentSession(uid, generation)) {
        return;
      }

      this.deviceId.set(id);
      this.writeStoredDeviceId(uid, id);
      const deviceLabel = input.label?.trim() || 'Dispositivo';
      this.deviceTombstones.delete(id);
      this.localDeviceUpserts.add(id);
      this.configuration.update((configuration) => {
        if (!configuration) {
          return configuration;
        }

        if (configuration.devices.some((device) => device.id === id)) {
          return {
            ...configuration,
            devices: configuration.devices.map((device) =>
              device.id === id ? { ...device, label: deviceLabel } : device,
            ),
          };
        }

        return {
          ...configuration,
          devices: [
            ...configuration.devices,
            {
              id,
              label: deviceLabel,
              createdAt: new Date().toISOString(),
            },
          ],
        };
      });
      this.pushError.set(null);
    } catch (error: unknown) {
      if (this.isCurrentSession(uid, generation)) {
        if (
          error instanceof NotificationApiError &&
          /outra conta|another account/i.test(error.message)
        ) {
          try {
            await this.pushService.unsubscribe();
            if (this.isCurrentSession(uid, generation)) {
              this.pushError.set(
                'A assinatura anterior deste navegador foi desativada. Toque em Ativar notificações novamente para vincular esta conta.',
              );
            }
            return;
          } catch {
            // Keep the original actionable registration error when browser cleanup fails.
          }
        }
        this.pushService.refreshPermission();
        this.pushError.set(this.pushErrorMessage(error));
      }
    } finally {
      if (this.isCurrentSession(uid, generation)) {
        this.pushBusy.set(false);
      }
    }
  }

  async removeDevice(device: NotificationDevice): Promise<void> {
    const uid = this.sessionUid;
    const generation = this.sessionGeneration;
    if (!uid || !this.isCurrentSession(uid, generation) || this.pushBusy()) {
      return;
    }

    this.pushBusy.set(true);
    this.pushError.set(null);

    try {
      const removed = await firstValueFrom(
        this.api
          .removeDevice(device.id)
          .pipe(takeUntilDestroyed(this.destroyRef)),
      );
      if (!removed) {
        throw new Error('O dispositivo não pôde ser removido.');
      }

      if (!this.isCurrentSession(uid, generation)) {
        return;
      }

      if (this.deviceId() === device.id) {
        await this.pushService.unsubscribe();
        this.deviceId.set(null);
        this.removeStoredDeviceId(uid);
      }

      this.deviceTombstones.add(device.id);
      this.localDeviceUpserts.delete(device.id);
      this.configuration.update((configuration) =>
        configuration
          ? {
              ...configuration,
              devices: configuration.devices.filter(
                (item) => item.id !== device.id,
              ),
            }
          : configuration,
      );
    } catch (error: unknown) {
      if (this.isCurrentSession(uid, generation)) {
        this.pushService.refreshPermission();
        this.pushError.set(this.pushErrorMessage(error));
      }
    } finally {
      if (this.isCurrentSession(uid, generation)) {
        this.pushBusy.set(false);
      }
    }
  }

  isCurrentDevice(device: NotificationDevice): boolean {
    return this.deviceId() === device.id;
  }

  kindLabel(kind: NotificationKind): string {
    return KIND_LABELS[kind];
  }

  scheduleSummary(trigger: NotificationTrigger): string {
    const days =
      trigger.days.length === 7
        ? 'Todos os dias'
        : trigger.days.map((day) => DAY_LABELS[day] ?? '').join(', ');
    const windows = trigger.windows
      .map((window) => `${window.start}–${window.end}`)
      .join(' · ');
    return `${days} · ${windows}`;
  }

  deviceDate(device: NotificationDevice): string {
    const date = new Date(device.createdAt);
    if (Number.isNaN(date.valueOf())) {
      return 'Data não informada';
    }

    return new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'medium',
    }).format(date);
  }

  private startSession(uid: string, token: string): void {
    this.resetSession();
    this.sessionUid = uid;
    this.sessionToken = token;
    this.sessionGeneration += 1;
    this.deviceId.set(this.readStoredDeviceId(uid));
    this.pageState.set('loading');
    this.realtime.connect(uid, token);
    this.loadConfiguration(uid, true);
  }

  private loadConfiguration(uid: string, initial: boolean): void {
    if (!this.isCurrentSession(uid, this.sessionGeneration)) {
      return;
    }

    const generation = ++this.requestGeneration;
    this.configurationSubscription?.unsubscribe();
    if (initial) {
      this.pageState.set('loading');
      this.configuration.set(null);
    } else {
      this.refreshing.set(true);
    }
    this.errorMessage.set(null);

    this.configurationSubscription = this.api
      .getConfiguration()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (configuration) => {
          if (
            !this.isCurrentSession(uid, this.sessionGeneration) ||
            generation !== this.requestGeneration
          ) {
            return;
          }

          const applied = this.applyConfigurationSnapshot(configuration, uid);
          this.pageState.set('ready');
          this.refreshing.set(false);
          if (!applied) {
            return;
          }
        },
        error: (error: unknown) => {
          if (
            !this.isCurrentSession(uid, this.sessionGeneration) ||
            generation !== this.requestGeneration
          ) {
            return;
          }

          this.refreshing.set(false);
          if (this.configuration()) {
            // A socket snapshot may already be authoritative. Keep showing
            // it if this older HTTP read fails after the realtime path wins.
            this.pageState.set('ready');
            return;
          }
          this.pageState.set('error');
          this.errorMessage.set(this.getErrorMessage(error));
        },
      });
  }

  private handleRealtimeEvent(
    event: NotificationConfigurationRealtimeEvent,
  ): void {
    const uid = this.sessionUid;
    const generation = this.sessionGeneration;
    if (!uid || !this.isCurrentSession(uid, generation)) {
      return;
    }

    if (event.type === 'snapshot') {
      if (this.applyConfigurationSnapshot(event.configuration, uid)) {
        this.pageState.set('ready');
        this.refreshing.set(false);
        this.errorMessage.set(null);
      }
      return;
    }

    this.realtimeRevisionWatermark = Math.max(
      this.realtimeRevisionWatermark,
      event.delta.revision,
    );
    const configuration = this.configuration();
    if (!configuration) {
      this.requestRealtimeResync();
      return;
    }

    const currentRevision = configuration.revision;
    if (event.delta.revision <= currentRevision) {
      return;
    }
    if (event.delta.revision > currentRevision + 1) {
      this.requestRealtimeResync();
      return;
    }

    this.applyRealtimeDelta(event.delta);
  }

  private applyConfigurationSnapshot(
    incoming: NotificationConfiguration,
    uid: string,
  ): boolean {
    const current = this.configuration();
    if (incoming.revision < this.realtimeRevisionWatermark) {
      // A mixed snapshot may carry the version observed before a missing
      // delta. Keep the watermark and ask for another snapshot.
      this.realtimeResyncPending = false;
      this.requestRealtimeResync();
      return false;
    }
    if (current && incoming.revision < current.revision) {
      this.closeEditorWhenRemoved(current);
      return false;
    }

    const currentTriggers = current?.triggers ?? [];
    const currentDevices = current?.devices ?? [];
    const incomingTriggerIds = new Set(
      incoming.triggers.map((trigger) => trigger.id),
    );
    const triggers = incoming.triggers
      .filter((trigger) => !this.triggerTombstones.has(trigger.id))
      .map((trigger) => {
        const local = currentTriggers.find((item) => item.id === trigger.id);
        return local && local.revision > trigger.revision ? local : trigger;
      });
    const snapshotIsNewer =
      current !== null && incoming.revision > current.revision;
    for (const local of currentTriggers) {
      if (
        !incomingTriggerIds.has(local.id) &&
        this.localTriggerUpserts.has(local.id) &&
        !this.triggerTombstones.has(local.id) &&
        !snapshotIsNewer
      ) {
        triggers.push(local);
      } else if (!incomingTriggerIds.has(local.id)) {
        this.localTriggerUpserts.delete(local.id);
      }
    }

    const incomingDeviceIds = new Set(
      incoming.devices.map((device) => device.id),
    );
    const devices = incoming.devices.filter(
      (device) => !this.deviceTombstones.has(device.id),
    );
    for (const local of currentDevices) {
      if (
        !incomingDeviceIds.has(local.id) &&
        this.localDeviceUpserts.has(local.id) &&
        !this.deviceTombstones.has(local.id) &&
        !snapshotIsNewer
      ) {
        devices.push(local);
      } else if (!incomingDeviceIds.has(local.id)) {
        this.localDeviceUpserts.delete(local.id);
      }
    }

    this.configuration.set({ ...incoming, triggers, devices });
    this.realtimeRevisionWatermark = Math.max(
      this.realtimeRevisionWatermark,
      incoming.revision,
    );
    for (const [id, revision] of this.localTriggerUpserts) {
      const incomingTrigger = incoming.triggers.find(
        (trigger) => trigger.id === id,
      );
      if (incomingTrigger && incomingTrigger.revision >= revision) {
        this.localTriggerUpserts.delete(id);
      }
    }
    for (const id of this.localDeviceUpserts) {
      if (incomingDeviceIds.has(id)) {
        this.localDeviceUpserts.delete(id);
      }
    }
    this.realtimeResyncPending = false;
    const accepted = this.configuration();
    if (!accepted) {
      return false;
    }
    this.resolveStoredDeviceId(uid, accepted);
    this.closeEditorWhenRemoved(accepted);
    void this.backfillDeviceLabel(uid);
    return true;
  }

  private async backfillDeviceLabel(uid: string): Promise<void> {
    const device = this.currentDevice();
    if (
      this.deviceLabelAttempted ||
      !device ||
      !/^(Dispositivo|Este dispositivo)$/iu.test(device.label.trim())
    ) {
      return;
    }
    this.deviceLabelAttempted = true;
    const generation = this.sessionGeneration;
    try {
      const input = await this.pushService.existingSubscription();
      const label = input?.label;
      if (
        !input ||
        !label ||
        label === 'Dispositivo' ||
        !this.isCurrentSession(uid, generation) ||
        this.deviceId() !== device.id
      ) {
        return;
      }
      const id = await firstValueFrom(
        this.api
          .registerDevice(input)
          .pipe(takeUntilDestroyed(this.destroyRef)),
      );
      if (
        !this.isCurrentSession(uid, generation) ||
        id !== device.id ||
        this.deviceId() !== device.id ||
        this.deviceTombstones.has(id)
      ) {
        return;
      }
      this.configuration.update((configuration) =>
        configuration
          ? {
              ...configuration,
              devices: configuration.devices.map((item) =>
                item.id === id ? { ...item, label } : item,
              ),
            }
          : configuration,
      );
    } catch {
      // Label enrichment is optional; keep the existing authorization usable
      // when its subscription cannot be read or refreshed.
    }
  }

  private applyRealtimeDelta(delta: NotificationConfigurationDelta): void {
    this.configuration.update((configuration) => {
      if (!configuration) {
        return configuration;
      }

      if (delta.type === 'trigger_upsert') {
        if (this.triggerTombstones.has(delta.trigger.id)) {
          return { ...configuration, revision: delta.revision };
        }
        const current = configuration.triggers.find(
          (trigger) => trigger.id === delta.trigger.id,
        );
        if (current && current.revision > delta.trigger.revision) {
          return { ...configuration, revision: delta.revision };
        }
        this.localTriggerUpserts.delete(delta.trigger.id);
        const exists = !!current;
        return {
          ...configuration,
          revision: delta.revision,
          triggers: exists
            ? configuration.triggers.map((trigger) =>
                trigger.id === delta.trigger.id ? delta.trigger : trigger,
              )
            : [...configuration.triggers, delta.trigger],
        };
      }

      if (delta.type === 'trigger_remove') {
        const current = configuration.triggers.find(
          (trigger) => trigger.id === delta.triggerId,
        );
        if (current && current.revision > delta.triggerRevision) {
          return { ...configuration, revision: delta.revision };
        }
        this.triggerTombstones.set(delta.triggerId, delta.triggerRevision);
        this.localTriggerUpserts.delete(delta.triggerId);
        return {
          ...configuration,
          revision: delta.revision,
          triggers: configuration.triggers.filter(
            (trigger) => trigger.id !== delta.triggerId,
          ),
        };
      }

      if (delta.type === 'device_upsert') {
        if (this.deviceTombstones.has(delta.device.id)) {
          return { ...configuration, revision: delta.revision };
        }
        this.localDeviceUpserts.delete(delta.device.id);
        const exists = configuration.devices.some(
          (device) => device.id === delta.device.id,
        );
        return {
          ...configuration,
          revision: delta.revision,
          devices: exists
            ? configuration.devices.map((device) =>
                device.id === delta.device.id ? delta.device : device,
              )
            : [...configuration.devices, delta.device],
        };
      }

      this.deviceTombstones.add(delta.deviceId);
      this.localDeviceUpserts.delete(delta.deviceId);
      return {
        ...configuration,
        revision: delta.revision,
        devices: configuration.devices.filter(
          (device) => device.id !== delta.deviceId,
        ),
      };
    });

    const configuration = this.configuration();
    if (configuration) {
      const uid = this.sessionUid;
      if (uid && delta.type === 'device_remove') {
        this.resolveStoredDeviceId(uid, configuration);
      }
      this.closeEditorWhenRemoved(configuration);
    }
  }

  private requestRealtimeResync(): void {
    if (this.realtimeResyncPending) {
      return;
    }
    this.realtimeResyncPending = true;
    this.realtime.requestResync();
  }

  private persistTrigger(
    input: NotificationTriggerInput,
    id: string | undefined,
    expectedRevision: number | undefined,
    options: {
      uid: string;
      generation: number;
      closeEditor: boolean;
      pendingTriggerId?: string;
    },
  ): void {
    if (this.pendingTriggerId() !== null || this.deletingTriggerId() !== null) {
      return;
    }
    this.pendingTriggerId.set(options.pendingTriggerId ?? 'editor');
    this.mutationSubscription?.unsubscribe();
    this.mutationSubscription = this.api
      .saveTrigger(input, id, expectedRevision)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (trigger) => {
          if (!this.isCurrentSession(options.uid, options.generation)) {
            return;
          }

          if (this.triggerTombstones.has(trigger.id)) {
            this.pendingTriggerId.set(null);
            return;
          }
          this.localTriggerUpserts.set(trigger.id, trigger.revision);
          this.configuration.update((configuration) => {
            if (!configuration) {
              return configuration;
            }

            const current = configuration.triggers.find(
              (item) => item.id === trigger.id,
            );
            if (current && current.revision > trigger.revision) {
              return configuration;
            }

            const exists = configuration.triggers.some(
              (item) => item.id === trigger.id,
            );
            return {
              ...configuration,
              triggers: exists
                ? configuration.triggers.map((item) =>
                    item.id === trigger.id ? trigger : item,
                  )
                : [...configuration.triggers, trigger],
            };
          });
          this.pendingTriggerId.set(null);
          this.operationError.set(null);
          if (options.closeEditor) {
            this.editingTriggerId.set(null);
          }
        },
        error: (error: unknown) => {
          if (!this.isCurrentSession(options.uid, options.generation)) {
            return;
          }

          this.pendingTriggerId.set(null);
          this.handleOperationError(error, options.uid);
        },
      });
  }

  private handleOperationError(error: unknown, uid: string): void {
    if (this.isRevisionConflict(error)) {
      this.operationError.set(REVISION_CONFLICT_MESSAGE);
      this.loadConfiguration(uid, false);
      return;
    }

    this.operationError.set(this.getErrorMessage(error));
  }

  private closeEditorWhenRemoved(
    configuration: NotificationConfiguration,
  ): void {
    const id = this.editingTriggerId();
    if (
      id &&
      id !== 'new' &&
      !configuration.triggers.some((trigger) => trigger.id === id)
    ) {
      this.editingTriggerId.set(null);
      this.operationError.set(
        'Este aviso não está mais disponível nesta conta e foi fechado.',
      );
    }
  }

  private resolveStoredDeviceId(
    uid: string,
    configuration: NotificationConfiguration,
  ): void {
    const storedId = this.deviceId() ?? this.readStoredDeviceId(uid);
    if (
      storedId &&
      configuration.devices.some((device) => device.id === storedId)
    ) {
      this.deviceId.set(storedId);
      return;
    }

    this.deviceId.set(null);
    this.removeStoredDeviceId(uid);
  }

  private toTriggerInput(
    trigger: NotificationTrigger,
    enabled = trigger.enabled,
  ): NotificationTriggerInputWithArrival {
    const arrivalTrigger = trigger as NotificationTrigger & {
      arrivalLeadMinutes?: number;
    };
    return {
      name: trigger.name,
      enabled,
      days: [...trigger.days],
      windows: trigger.windows.map((window) => ({ ...window })),
      timezone: trigger.timezone,
      smart: trigger.smart,
      leadMinutes: trigger.leadMinutes,
      arrivalLeadMinutes: arrivalTrigger.arrivalLeadMinutes ?? 5,
      intervalMinutes: trigger.intervalMinutes,
      kind: trigger.kind,
      targetIds: [...trigger.targetIds],
      statusMode: trigger.statusMode,
    };
  }

  private resetSession(): void {
    this.deviceLabelAttempted = false;
    this.configurationSubscription?.unsubscribe();
    this.mutationSubscription?.unsubscribe();
    this.realtime.disconnect();
    this.configurationSubscription = undefined;
    this.mutationSubscription = undefined;
    this.sessionUid = null;
    this.sessionToken = null;
    this.sessionGeneration += 1;
    this.requestGeneration += 1;
    this.realtimeResyncPending = false;
    this.realtimeRevisionWatermark = 0;
    this.triggerTombstones.clear();
    this.deviceTombstones.clear();
    this.localTriggerUpserts.clear();
    this.localDeviceUpserts.clear();
    this.configuration.set(null);
    this.deviceId.set(null);
    this.editingTriggerId.set(null);
    this.operationError.set(null);
    this.errorMessage.set(null);
    this.pushError.set(null);
    this.refreshing.set(false);
    this.pushBusy.set(false);
    this.pendingTriggerId.set(null);
    this.deletingTriggerId.set(null);
  }

  private isCurrentSession(uid: string, generation: number): boolean {
    return (
      this.sessionUid === uid &&
      this.sessionGeneration === generation &&
      firebaseUser()?.uid === uid &&
      !!firebaseIdToken()
    );
  }

  private getErrorMessage(error: unknown): string {
    if (error instanceof NotificationApiError && error.message) {
      return error.message;
    }
    if (error instanceof Error && error.message) {
      return error.message;
    }
    return 'Não foi possível atualizar suas notificações. Tente novamente.';
  }

  private pushErrorMessage(error: unknown): string {
    if (error instanceof Error && error.message) {
      return error.message;
    }
    return 'Não foi possível configurar as notificações neste dispositivo.';
  }

  private isRevisionConflict(error: unknown): boolean {
    const message = this.getErrorMessage(error).toLocaleLowerCase('pt-BR');
    return /revision|revis[aã]o|conflito|alterad|vers[aã]o/.test(message);
  }

  private readStoredDeviceId(uid: string): string | null {
    if (!isPlatformBrowser(this.platformId)) {
      return null;
    }

    try {
      return window.localStorage.getItem(`${DEVICE_STORAGE_PREFIX}${uid}`);
    } catch {
      return null;
    }
  }

  private writeStoredDeviceId(uid: string, id: string): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    try {
      window.localStorage.setItem(`${DEVICE_STORAGE_PREFIX}${uid}`, id);
    } catch {
      // Private browsing can make localStorage unavailable. The server state
      // remains authoritative for this session.
    }
  }

  private removeStoredDeviceId(uid: string): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    try {
      window.localStorage.removeItem(`${DEVICE_STORAGE_PREFIX}${uid}`);
    } catch {
      // Ignore storage cleanup failures; the cloud registration was removed.
    }
  }
}
