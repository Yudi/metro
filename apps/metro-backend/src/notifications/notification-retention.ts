const DAY_MS = 86_400_000;

export function notificationRetentionExpiry(lastLogin: Date): Date {
  const expiry = new Date(lastLogin);
  expiry.setUTCFullYear(expiry.getUTCFullYear() + 2);
  return expiry;
}

export function notificationRetentionStage(expiry: Date, now: Date): number | null {
  const remaining = expiry.getTime() - now.getTime();
  if (remaining <= 0 || remaining > 7 * DAY_MS) return null;
  if (remaining <= DAY_MS) return 1;
  return remaining <= 3 * DAY_MS ? 3 : 7;
}
