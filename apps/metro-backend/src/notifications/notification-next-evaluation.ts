import { Temporal } from '@js-temporal/polyfill';
import { NotificationTriggerInput, NOTIFICATION_TIMEZONE, notificationEligibility } from '@metro/shared/notification-contracts';

/** Sleep until the next selected window instead of polling every sleeping user. */
export function nextNotificationEvaluation(trigger: NotificationTriggerInput, now: Date): Date {
  if (notificationEligibility(trigger, now, true)) return new Date(now.getTime() + 60_000);
  const local = Temporal.Instant.fromEpochMilliseconds(now.getTime()).toZonedDateTimeISO(NOTIFICATION_TIMEZONE);
  const lead = trigger.smart && (trigger.kind === 'rail_status' || trigger.kind === 'bus_notices') ? trigger.leadMinutes : 0;
  let earliest = now.getTime() + 8 * 86_400_000;
  for (let offset = 0; offset <= 7; offset++) {
    const day = local.toPlainDate().add({ days: offset });
    if (!trigger.days.includes(day.dayOfWeek % 7)) continue;
    for (const window of trigger.windows) {
      const start = day.toZonedDateTime({ timeZone: NOTIFICATION_TIMEZONE, plainTime: Temporal.PlainTime.from(window.start) }).subtract({ minutes: lead });
      if (start.epochMilliseconds > now.getTime()) earliest = Math.min(earliest, start.epochMilliseconds);
    }
  }
  return new Date(earliest);
}
