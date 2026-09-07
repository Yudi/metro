import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  noticeUrl,
  parseNoticeDetail,
  parseNoticeIndex,
} from './bus-notice.parser';
const index = readFileSync(join(__dirname, 'fixtures/index.html'), 'utf8');
const detail = readFileSync(join(__dirname, 'fixtures/detail.html'), 'utf8');

describe('operational notice HTML', () => {
  it('decodes entities and retains both index classifications without inventing active dates', () => {
    const rows = parseNoticeIndex(index);
    expect(rows.map((row) => row.listing)).toEqual(['UPCOMING', 'RECENT']);
    expect(rows[0].title).toBe('Desvio de itinerário');
    const notice = parseNoticeDetail(detail, rows[0]);
    expect(notice.routes).toEqual(['875A-10']);
    expect(notice.description).toContain(
      'Ida: desvio pela avenida.\nVolta: sem alteração.',
    );
    expect(notice.periodText).toBe('Segunda-feira, 07/09/2026, das 9h às 20h.');
    expect(notice).not.toHaveProperty('activeFrom');
  });
  it.each([
    '<title>Just a moment</title>',
    '<div id="px-captcha"></div>',
    '<h1>Informativos</h1>',
    index.replace('alteracoesOP', 'new-markup'),
  ])('fails closed for challenges or changed markup', (html) => {
    expect(() => parseNoticeIndex(html)).toThrow();
  });
  it('rejects malformed entries instead of silently publishing incomplete indexes', () => {
    expect(() =>
      parseNoticeIndex(
        index.replace(
          '/informativos/oeste/desvio-de-itinerario/71116/',
          'https://evil.test/71116/',
        ),
      ),
    ).toThrow();
  });
  it.each([
    'https://evil.test/informativos/oeste/test/1/',
    '//evil.test/informativos/oeste/test/1/',
    '/informativos/oeste/test/1/?next=evil',
    'javascript:alert(1)',
    'https://user@www.sptrans.com.br/informativos/oeste/test/1/',
  ])('rejects unsafe source URLs', (url) => {
    expect(noticeUrl(url)).toBeNull();
  });
  it('accepts ordinary Cloudflare instrumentation on a valid page', () => {
    expect(
      parseNoticeIndex(
        index +
          '<script src="/cdn-cgi/challenge-platform/scripts/jsd/main.js"></script>',
      ),
    ).toHaveLength(2);
  });
  it('rejects missing detail content', () => {
    expect(() =>
      parseNoticeDetail('<h1>Access denied</h1>', parseNoticeIndex(index)[0]),
    ).toThrow();
  });
});
