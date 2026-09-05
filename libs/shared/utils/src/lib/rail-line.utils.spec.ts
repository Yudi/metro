import { describe, expect, it } from '@jest/globals';

import {
  getRailLineByCode,
  getRailLinesByAgency,
  LINE_AGENCY_MAPPING,
  RAIL_LINE_TRAFFIC_HANDS,
  RAIL_LINES,
} from './rail-line.utils';
import {
  getLiveTrainTrackingApiIds,
  hasLiveTrainTrackingLine,
} from './search.utils';
import {
  AGENCIES_DATA,
  getRouteAgency,
  TransitAgency,
  TRIVIATRENS_LIVE_DATA_ENABLED,
} from './transit-agency.utils';

describe('Linha 17 agency', () => {
  it('registers Linha 17 as operated by Metro', () => {
    expect(getRailLineByCode(17)?.agency).toBe(TransitAgency.METRO);
    expect(getRouteAgency('L17')).toBe(TransitAgency.METRO);
    expect(
      getRailLinesByAgency(TransitAgency.METRO).some(
        (line) => line.code === 17,
      ),
    ).toBe(true);
    expect(
      getRailLinesByAgency(TransitAgency.VIAMOBILIDADE).some(
        (line) => line.code === 17,
      ),
    ).toBe(false);
  });
});

describe('rail line traffic hand', () => {
  it('records LHT for Lines 7 and 10 through 13', () => {
    expect(
      [7, 10, 11, 12, 13].map((lineCode) =>
        RAIL_LINE_TRAFFIC_HANDS[lineCode],
      ),
    ).toEqual(['LHT', 'LHT', 'LHT', 'LHT', 'LHT']);
  });

  it('records RHT for every other cataloged line and Line 17', () => {
    expect(
      RAIL_LINES.every(
        (line) => RAIL_LINE_TRAFFIC_HANDS[line.code] === 'RHT' ||
          [7, 10, 11, 12, 13].includes(line.code),
      ),
    ).toBe(true);
    expect(RAIL_LINE_TRAFFIC_HANDS[6]).toBe('RHT');
    expect(RAIL_LINE_TRAFFIC_HANDS[17]).toBe('RHT');
  });
});

describe('Motiva agency', () => {
  it('registers Linha 4 and Linha 5 as operated by Motiva', () => {
    expect(getRailLineByCode(4)?.agency).toBe(TransitAgency.MOTIVA);
    expect(getRailLineByCode(5)?.agency).toBe(TransitAgency.MOTIVA);
    expect(getRouteAgency('L4')).toBe(TransitAgency.MOTIVA);
    expect(getRouteAgency('L5')).toBe(TransitAgency.MOTIVA);
    expect(LINE_AGENCY_MAPPING[4]).toBe(TransitAgency.MOTIVA);
    expect(LINE_AGENCY_MAPPING[5]).toBe(TransitAgency.MOTIVA);
  });

  it('does not treat Linha 5 as a live train tracking line', () => {
    expect(hasLiveTrainTrackingLine([4])).toBe(true);
    expect(hasLiveTrainTrackingLine([5])).toBe(false);
    expect(hasLiveTrainTrackingLine([8])).toBe(true);
    expect(hasLiveTrainTrackingLine([9])).toBe(true);
  });

  it('keeps live train tracking APIs separate from line operators', () => {
    expect(getLiveTrainTrackingApiIds([4])).toEqual(['api3', 'api1']);
    expect(getLiveTrainTrackingApiIds([5])).toEqual([]);
    expect(getLiveTrainTrackingApiIds([8, 9])).toEqual(['api2']);
    expect(getLiveTrainTrackingApiIds([10, 11, 12, 13])).toEqual(['api1']);
    expect(getLiveTrainTrackingApiIds([4, 5, 8, 10])).toEqual([
      'api3',
      'api2',
      'api1',
    ]);
  });
});

describe('LinhaUni agency', () => {
  it('registers Linha 6 as operated by LinhaUni', () => {
    expect(getRailLineByCode(6)).toMatchObject({
      agency: TransitAgency.LINHAUNI,
      colorHex: '#F47322',
      carCount: 6,
      carDoorCount: 4,
      stations: expect.arrayContaining([
        expect.objectContaining({ code: 'BRA', name: 'Brasilândia' }),
        expect.objectContaining({ code: 'JQM', name: 'São Joaquim' }),
      ]),
    });
    expect(getRouteAgency('L6')).toBe(TransitAgency.LINHAUNI);
    expect(LINE_AGENCY_MAPPING[6]).toBe(TransitAgency.LINHAUNI);
    expect(
      getRailLinesByAgency(TransitAgency.LINHAUNI).some(
        (line) => line.code === 6,
      ),
    ).toBe(true);
  });
});

describe('Trivia Trens agency', () => {
  it('registers Lines 11, 12, and 13 as operated by Trivia Trens', () => {
    for (const lineCode of [11, 12, 13]) {
      expect(getRailLineByCode(lineCode)?.agency).toBe(
        TransitAgency.TRIVIATRENS,
      );
      expect(getRouteAgency(`L${lineCode}`)).toBe(TransitAgency.TRIVIATRENS);
      expect(LINE_AGENCY_MAPPING[lineCode]).toBe(TransitAgency.TRIVIATRENS);
    }

    expect(AGENCIES_DATA[TransitAgency.TRIVIATRENS].contact).toMatchObject({
      phones: [
        {
          number: '08000746733',
          whatsapp: true,
        },
      ],
      site: 'https://triviatrens.com.br/',
    });
  });

  it('keeps Trivia Trens live data controlled by one switch', () => {
    expect(TRIVIATRENS_LIVE_DATA_ENABLED).toBe(true);
    expect(getLiveTrainTrackingApiIds([11, 12, 13])).toEqual(['api1']);
  });
});
