import { RailStatusSourcePort } from '@metro/rail-integration-contracts';
import { buildRailStatusLine, RAIL_LINES } from '@metro/shared/utils';
import { RailApiService } from './rail-api.service';
import { RailLine } from './entities/rail-line-status.entity';

function createLine(params: {
  code: number;
  statusCode?: 'DadosIndisponiveis' | 'OperacaoNormal' | 'VelocidadeReduzida';
  colorName?: string;
  colorHex?: string;
  line?: string;
  description?: string | null;
}): RailLine {
  return buildRailStatusLine<RailLine>({
    code: params.code,
    statusCode: params.statusCode ?? 'DadosIndisponiveis',
    colorName: params.colorName,
    colorHex: params.colorHex,
    line: params.line,
    description: params.description,
  });
}

describe('RailApiService', () => {
  it('returns only hardcoded rail lines from provider and cached status data', async () => {
    const unknownLine = createLine({
      code: -1,
      colorName: 'ERRO',
      colorHex: '#808080',
      line: '-1 - ERRO',
    });
    const providerLine = createLine({
      code: 1,
      statusCode: 'OperacaoNormal',
    });
    const cachedLine = createLine({
      code: 2,
      statusCode: 'VelocidadeReduzida',
      description: 'Trens circulam com maior tempo de parada.',
    });
    const railStatusSource = {
      fetchRailStatusLines: jest.fn().mockResolvedValue(
        new Map<number, RailLine>([
          [unknownLine.code, unknownLine],
          [providerLine.code, providerLine],
        ]),
      ),
    } as unknown as RailStatusSourcePort;
    const service = new RailApiService(railStatusSource);

    const result = await service.fetchMergedStatusWithDiagnostics(
      new Map<number, RailLine>([
        [unknownLine.code, unknownLine],
        [cachedLine.code, cachedLine],
      ]),
    );

    expect(result.sources[0]).toMatchObject({
      success: true,
      lineCount: 1,
    });
    expect(result.status?.lines).toHaveLength(RAIL_LINES.length);
    expect(result.status?.lines.some((line) => line.code === -1)).toBe(false);
    expect(result.status?.lines.map((line) => line.code)).toEqual(
      RAIL_LINES.map((line) => line.code),
    );
    expect(result.status?.lines.find((line) => line.code === 1)?.statusCode).toBe(
      'OperacaoNormal',
    );
    expect(result.status?.lines.find((line) => line.code === 2)?.statusCode).toBe(
      'VelocidadeReduzida',
    );
  });

});
