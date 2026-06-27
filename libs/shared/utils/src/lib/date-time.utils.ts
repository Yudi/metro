export const DEFAULT_TRANSIT_TIME_ZONE = 'America/Sao_Paulo';

export interface TransitTimeFormatOptions {
  locale?: string;
  timeZone?: string;
}

function isHourMinuteTime(value: string): boolean {
  return /^\d{2}:\d{2}$/.test(value);
}

export function formatTransitTime(
  value: string | number | Date,
  options: TransitTimeFormatOptions = {},
): string {
  if (value instanceof Date || typeof value === 'number') {
    return new Intl.DateTimeFormat(options.locale ?? 'pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: options.timeZone ?? DEFAULT_TRANSIT_TIME_ZONE,
    }).format(value);
  }

  const trimmedValue = value.trim();
  if (!trimmedValue) {
    return '';
  }

  // Times from legacy APIs already arrive as HH:mm without timezone metadata.
  if (isHourMinuteTime(trimmedValue)) {
    return trimmedValue;
  }

  const parsedDate = new Date(trimmedValue);
  if (Number.isNaN(parsedDate.getTime())) {
    return trimmedValue;
  }

  return new Intl.DateTimeFormat(options.locale ?? 'pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: options.timeZone ?? DEFAULT_TRANSIT_TIME_ZONE,
  }).format(parsedDate);
}
