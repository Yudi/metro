import {
  DEFAULT_TRANSIT_TIME_ZONE,
  formatTransitTime,
} from '../common/date-time.utils';

export function formatScheduledRailTime(
  value: string,
  timeZone = DEFAULT_TRANSIT_TIME_ZONE,
  now = new Date(),
): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return '';

  const date = getDateKey(new Date(timestamp), timeZone);
  const today = getDateKey(now, timeZone);
  const time = formatTransitTime(timestamp, { timeZone });
  if (date === today) return time;

  const nextDate = new Date(`${today}T00:00:00Z`);
  nextDate.setUTCDate(nextDate.getUTCDate() + 1);
  if (date === nextDate.toISOString().slice(0, 10)) {
    return `Amanhã, ${time}`;
  }

  const dateLabel = new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    weekday: 'short',
    timeZone,
  }).format(timestamp);
  return `${dateLabel}, ${time}`;
}

function getDateKey(value: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone,
  }).formatToParts(value);
  return ['year', 'month', 'day']
    .map((type) => parts.find((part) => part.type === type)?.value)
    .join('-');
}
