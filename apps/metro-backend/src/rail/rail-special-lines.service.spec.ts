import { RailSpecialLinesService } from './rail-special-lines.service';
import { RailSpecialStatusSourceLine } from '@metro/rail-integration-contracts';

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

  it('uses an external Expresso Aeroporto disruption instead of the schedule', () => {
    const externalStatus: RailSpecialStatusSourceLine = {
      code: 'EA',
      statusCode: 'Paralisada',
      statusLabel: 'Operação Paralisada',
      statusColor: 'vermelho',
      description: 'Serviço temporariamente paralisado.',
    };

    const statuses = service.getSpecialLinesStatus(
      [],
      new Date('2026-07-08T07:00:00-03:00'),
      {},
      externalStatus,
    );

    expect(statuses.find((line) => line.code === 'EA')).toEqual(
      expect.objectContaining({
        statusCode: 'Paralisada',
        statusLabel: 'Operação Paralisada',
        nextDepartures: [],
        issues: [
          {
            code: 0,
            line: 'Expresso Aeroporto',
            description: 'Serviço temporariamente paralisado.',
          },
        ],
      }),
    );
  });
});
