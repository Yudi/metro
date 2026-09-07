import { load } from 'cheerio';

export const NOTICE_ORIGIN = 'https://www.sptrans.com.br';
export interface NoticeReference {
  sourceId: string;
  sourceUrl: string;
  title: string;
  listedDate: string;
  listing: string;
}
export interface BusNotice extends NoticeReference {
  description: string;
  routes: string[];
  periodText: string;
}

export function assertNoticeHtml(html: string): void {
  if (
    /cf-chl-running|cf-chl-widget|px-captcha|<title>\s*(?:Just a moment|Access Denied)/i.test(
      html,
    )
  ) {
    throw new Error('Notice source returned a protection challenge');
  }
}

/** Only accept official detail URLs, even when the source HTML is compromised. */
export function noticeUrl(
  href: string,
): { sourceId: string; sourceUrl: string } | null {
  try {
    const url = new URL(href, NOTICE_ORIGIN);
    const match = /^\/informativos\/[a-z-]+\/[a-z0-9-]+\/(\d+)\/?$/.exec(
      url.pathname,
    );
    if (
      url.origin !== NOTICE_ORIGIN ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !match
    )
      return null;
    return { sourceId: match[1], sourceUrl: url.href };
  } catch {
    return null;
  }
}

export function parseNoticeIndex(html: string): NoticeReference[] {
  assertNoticeHtml(html);
  const $ = load(html);
  const groups = [
    { heading: 'Próximas Mudanças Previstas', listing: 'UPCOMING' },
    { heading: 'Mudanças Operacionais Realizadas', listing: 'RECENT' },
  ];
  const result: NoticeReference[] = [];
  for (const group of groups) {
    // Match semantic headings as well as the incumbent wrappers.
    const heading = $('h2').filter(
      (_, element) => $(element).text().trim() === group.heading,
    );
    const container = heading.parent();
    if (
      heading.length !== 1 ||
      container.find('ul.alteracoesOP').length !== 1
    ) {
      throw new Error('Unrecognized notice index structure');
    }
    container.find('ul.alteracoesOP li').each((_, element) => {
      const link = $(element).find('a[href]').first();
      const identity = noticeUrl(link.attr('href') ?? '');
      const title = link.find('div').text().replace(/\s+/g, ' ').trim();
      const listedDate = link.find('small').text().replace(/\s+/g, ' ').trim();
      if (!identity || !title || !listedDate)
        throw new Error('Incomplete notice index entry');
      result.push({ ...identity, title, listedDate, listing: group.listing });
    });
  }
  // Empty or unexpectedly truncated pages must never erase the last good snapshot.
  if (!result.length || result.length > 1000)
    throw new Error('Unexpected notice index size');
  return result;
}

export function parseNoticeDetail(
  html: string,
  reference: NoticeReference,
): BusNotice {
  assertNoticeHtml(html);
  const $ = load(html);
  const title = $('#conteudo h1').text().replace(/\s+/g, ' ').trim();
  const body = $('#conteudo .conteudo-interno .col-md-9').first().clone();
  body.find('script, style, iframe, form, nav').remove();
  body.find('br').replaceWith('\n');
  body.find('p, li, h2, h3, div').append('\n');
  const description = body
    .text()
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
  if (
    !title ||
    title.length > 500 ||
    description.length < 25 ||
    description.length > 100_000
  ) {
    throw new Error('Unrecognized notice detail structure');
  }
  const routes = [
    ...new Set(
      `${title}\n${description}`
        .toUpperCase()
        .match(/\b[0-9A-Z]{4}-\d{2}\b/g) ?? [],
    ),
  ];
  // Retain the source wording. A publication date or "recent" bucket is not an active period.
  return {
    ...reference,
    title,
    description,
    routes,
    periodText: description.split('\n')[0],
  };
}
