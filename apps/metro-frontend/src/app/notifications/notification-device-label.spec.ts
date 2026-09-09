import { notificationDeviceLabel } from './notification-device-label';

describe('notificationDeviceLabel', () => {
  it.each([
    [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
      'Chrome · Windows',
    ],
    [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0',
      'Microsoft Edge · Windows',
    ],
    [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
      'Safari · iOS',
    ],
    [
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
      'Chrome · Android',
    ],
    [
      'Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0',
      'Firefox · Linux',
    ],
    ['', 'Dispositivo'],
    ['unknown', 'Dispositivo'],
  ])('summarizes %s', (userAgent, expected) => {
    expect(notificationDeviceLabel(userAgent)).toBe(expected);
  });

  it('distinguishes desktop-mode iPads from Macs using touch support', () => {
    const userAgent =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
    expect(notificationDeviceLabel(userAgent, 5)).toBe('Safari · iPadOS');
    expect(notificationDeviceLabel(userAgent, 0)).toBe('Safari · macOS');
  });
});
