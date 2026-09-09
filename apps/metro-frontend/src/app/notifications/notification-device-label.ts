import Bowser from 'bowser';

/** Store a readable summary, rather than the full user agent. */
export function notificationDeviceLabel(userAgent: string, maxTouchPoints = 0): string {
  if (!userAgent.trim()) {
    return 'Dispositivo';
  }

  const parsed = Bowser.parse(userAgent);
  const browser = parsed.browser.name;
  // iPadOS can request desktop pages using a macOS user agent.
  const os = /Macintosh/u.test(userAgent) && maxTouchPoints > 1
    ? 'iPadOS'
    : parsed.os.name;
  return [browser, os].filter(Boolean).join(' · ').slice(0, 120) || 'Dispositivo';
}
