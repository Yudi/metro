import { NotificationTriggerInput } from '@metro/shared/notification-contracts';
import {
  buildAggregatedRailStatusMessage,
  buildNotificationMessage,
  NotificationSnapshot,
} from './notification-message';

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
  targetIds: ['one'],
  statusMode: 'abnormal',
};
const incident: NotificationSnapshot = {
  title: 'Linha 1',
  body: 'Velocidade reduzida',
  fingerprint: 'slow',
  important: true,
  normal: false,
  observedAt: new Date('2026-09-07T10:00:00Z'),
  url: '/',
};
describe('notification messages', () => {
  it('persists restart-stable status content separately from outbox episode keys and windows', () => {
    const statusMessage = (snapshot: NotificationSnapshot, now: Date) =>
      buildAggregatedRailStatusMessage(
        trigger,
        't',
        [{ targetId: 'one', snapshot }],
        now,
      );
    const first = statusMessage(incident, new Date('2026-09-07T11:00:00Z'));
    const restarted = statusMessage(
      {
        ...incident,
        fingerprint: 'new-episode',
        observedAt: new Date('2026-09-07T11:01:00Z'),
      },
      new Date('2026-09-07T11:01:00Z'),
    );
    expect(first?.fingerprint).not.toBe(restarted?.fingerprint);
    expect(first?.payload.notification.data.stateFingerprint).toBe(
      restarted?.payload.notification.data.stateFingerprint,
    );
    expect(first?.payload.notification.data.stateScope).toBe(
      restarted?.payload.notification.data.stateScope,
    );
    const changed = statusMessage(
      { ...incident, body: 'Operação Parcial' },
      new Date('2026-09-07T11:02:00Z'),
    );
    expect(changed?.payload.notification.data.stateFingerprint).not.toBe(
      first?.payload.notification.data.stateFingerprint,
    );
    const nextWeek = statusMessage(incident, new Date('2026-09-14T11:00:00Z'));
    expect(nextWeek?.payload.notification.data.windowKey).not.toBe(
      first?.payload.notification.data.windowKey,
    );
  });

  it('distinguishes changed line statuses even when merged counts look identical', () => {
    const now = new Date('2026-09-07T11:00:00Z');
    const first = buildAggregatedRailStatusMessage(
      trigger,
      't',
      [
        {
          targetId: 'one',
          snapshot: {
            ...incident,
            lineCode: 'L1',
            statusLabel: 'Operação Parcial',
            body: 'Operação Parcial',
          },
        },
        {
          targetId: 'two',
          snapshot: {
            ...incident,
            lineCode: 'L2',
            statusLabel: 'Velocidade Reduzida',
            body: 'Velocidade Reduzida',
          },
        },
      ],
      now,
    );
    const changed = buildAggregatedRailStatusMessage(
      trigger,
      't',
      [
        {
          targetId: 'two',
          snapshot: {
            ...incident,
            lineCode: 'L2',
            statusLabel: 'Operação Parcial',
            body: 'Operação Parcial',
          },
        },
        {
          targetId: 'one',
          snapshot: {
            ...incident,
            lineCode: 'L1',
            statusLabel: 'Velocidade Reduzida',
            body: 'Velocidade Reduzida',
          },
        },
      ],
      now,
    );
    expect(first?.payload.notification.body).not.toBe(
      changed?.payload.notification.body,
    );
    expect(first?.payload.notification.data.stateFingerprint).not.toBe(
      changed?.payload.notification.data.stateFingerprint,
    );
  });

  it('naturally sorts merged line numbers and keeps the payload stable across query order', () => {
    const entries = [11, 2, 10, 9, 1].map((number) => ({
      targetId: `line-${number}`,
      snapshot: {
        ...incident,
        normal: true,
        important: false,
        lineCode: `L${number}`,
        statusLabel: 'Operação Normal',
      },
    }));
    const now = new Date('2026-09-07T11:00:00Z');
    const first = buildAggregatedRailStatusMessage(
      {
        ...trigger,
        statusMode: 'all',
        targetIds: entries.map((entry) => entry.targetId),
      },
      't',
      entries,
      now,
    );
    const restarted = buildAggregatedRailStatusMessage(
      {
        ...trigger,
        statusMode: 'all',
        targetIds: entries.map((entry) => entry.targetId),
      },
      't',
      [...entries].reverse(),
      now,
    );
    expect(first?.payload.notification.body).toBe(
      'L1, L2, L9, L10, L11: Operação Normal',
    );
    expect(first?.payload.notification.data.targetIds).toEqual([
      'line-1',
      'line-2',
      'line-9',
      'line-10',
      'line-11',
    ]);
    expect(restarted).toEqual(first);
    expect(entries.map((entry) => entry.snapshot.lineCode)).toEqual([
      'L11',
      'L2',
      'L10',
      'L9',
      'L1',
    ]);
  });

  it('uses the public line number when a fallback label has no lineCode', () => {
    const normal = {
      ...incident,
      normal: true,
      important: false,
      statusLabel: 'Operação Normal',
    };
    const message = buildAggregatedRailStatusMessage(
      { ...trigger, statusMode: 'all', targetIds: ['ten', 'two'] },
      't',
      [
        { targetId: 'ten', snapshot: { ...normal, lineCode: 'L10' } },
        { targetId: 'two', label: 'Linha 2 - Verde', snapshot: normal },
      ],
      new Date('2026-09-07T11:00:00Z'),
    );
    expect(message?.payload.notification.body).toBe('L2, L10: Operação Normal');
  });

  it('delivers an ongoing incident when the window opens even when it started earlier', () => {
    expect(
      buildNotificationMessage(
        trigger,
        't',
        'one',
        incident,
        new Date('2026-09-07T11:00:00Z'),
      ),
    ).not.toBeNull();
  });
  it('does not deliver off-window or normal states in incident-only mode', () => {
    expect(
      buildNotificationMessage(
        trigger,
        't',
        'one',
        incident,
        new Date('2026-09-07T10:59:00Z'),
      ),
    ).toBeNull();
    expect(
      buildNotificationMessage(
        trigger,
        't',
        'one',
        { ...incident, normal: true },
        new Date('2026-09-07T11:00:00Z'),
      ),
    ).toBeNull();
  });
  it('deduplicates an unchanged incident, ignoring fetch timestamps', () => {
    const first = buildNotificationMessage(
      trigger,
      't',
      'one',
      incident,
      new Date('2026-09-07T11:00:00Z'),
    );
    const next = buildNotificationMessage(
      trigger,
      't',
      'one',
      { ...incident, observedAt: new Date() },
      new Date('2026-09-07T11:15:00Z'),
    );
    expect(first?.fingerprint).toBe(next?.fingerprint);
  });
  it('expires messages before the strict window ends and provides setup actions', () => {
    const message = buildNotificationMessage(
      trigger,
      't',
      'one',
      incident,
      new Date('2026-09-07T11:59:00Z'),
    );
    expect(message?.expiresAt.toISOString()).toBe('2026-09-07T12:00:00.000Z');
    expect(message?.payload.notification.data.onActionClick.settings.url).toBe(
      'sp/notifications',
    );
  });
  it('groups only upcoming arrivals in the configured lead horizon', () => {
    const now = new Date('2026-09-07T11:00:00Z');
    const arrivalTrigger = {
      ...trigger,
      kind: 'rail_arrivals' as const,
      arrivalLeadMinutes: 5,
    };
    const snapshot = {
      ...incident,
      important: false,
      normal: true,
      arrivals: [
        { destination: 'Luz', expectedAt: now.getTime() + 120_000 },
        { destination: 'Jundiaí', expectedAt: now.getTime() + 600_000 },
        { destination: 'Já passou', expectedAt: now.getTime() - 60_000 },
      ],
    };
    const message = buildNotificationMessage(
      arrivalTrigger,
      't',
      'one',
      snapshot,
      now,
    );
    expect(message?.payload.notification.body).toContain(
      'Luz: em 2 min (08:02)',
    );
    expect(message?.payload.notification.body).not.toContain('Jundiaí');
    expect(message?.payload.notification.body).not.toContain('Já passou');
    expect(message?.expiresAt.getTime()).toBe(now.getTime() + 120_000);
  });
  it('stays quiet without a known approaching arrival, even in smart mode', () => {
    const arrivalTrigger = {
      ...trigger,
      kind: 'bus_arrivals' as const,
      smart: true,
    };
    expect(
      buildNotificationMessage(
        arrivalTrigger,
        't',
        'one',
        { ...incident, arrivals: [] },
        new Date('2026-09-07T11:00:00Z'),
      ),
    ).toBeNull();
  });

  it('lists every normal rail line in one notification', () => {
    const normal = (lineCode: string): NotificationSnapshot => ({
      title: lineCode,
      body: 'Operação normal',
      fingerprint: `normal-${lineCode}`,
      important: false,
      normal: true,
      statusLabel: 'Operação Normal',
      lineCode,
      observedAt: new Date('2026-09-07T10:00:00Z'),
      url: '/',
    });
    const message = buildAggregatedRailStatusMessage(
      { ...trigger, statusMode: 'all' },
      't',
      [
        { targetId: 'one', label: 'Linha 1 - Azul', snapshot: normal('L1') },
        { targetId: 'two', label: 'Linha 2 - Verde', snapshot: normal('L2') },
      ],
      new Date('2026-09-07T11:00:00Z'),
    );

    expect(message?.payload.notification.body).toBe('L1, L2: Operação Normal');
    expect(message?.payload.notification.data.targetIds).toEqual([
      'one',
      'two',
    ]);
  });

  it('summarizes issue lines by canonical status and keeps the aggregate stable', () => {
    const issue = (
      targetId: string,
      lineCode: string,
      statusLabel: string,
      fingerprint: string,
    ): NotificationSnapshot => ({
      title: lineCode,
      body: `${statusLabel}: detalhes diferentes para ${lineCode}`,
      fingerprint,
      important: true,
      normal: false,
      statusLabel,
      lineCode,
      observedAt: new Date('2026-09-07T10:00:00Z'),
      url: '/',
    });
    const entries = [
      {
        targetId: 'one',
        snapshot: issue('one', 'L1', 'Operação Parcial', 'one-details'),
      },
      {
        targetId: 'two',
        snapshot: issue('two', 'L2', 'Operação Parcial', 'two-details'),
      },
      {
        targetId: 'three',
        snapshot: issue('three', 'L3', 'Operação Encerrada', 'three-details'),
      },
      {
        targetId: 'four',
        snapshot: {
          ...issue('four', 'L4', 'Operação Normal', 'four-normal'),
          normal: true,
          important: false,
        },
      },
    ];
    const now = new Date('2026-09-07T11:00:00Z');
    const message = buildAggregatedRailStatusMessage(
      { ...trigger, statusMode: 'all' },
      't',
      entries,
      now,
    );
    const reversed = buildAggregatedRailStatusMessage(
      { ...trigger, statusMode: 'all' },
      't',
      [...entries].reverse(),
      now,
    );

    expect(message?.payload.notification.body).toBe(
      'L1, L2: Operação Parcial\nL3: Operação Encerrada\nL4: Operação Normal',
    );
    expect(message?.payload.notification.body).toContain('L4: Operação Normal');
    expect(message?.payload.notification.data.important).toBe(true);
    expect(message?.fingerprint).toBe(reversed?.fingerprint);
  });

  it('does not invent a normal status when a normal snapshot has no status label', () => {
    const message = buildAggregatedRailStatusMessage(
      { ...trigger, statusMode: 'all' },
      't',
      [
        {
          targetId: 'one',
          snapshot: {
            ...incident,
            normal: true,
            important: false,
            lineCode: 'L1',
          },
        },
      ],
      new Date('2026-09-07T11:00:00Z'),
    );

    expect(message?.payload.notification.body).toBe('L1');
  });
  it('sorts arrivals by the soonest boarding opportunity before limiting the list', () => {
    const now = new Date('2026-09-07T11:00:00Z');
    const arrivals = [5, 4, 3, 2, 1].map((minutes) => ({
      destination: `Destino ${minutes}`,
      expectedAt: now.getTime() + minutes * 60_000,
    }));
    const message = buildNotificationMessage(
      { ...trigger, kind: 'rail_arrivals' },
      't',
      'one',
      {
        ...incident,
        normal: true,
        important: false,
        stationName: 'Sé',
        lineCode: 'L1',
        arrivals: [
          ...arrivals,
          {
            destination: 'Jabaquara',
            expectedAt: now.getTime() + 30_000,
            atPlatform: true,
          },
        ],
      },
      now,
    );
    expect(message?.payload.notification.title).toBe(
      'Próximos trens - Sé - L1',
    );
    expect(message?.payload.notification.body.split('\n')[0]).toBe(
      'Jabaquara: na plataforma',
    );
    expect(message?.payload.notification.body).toContain(
      'Destino 1: em 1 min (08:01)',
    );
    expect(message?.payload.notification.body).not.toContain('Destino 5');
  });

  it('still records normal-to-transitional changes within the same operational episode', () => {
    const now = new Date('2026-09-07T11:00:00Z');
    const normal = {
      targetId: 'one',
      issueKey: 'same-episode',
      snapshot: {
        ...incident,
        normal: true,
        important: false,
        statusCode: 'OperacaoNormal' as const,
        statusLabel: 'Operação Normal',
        lineCode: 'L1',
      },
    };
    const first = buildAggregatedRailStatusMessage(
      { ...trigger, statusMode: 'all' },
      't',
      [normal],
      now,
    );
    const changed = buildAggregatedRailStatusMessage(
      { ...trigger, statusMode: 'all' },
      't',
      [
        {
          ...normal,
          snapshot: {
            ...normal.snapshot,
            statusCode: 'OperacaoTransitoria',
            statusLabel: 'Operação Transitória',
          },
        },
      ],
      now,
    );
    expect(changed?.fingerprint).not.toBe(first?.fingerprint);
    expect(changed?.payload.notification.body).toBe('L1: Operação Transitória');
  });

  it('preserves the notified state of temporarily missing lines for a later recovery', () => {
    const now = new Date('2026-09-07T11:00:00Z');
    const message = buildAggregatedRailStatusMessage(
      { ...trigger, targetIds: ['one', 'two'] },
      't',
      [
        {
          targetId: 'one',
          snapshot: {
            ...incident,
            lineCode: 'L1',
            normal: true,
            important: false,
            statusLabel: 'Operação Normal',
          },
        },
      ],
      now,
      new Map([
        ['one', 'issue'],
        ['two', 'issue'],
      ]),
      [
        { targetId: 'one', label: 'Linha 1 - Azul' },
        { targetId: 'two', label: 'Linha 2 - Verde' },
      ],
    );
    expect(message?.payload.notification.title).toBe(
      'Status parcial das suas linhas',
    );
    expect(message?.payload.notification.body).toContain(
      'L1: Operação normalizada',
    );
    expect(message?.payload.notification.body).toContain(
      'L2: Sem dados recentes',
    );
    expect(message?.payload.notification.data.railStates).toContainEqual({
      targetId: 'two',
      state: 'issue',
    });
  });

  it.each(['full', 'number', 'code', 'color'] as const)(
    'names every unavailable selected line using the %s format',
    (lineNameFormat) => {
      const message = buildAggregatedRailStatusMessage(
        {
          ...trigger,
          targetIds: ['one', 'opaque-two', 'opaque-three'],
          lineNameFormat,
        },
        't',
        [
          {
            targetId: 'one',
            snapshot: {
              ...incident,
              lineCode: 'L1',
              statusLabel: 'Operação Parcial',
            },
          },
        ],
        new Date('2026-09-07T11:00:00Z'),
        new Map(),
        [
          { targetId: 'one', label: 'Linha 1 - Azul' },
          { targetId: 'opaque-two', label: 'Linha 2 - Verde' },
          { targetId: 'opaque-three', label: 'Linha 3 - Vermelha' },
        ],
      );
      const expected = {
        full: 'Linha 2 - Verde, Linha 3 - Vermelha',
        number: '2, 3',
        code: 'L2, L3',
        color: 'Verde, Vermelha',
      }[lineNameFormat];
      expect(message?.payload.notification.body).toContain(
        `${expected}: Sem dados recentes`,
      );
      expect(message?.payload.notification.body).not.toContain('opaque-');
      expect(message?.payload.notification.title).not.toContain('operacionais');
    },
  );
});
