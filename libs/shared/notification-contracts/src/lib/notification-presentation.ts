import {
  getRailLineByCode,
  getStatusCodeFromLabel,
  parseRailLineCode,
  type RailStatusCode,
} from '@metro/shared/utils';
import {
  DEFAULT_NOTIFICATION_LINE_NAME_FORMAT,
  type NotificationLineNameFormat,
} from './notifications';

export type NotificationRailState =
  | 'operational'
  | 'issue'
  | 'closed'
  | 'unknown';

export interface NotificationRailLine {
  targetId: string;
  label: string;
  lineCode?: string;
  statusCode?: RailStatusCode;
  statusLabel?: string;
  normal: boolean;
  details?: string;
}

export interface NotificationRailSummaryOptions {
  lineNameFormat?: NotificationLineNameFormat;
  networkAllOperational?: boolean;
  recoveredTargetIds?: readonly string[];
  reopenedTargetIds?: readonly string[];
}

export function notificationRailState(
  line: Pick<NotificationRailLine, 'statusCode' | 'statusLabel' | 'normal'>,
): NotificationRailState {
  const code =
    line.statusCode ??
    (line.statusLabel ? getStatusCodeFromLabel(line.statusLabel) : undefined);
  if (code === 'OperacaoNormal' || code === 'OperacaoTransitoria')
    return 'operational';
  if (code === 'OperacaoEncerrada') return 'closed';
  if (code === 'StatusDesconhecido' || code === 'DadosIndisponiveis')
    return 'unknown';
  if (code) return 'issue';
  return line.normal ? 'operational' : 'issue';
}

export function formatNotificationLineName(
  lineCode: string | number | undefined,
  label: string,
  format: NotificationLineNameFormat = DEFAULT_NOTIFICATION_LINE_NAME_FORMAT,
): string {
  const code =
    typeof lineCode === 'number'
      ? lineCode
      : (parseRailLineCode(lineCode) ??
        parseRailLineCode(label.replace(/^linha\s*/iu, 'L')));
  const line = code === undefined ? undefined : getRailLineByCode(code);
  if (!line) return label.trim() || String(lineCode ?? 'Linha');
  switch (format) {
    case 'full':
      return line.fullName;
    case 'number':
      return String(line.code);
    case 'color':
      return line.colorName;
    case 'code':
      return line.lineId;
  }
}

const naturalOrder = new Intl.Collator('pt-BR', {
  numeric: true,
  sensitivity: 'base',
});
export function compareNotificationRailLines(
  left: NotificationRailLine,
  right: NotificationRailLine,
): number {
  return (
    naturalOrder.compare(
      formatNotificationLineName(left.lineCode, left.label, 'code'),
      formatNotificationLineName(right.lineCode, right.label, 'code'),
    ) || left.targetId.localeCompare(right.targetId)
  );
}

/** One formatter for the delivered message and the explicitly fictional UI preview. */
export function buildRailNotificationSummary(
  lines: readonly NotificationRailLine[],
  options: NotificationRailSummaryOptions = {},
) {
  const recovered = new Set(options.recoveredTargetIds);
  const reopened = new Set(options.reopenedTargetIds);
  const ordered = [...lines].sort(compareNotificationRailLines);
  const groups = new Map<string, { labels: string[]; priority: number }>();
  let issues = 0;
  let closed = 0;
  let unknown = 0;
  for (const line of ordered) {
    const state = notificationRailState(line);
    issues += Number(state === 'issue');
    closed += Number(state === 'closed');
    unknown += Number(state === 'unknown');
    const status = railStatusText(line, state, recovered, reopened);
    const priority =
      state === 'issue'
        ? 0
        : state === 'closed'
          ? 1
          : recovered.has(line.targetId) || reopened.has(line.targetId)
            ? 2
            : state === 'unknown'
              ? 3
              : 4;
    const group = groups.get(status) ?? { labels: [], priority };
    group.labels.push(
      formatNotificationLineName(
        line.lineCode,
        line.label,
        options.lineNameFormat,
      ),
    );
    groups.set(status, group);
  }
  const rows = [...groups]
    .sort(([, left], [, right]) => left.priority - right.priority)
    .map(
      ([status, { labels }]) =>
        `${labels.join(', ')}${status ? `: ${status}` : ''}`,
    );
  const allOperational = !issues && !closed && !unknown;
  const networkClear = allOperational && options.networkAllOperational === true;
  const singular = lines.length === 1 && !unknown;
  let title: string;
  if (issues) {
    title =
      recovered.size || reopened.size
        ? 'Atualização das suas linhas'
        : singular
          ? 'Alteração na sua linha'
          : 'Alterações nas suas linhas';
  } else if (closed) {
    title = 'Operação encerrada';
  } else if (unknown) {
    title = 'Status parcial das suas linhas';
  } else if (recovered.size) {
    title = 'Operação normalizada';
  } else if (reopened.size) {
    title = 'Operação retomada';
  } else if (networkClear) {
    title = 'Todas as linhas estão operacionais';
  } else {
    title = singular
      ? 'Sua linha está operacional'
      : 'Suas linhas estão operacionais';
  }
  if (networkClear && (recovered.size || reopened.size)) {
    rows.push('Todas as linhas estão operacionais.');
  }

  // Preserve every line identity and status. Only optional incident details
  // use the remaining body budget; named rows never become anonymous counts.
  let body = rows.join('\n');
  for (const line of ordered.filter(
    (line) => notificationRailState(line) === 'issue',
  )) {
    if (!line.details?.trim()) continue;
    const detail = `${formatNotificationLineName(line.lineCode, line.label, options.lineNameFormat)}: ${line.details.trim()}`;
    const available = 700 - body.length - 1;
    if (available > 60)
      body += `\n${truncateNotificationText(detail, available)}`;
  }
  return { title, body };
}

function railStatusText(
  line: NotificationRailLine,
  state: NotificationRailState,
  recovered: ReadonlySet<string>,
  reopened: ReadonlySet<string>,
): string {
  if (state === 'closed') return 'Operação Encerrada - sem embarque';
  if (state === 'unknown') return 'Sem dados recentes';
  if (recovered.has(line.targetId)) {
    const transitional =
      line.statusCode === 'OperacaoTransitoria' ||
      line.statusLabel === 'Operação Transitória';
    return transitional
      ? 'Operação normalizada - Operação Transitória'
      : 'Operação normalizada';
  }
  if (reopened.has(line.targetId)) {
    const transitional =
      line.statusCode === 'OperacaoTransitoria' ||
      line.statusLabel === 'Operação Transitória';
    return transitional
      ? 'Operação retomada - Operação Transitória'
      : 'Operação retomada';
  }
  return line.statusLabel?.trim() || '';
}

export function truncateNotificationText(text: string, limit: number): string {
  if (text.length <= limit) return text;
  const cut = text.slice(0, limit - 1);
  const wordEnd = cut.lastIndexOf(' ');
  return `${cut.slice(0, wordEnd > limit / 2 ? wordEnd : cut.length).trimEnd()}…`;
}
