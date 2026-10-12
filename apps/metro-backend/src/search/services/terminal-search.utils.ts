import type { BusTerminalSummary } from '@metro/shared/bus-terminal-contracts';
import {
  normalizeTerminalSearchText,
  parseBusTerminalStop,
} from '../../bus-terminals/bus-terminal-catalog.utils';
import type { SearchResult, StopDocument } from './typesense.types';

export interface TerminalSearchHit {
  type: 'busTerminal';
  document: BusTerminalSummary;
  score?: number;
  highlights?: Record<string, unknown>;
}

export type TerminalAwareSearchHit = SearchResult | TerminalSearchHit;

/** Membership comes from the full catalog, never from a page of search hits. */
export function aggregateTerminalSearchHits(
  hits: readonly SearchResult[],
  catalog: readonly BusTerminalSummary[],
  query: string,
): TerminalAwareSearchHit[] {
  const normalized = normalizeTerminalSearchText(query);
  if (!normalized) return [...hits];
  // A precise boarding point request must retain its original identity.
  const specificPlatform = /\b(?:plataforma|plat|pl)(?:[.\s]+[a-z0-9]{1,3}|\d{1,3})\b/i.test(query);
  const exactStop = catalog.some((terminal) => terminal.stopIds.includes(query.trim())) ||
    hits.some((hit) => hit.type === 'busStop' &&
      [(hit.document as StopDocument).stop_id, (hit.document as StopDocument).sourceId]
        .includes(query.trim()));
  if (specificPlatform || exactStop) return [...hits];

  const byStopId = new Map<string, BusTerminalSummary>();
  const ambiguousIds = new Set<string>();
  for (const terminal of catalog) {
    for (const stopId of terminal.stopIds) {
      if (byStopId.has(stopId) && byStopId.get(stopId)?.id !== terminal.id) ambiguousIds.add(stopId);
      byStopId.set(stopId, terminal);
    }
  }
  for (const id of ambiguousIds) byStopId.delete(id);
  const terminals = new Map<string, TerminalSearchHit>();
  const individual: SearchResult[] = [];
  for (const hit of hits) {
    const terminal = hit.type === 'busStop'
      ? byStopId.get((hit.document as StopDocument).stop_id)
      : undefined;
    if (!terminal) {
      individual.push(hit);
      continue;
    }
    const previous = terminals.get(terminal.id);
    if (!previous || (hit.score ?? 0) > (previous.score ?? 0)) {
      terminals.set(terminal.id, { type: 'busTerminal', document: terminal, score: hit.score });
    }
  }
  // Search spelling aliases may match even when the stop index uses expanded names.
  const tokens = normalized.split(/\s+/);
  for (const terminal of catalog) {
    const matches = [terminal.name, ...terminal.aliases].some((alias) => {
      const label = parseBusTerminalStop(alias)?.name ?? alias;
      const words = normalizeTerminalSearchText(label).split(/\s+/);
      return tokens.every((token) => words.some((word) =>
        token.length >= 3 ? word.startsWith(token) : word === token,
      ));
    });
    if (matches && !terminals.has(terminal.id)) {
      terminals.set(terminal.id, { type: 'busTerminal', document: terminal, score: 0 });
    }
  }
  return [...terminals.values(), ...individual];
}
