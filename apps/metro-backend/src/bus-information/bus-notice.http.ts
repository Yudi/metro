import { Injectable } from '@nestjs/common';
import { NOTICE_ORIGIN, assertNoticeHtml } from './bus-notice.parser';

// Same identifying user agent used by the project's GTFS and WFS clients.
export const BUS_NOTICE_USER_AGENT =
  'Projeto-Transporte-Metropolitano-Backend/1.0';
const MAX_BYTES = 2_000_000;

@Injectable()
export class BusNoticeHttpClient {
  async get(path: string, runSignal: AbortSignal): Promise<string> {
    const url = new URL(path, NOTICE_ORIGIN);
    if (url.origin !== NOTICE_ORIGIN || url.username || url.password)
      throw new Error('Invalid notice source');
    const response = await fetch(url, {
      redirect: 'error',
      signal: AbortSignal.any([runSignal, AbortSignal.timeout(20_000)]),
      headers: {
        'User-Agent': BUS_NOTICE_USER_AGENT,
        Accept: 'text/html',
        'Accept-Language': 'pt-BR',
      },
    });
    if (
      !response.ok ||
      !response.headers.get('content-type')?.includes('text/html') ||
      Number(response.headers.get('content-length')) > MAX_BYTES ||
      !response.body
    ) {
      await response.body?.cancel();
      throw new Error(`Notice source rejected: HTTP ${response.status}`);
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_BYTES)
          throw new Error('Notice response exceeds size limit');
        chunks.push(value);
      }
    } finally {
      await reader.cancel();
      reader.releaseLock();
    }
    const html = Buffer.concat(chunks).toString('utf8');
    assertNoticeHtml(html);
    return html;
  }
}
