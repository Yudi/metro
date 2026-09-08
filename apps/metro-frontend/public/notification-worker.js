/* Gate stale notifications before Angular's worker displays them. No permission requests. */
self.addEventListener('push', (event) => {
  try {
    const message = event.data?.json();
    const expiresAt = message?.notification?.data?.expiresAt;
    if (typeof expiresAt !== 'number' || !Number.isFinite(expiresAt) || Date.now() >= expiresAt) {
      event.stopImmediatePropagation();
    }
  } catch {
    event.stopImmediatePropagation();
  }
});
importScripts('./ngsw-worker.js');
