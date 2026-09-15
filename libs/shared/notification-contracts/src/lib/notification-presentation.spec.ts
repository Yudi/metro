import { RAIL_LINES, STATUS_CODE_TO_LABEL } from '@metro/shared/utils';
import {
  buildRailNotificationSummary,
  formatNotificationLineName,
  notificationRailState,
  type NotificationRailLine,
} from './notification-presentation';
import { type NotificationLineNameFormat } from './notifications';

const line = (
  code: number,
  statusLabel = 'Operação Normal',
): NotificationRailLine => ({
  targetId: `line-${code}`,
  lineCode: `L${code}`,
  label: `Linha ${code}`,
  statusLabel,
  normal: statusLabel === 'Operação Normal',
});

describe('notification presentation shared with the preview', () => {
  it.each<[NotificationLineNameFormat, string]>([
    ['full', 'Linha 1 - Azul'],
    ['number', '1'],
    ['code', 'L1'],
    ['color', 'Azul'],
  ])('formats the same rail identity as %s', (format, expected) => {
    expect(formatNotificationLineName('L1', 'untrusted label', format)).toBe(
      expected,
    );
    expect(
      formatNotificationLineName(undefined, 'Linha 1 - Azul', format),
    ).toBe(expected);
  });

  it('keeps a descriptive fallback for a line outside the rail catalog', () => {
    expect(
      formatNotificationLineName('EA', 'Expresso Aeroporto', 'number'),
    ).toBe('Expresso Aeroporto');
  });

  it('lists the actual issue lines, naturally ordered within each status', () => {
    expect(
      buildRailNotificationSummary([
        line(10, 'Velocidade Reduzida'),
        line(3, 'Operação Parcial'),
        line(2, 'Velocidade Reduzida'),
        line(1),
      ]),
    ).toEqual({
      title: 'Alterações nas suas linhas',
      body: 'L2, L10: Velocidade Reduzida\nL3: Operação Parcial\nL1: Operação Normal',
    });
  });

  it('only expands an all-clear to the network when completeness is confirmed', () => {
    expect(
      buildRailNotificationSummary([line(1), line(2, 'Operação Transitória')])
        .title,
    ).toBe('Suas linhas estão operacionais');
    expect(
      buildRailNotificationSummary([line(1), line(2, 'Operação Transitória')], {
        networkAllOperational: true,
      }),
    ).toEqual({
      title: 'Todas as linhas estão operacionais',
      body: 'L1: Operação Normal\nL2: Operação Transitória',
    });
  });

  it('never calls a closed or unknown line operational, even with a legacy normal flag', () => {
    const closed = { ...line(1, 'Operação Encerrada'), normal: true };
    expect(notificationRailState(closed)).toBe('closed');
    expect(
      buildRailNotificationSummary([closed, line(2)], {
        networkAllOperational: true,
      }),
    ).toEqual({
      title: 'Operação encerrada',
      body: 'L1: Operação Encerrada\nL2: Operação Normal',
    });
    expect(
      buildRailNotificationSummary([line(1, 'Dados Indisponíveis')], {
        networkAllOperational: true,
      }).title,
    ).toBe('Status parcial das suas linhas');
  });

  it('distinguishes recovered lines from lines that remained normal', () => {
    expect(
      buildRailNotificationSummary([line(1), line(2), line(3)], {
        recoveredTargetIds: ['line-1'],
      }),
    ).toEqual({
      title: 'Operação normalizada',
      body: 'L1: Operação normalizada\nL2, L3: Operação Normal',
    });
  });

  it('keeps outstanding disruptions visible alongside a partial recovery', () => {
    expect(
      buildRailNotificationSummary(
        [line(1), line(2, 'Operação Parcial'), line(3)],
        { recoveredTargetIds: ['line-1'] },
      ),
    ).toEqual({
      title: 'Atualização das suas linhas',
      body: 'L2: Operação Parcial\nL1: Operação normalizada\nL3: Operação Normal',
    });
  });

  it('describes reopening separately from recovery and preserves transitional status', () => {
    expect(
      buildRailNotificationSummary([line(1)], { reopenedTargetIds: ['line-1'] })
        .body,
    ).toBe('L1: Operação retomada');
    expect(
      buildRailNotificationSummary([line(1, 'Operação Transitória')], {
        reopenedTargetIds: ['line-1'],
      }).body,
    ).toBe('L1: Operação retomada - Operação Transitória');
    expect(
      buildRailNotificationSummary([line(1, 'Operação Transitória')], {
        recoveredTargetIds: ['line-1'],
      }).body,
    ).toContain('Operação Transitória');
  });

  it('preserves every selected line and status before fitting optional details', () => {
    const statuses = Object.keys(STATUS_CODE_TO_LABEL) as Array<
      keyof typeof STATUS_CODE_TO_LABEL
    >;
    const lines = RAIL_LINES.map((rail, index) => ({
      ...line(rail.code),
      statusCode: statuses[index % statuses.length],
      statusLabel: STATUS_CODE_TO_LABEL[statuses[index % statuses.length]],
      details: 'Detalhes da ocorrência. '.repeat(100),
    }));
    const summary = buildRailNotificationSummary(lines, {
      lineNameFormat: 'full',
    });
    expect(summary.body.length).toBeLessThanOrEqual(700);
    for (const rail of RAIL_LINES)
      expect(summary.body).toContain(rail.fullName);
    for (const line of lines) {
      const status =
        notificationRailState(line) === 'unknown'
          ? 'Sem dados recentes'
          : line.statusLabel;
      expect(summary.body).toContain(status);
    }
    expect(summary.body).not.toContain('Veja o status completo no app.');
  });
});
