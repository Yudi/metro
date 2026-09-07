export const DEFAULT_TRANSIT_TIME_ZONE = 'America/Sao_Paulo';

export interface TransitTimeFormatOptions {
  locale?: string;
  timeZone?: string;
}

export interface TransitTimeDifferenceOptions {
  now?: Date;
  timeZone?: string;
  serviceDayRolloverMinutes?: number;
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

/**
 * Compares a legacy HH:mm service time with the current time in the transit
 * timezone. A time more than half a day behind is treated as the next service
 * day; a recently passed time remains negative instead of jumping 24 hours.
 */
export function getTransitTimeDifferenceMinutes(
  value: string,
  options: TransitTimeDifferenceOptions = {},
): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value.trim());
  if (!match) {
    return null;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) {
    return null;
  }

  const currentParts = new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: options.timeZone ?? DEFAULT_TRANSIT_TIME_ZONE,
  }).formatToParts(options.now ?? new Date());
  const currentHours = Number(
    currentParts.find((part) => part.type === 'hour')?.value,
  );
  const currentMinutes = Number(
    currentParts.find((part) => part.type === 'minute')?.value,
  );
  if (!Number.isFinite(currentHours) || !Number.isFinite(currentMinutes)) {
    return null;
  }

  let difference = hours * 60 + minutes - (currentHours * 60 + currentMinutes);
  const rolloverMinutes = options.serviceDayRolloverMinutes ?? 12 * 60;
  if (difference < -rolloverMinutes) {
    difference += 24 * 60;
  }

  return difference;
}
