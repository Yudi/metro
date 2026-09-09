import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';

describe('full frontend service worker notification expiry gate', () => {
  const source = readFileSync(
    resolve(__dirname, '../../../metro-frontend/public/notification-worker.js'),
    'utf8',
  );
  it.each([undefined, null, 'tomorrow', 99, 100])(
    'drops invalid or expired notification expiry %s',
    (expiresAt) => {
      let handler: (event: unknown) => void = () => undefined;
      const importScripts = jest.fn();
      runInNewContext(source, {
        self: {
          addEventListener: (_: string, callback: typeof handler) => {
            handler = callback;
          },
        },
        importScripts,
        Date: { now: () => 100 },
      });
      const stopImmediatePropagation = jest.fn();
      handler({
        data: { json: () => ({ notification: { data: { expiresAt } } }) },
        stopImmediatePropagation,
      });
      expect(stopImmediatePropagation).toHaveBeenCalledTimes(1);
      expect(importScripts).toHaveBeenCalledWith('./ngsw-worker.js');
    },
  );
  it('allows timely notifications to reach Angular', () => {
    let handler: (event: unknown) => void = () => undefined;
    runInNewContext(source, {
      self: {
        addEventListener: (_: string, callback: typeof handler) => {
          handler = callback;
        },
      },
      importScripts: jest.fn(),
      Date: { now: () => 100 },
    });
    const stopImmediatePropagation = jest.fn();
    handler({
      data: { json: () => ({ notification: { data: { expiresAt: 101 } } }) },
      stopImmediatePropagation,
    });
    expect(stopImmediatePropagation).not.toHaveBeenCalled();
  });
});
