import { BUS_TERMINAL_SUMMARY_FIXTURE } from '@metro/shared/bus-terminal-contracts';
import { aggregateTerminalSearchHits } from './terminal-search.utils';
import { busStopSearchResult, busRouteSearchResult } from '../testing/search.fixtures';

describe('terminal search aggregation', () => {
  const terminal = BUS_TERMINAL_SUMMARY_FIXTURE;
  const memberHit = () => busStopSearchResult({
    stop_id: terminal.stopIds[0], stop_name: terminal.name,
  });

  it('uses complete membership even when only one member was returned by search', () => {
    const results = aggregateTerminalSearchHits([memberHit()], [terminal], terminal.name);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ type: 'busTerminal', document: terminal });
    expect(terminal.stopIds.length).toBeGreaterThan(1);
  });

  it('matches terminal aliases without requiring a member in the stop search page', () => {
    expect(aggregateTerminalSearchHits([], [terminal], terminal.name))
      .toEqual([{ type: 'busTerminal', document: terminal, score: 0 }]);
  });

  it('does not turn an unlabeled platform number into a terminal-name match', () => {
    expect(aggregateTerminalSearchHits([], [terminal], '3')).toEqual([]);
  });

  it('matches the common abbreviated query without granting new stop membership', () => {
    const domPedro = {
      ...terminal, name: 'Terminal Parque Dom Pedro II', aliases: [],
    };
    expect(aggregateTerminalSearchHits([], [domPedro], 'TERM. PQ. D. PEDRO II'))
      .toEqual([{ type: 'busTerminal', document: domPedro, score: 0 }]);
  });

  it('retains route identities and surrounding unverified stops', () => {
    const route = busRouteSearchResult();
    const street = busStopSearchResult({ stop_id: 'outside', stop_name: 'Praça Central' });
    const results = aggregateTerminalSearchHits([memberHit(), route, street], [terminal], terminal.name);
    expect(results.slice(1)).toEqual([route, street]);
  });

  it.each(['plataforma 3', 'Plat. A', 'Pl. 02', 'Pl. B2'])(
    'preserves boarding points for a specific platform query: %s', (platform) => {
      const hit = memberHit();
      expect(aggregateTerminalSearchHits([hit], [terminal], `${terminal.name} ${platform}`))
        .toEqual([hit]);
    },
  );

  it('preserves exact source-stop identifiers', () => {
    const hit = memberHit();
    expect(aggregateTerminalSearchHits([hit], [terminal], terminal.stopIds[0])).toEqual([hit]);
  });

  it('fails closed for a stop claimed by conflicting catalog groups', () => {
    const hit = memberHit();
    const conflict = { ...terminal, id: 'terminal:other', name: 'Terminal Other', aliases: [] };
    const results = aggregateTerminalSearchHits([hit], [terminal, conflict], 'unmatched');
    expect(results).toEqual([hit]);
  });

  it('does not mutate the cached catalog or search page during grouping', () => {
    const hit = memberHit();
    const snapshot = JSON.stringify({ terminal, hit });
    aggregateTerminalSearchHits([hit, hit], [terminal], terminal.name);
    expect(JSON.stringify({ terminal, hit })).toBe(snapshot);
  });
});
