import { RailSpecialLinesService } from './rail-special-lines.service';

describe('RailSpecialLinesService', () => {
  const service = new RailSpecialLinesService();

  it('does not expose Expresso Linha 10 departures on São Paulo holidays', () => {
    const statuses = service.getSpecialLinesStatus(
      [],
      new Date('2026-07-09T07:00:00-03:00'),
      { isHoliday: true },
    );

    expect(statuses.find((line) => line.code === '10X')).toEqual(
      expect.objectContaining({
        statusCode: 'OperacaoEncerrada',
        nextDepartures: [],
      }),
    );
  });

  it('exposes Expresso Linha 10 departures during weekday peak service', () => {
    const statuses = service.getSpecialLinesStatus(
      [],
      new Date('2026-07-08T07:00:00-03:00'),
      { isHoliday: false },
    );

    expect(statuses.find((line) => line.code === '10X')).toEqual(
      expect.objectContaining({
        statusCode: 'OperacaoNormal',
        nextDepartures: expect.arrayContaining([
          { label: 'Santo André', time: '07:00' },
          { label: 'Tamanduateí', time: '07:10' },
        ]),
      }),
    );
  });
});
