import type { OperationalNotice } from '../../services/bus-information.service';

export interface RouteNoticeView {
  id: string;
  title: string;
  period: string | null;
  reason: string | null;
  directions: { label: string; text: string }[];
  details: string | null;
  sourceUrl: string | null;
}

/** Scope source prose to explicit route headings; never guess a route or active time. */
export function routeNoticeView(notice: OperationalNotice, routeCode: string): RouteNoticeView {
  const lines = notice.description.split('\n').map((line) => line.trim()).filter(Boolean);
  const groups: { routes: string[]; lines: string[] }[] = [];
  let group = { routes: [] as string[], lines: [] as string[] };
  for (const line of lines) {
    const route = /^([0-9A-Z]{4}-\d{2})(?=\s|$)/i.exec(line);
    if (route) {
      if (group.lines.length) { groups.push(group); group = { routes: [], lines: [] }; }
      group.routes.push(...(line.toUpperCase().match(/\b[0-9A-Z]{4}-\d{2}\b/g) ?? []));
    } else if (/\b[0-9A-Z]{4}-\d{2}\b/i.test(line)) {
      // A changed/ambiguous route heading is a boundary too. Never attach the
      // following instructions to the preceding route just because markup drifted.
      if (group.routes.length) groups.push(group);
      group = { routes: [], lines: [] };
    } else if (group.routes.length) {
      group.lines.push(line);
    }
  }
  if (group.routes.length) groups.push(group);
  const matching = groups.filter((item) => item.routes.includes(routeCode));
  const directions: RouteNoticeView['directions'] = [];
  const details: string[] = [];
  for (const item of matching) {
    let direction: { label: string; text: string } | null = null;
    for (const line of item.lines) {
      const heading = /^(Ida|Volta|Sentido único)\s*:\s*(.*)$/i.exec(line);
      if (heading) {
        direction = { label: heading[1], text: heading[2] };
        directions.push(direction);
      } else if (direction) {
        direction.text += `\n${line}`;
      } else {
        details.push(line);
      }
    }
  }
  const period = notice.periodText.trim();
  const firstRouteLine = lines.findIndex((line) => /\b[0-9A-Z]{4}-\d{2}\b/i.test(line));
  const introduction = firstRouteLine < 0 ? lines : lines.slice(0, firstRouteLine);
  const reason = introduction.find((line) => /^Motivo\s*:/i.test(line))?.replace(/^Motivo\s*:\s*/i, '') ?? null;
  return {
    id: notice.sourceId, title: notice.title,
    period: /\d{1,2}\/\d{1,2}|\b(?:das|dia|dias|até|entre|partir|feira|sábado|domingo)\b/i.test(period) ? period : null,
    reason, directions, details: details.join('\n') || null,
    sourceUrl: /^https:\/\/www\.sptrans\.com\.br\/informativos\/[a-z-]+\/[a-z0-9-]+\/\d+\/?$/.test(notice.sourceUrl)
      ? notice.sourceUrl : null,
  };
}
