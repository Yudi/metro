import { NotificationTriggerInput, NOTIFICATION_TIMEZONE } from './notifications';

export interface NotificationEligibility {
  windowKey: string;
  advance: boolean;
  remainingMinutes: number;
  cadenceSlot: number;
}

/** End-exclusive windows; an overnight range belongs to its starting weekday. */
export function notificationEligibility(
  trigger: NotificationTriggerInput, now: Date, important = false,
): NotificationEligibility | null {
  if (!trigger.enabled) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: NOTIFICATION_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now);
  const part = (key: string) => Number(parts.find(p => p.type === key)?.value);
  const day = new Date(Date.UTC(part('year'), part('month') - 1, part('day')));
  const minute = part('hour') * 60 + part('minute');
  const supportsAdvance = trigger.kind === 'rail_status' || trigger.kind === 'bus_notices';
  const lead = supportsAdvance && trigger.smart && important ? trigger.leadMinutes : 0;
  const candidates: NotificationEligibility[] = [];
  for (const offset of [-1, 0, 1]) {
    const startDay = new Date(day.getTime() + offset * 86_400_000);
    if (!trigger.days.includes(startDay.getUTCDay())) continue;
    for (const window of trigger.windows) {
      const start = toMinutes(window.start) + offset * 1440;
      let end = toMinutes(window.end) + offset * 1440;
      if (end <= start) end += 1440;
      if (minute < start - lead || minute >= end) continue;
      candidates.push({
        windowKey: `${startDay.toISOString().slice(0, 10)}-${window.start}-${window.end}`,
        advance: minute < start,
        remainingMinutes: end - minute,
        cadenceSlot: Math.max(0, Math.floor((minute - start) / trigger.intervalMinutes)),
      });
    }
  }
  // A regular window takes priority over an overlapping advance-warning range.
  return candidates.sort((a, b) => Number(a.advance) - Number(b.advance) || a.windowKey.localeCompare(b.windowKey))[0] ?? null;
}
function toMinutes(time: string): number { const [h, m] = time.split(':').map(Number); return h * 60 + m; }
