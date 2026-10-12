import { BUS_TERMINAL_SUMMARY_FIXTURE } from '@metro/shared/bus-terminal-contracts';
import type { SearchResult } from '../map-main/components/search-dialog/search-result-card/search-result-card.component';
import { resultKind, resultQueryParams } from './omnibox-result-link';

describe('terminal omnibox links', () => {
  const result: SearchResult = {
    id: BUS_TERMINAL_SUMMARY_FIXTURE.id,
    name: BUS_TERMINAL_SUMMARY_FIXTURE.name,
    type: 'bus_terminal',
    latitude: BUS_TERMINAL_SUMMARY_FIXTURE.latitude,
    longitude: BUS_TERMINAL_SUMMARY_FIXTURE.longitude,
    terminalData: BUS_TERMINAL_SUMMARY_FIXTURE,
  };

  it('routes terminal search results to a dedicated terminal detail page', () => {
    expect(resultKind(result)).toBe('bus-terminal');
  });

  it('keeps the search query and terminal coordinates on the deep link', () => {
    expect(resultQueryParams(result, '  terminal parque central ')).toEqual({
      q: 'terminal parque central',
      name: BUS_TERMINAL_SUMMARY_FIXTURE.name,
      lat: BUS_TERMINAL_SUMMARY_FIXTURE.latitude,
      lon: BUS_TERMINAL_SUMMARY_FIXTURE.longitude,
      lines: undefined,
    });
  });
});
