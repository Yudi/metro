import { mergeSubwayStations, type RawStation } from './subway-station-merge.utils';

function station(stopId: string, name: string, lineCode: number): RawStation {
  return {
    id: lineCode,
    stop_id: stopId,
    stop_name: name,
    stop_lat: -23.525,
    stop_lon: -46.667,
    agencies: [],
    route_short_names: [`L${lineCode}`],
  };
}

describe('mergeSubwayStations', () => {
  it('merges Palmeiras-Barra Funda dash variants and retains every stop and line', () => {
    const result = mergeSubwayStations([
      station('l3', 'Palmeiras-Barra Funda', 3),
      station('l8', 'Palmeiras–Barra Funda', 8),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      name: 'Palmeiras-Barra Funda',
      mergedStopIds: ['l3', 'l8'],
      routeShortNames: ['L3', 'L8'],
    });
  });

  it('keeps Água Branca lines separate while merging stops within the same line', () => {
    const result = mergeSubwayStations([
      station('l6-a', 'Água Branca', 6),
      station('l6-b', 'Água Branca (linha 6)', 6),
      station('l7', 'Água Branca', 7),
    ]);

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      name: 'Água Branca (linha 6)',
      mergedStopIds: ['l6-a', 'l6-b'],
      routeShortNames: ['L6'],
    });
    expect(result[1]).toMatchObject({
      name: 'Água Branca (linha 7)',
      mergedStopIds: ['l7'],
      routeShortNames: ['L7'],
    });
  });
});
