import { RailSpecialStatusSourceLine } from '@metro/rail-integration-contracts';
import { RailSpecialResolver } from './rail-special.resolver';

describe('RailSpecialResolver', () => {
  const status: RailSpecialStatusSourceLine = {
    code: 'EA',
    statusCode: 'OperacaoNormal',
    statusLabel: 'Operação Normal',
    statusColor: 'verde',
    description: 'Operação normal.',
  };

  function createResolver(fetchSpecialRailStatusLines: jest.Mock) {
    return new RailSpecialResolver(
      { getLinesStatus: jest.fn().mockResolvedValue({ lines: [] }) } as never,
      { getSpecialLinesStatus: jest.fn().mockReturnValue([]) } as never,
      {} as never,
      {} as never,
      { isHolidayInSaoPaulo: jest.fn().mockResolvedValue(false) } as never,
      { fetchSpecialRailStatusLines } as never,
    );
  }

  it('coalesces concurrent special-status requests and caches the result', async () => {
    let releaseFetch!: (
      lines: Map<string, RailSpecialStatusSourceLine>,
    ) => void;
    const fetchSpecialRailStatusLines = jest.fn(
      () =>
        new Promise<Map<string, RailSpecialStatusSourceLine>>((resolve) => {
          releaseFetch = resolve;
        }),
    );
    const resolver = createResolver(fetchSpecialRailStatusLines);

    const firstRequest = resolver.getSpecialLinesStatus();
    const secondRequest = resolver.getSpecialLinesStatus();

    expect(fetchSpecialRailStatusLines).toHaveBeenCalledTimes(1);
    releaseFetch(new Map([[status.code, status]]));
    await Promise.all([firstRequest, secondRequest]);

    await resolver.getSpecialLinesStatus();
    expect(fetchSpecialRailStatusLines).toHaveBeenCalledTimes(1);
  });

  it('backs off after an upstream failure', async () => {
    const fetchSpecialRailStatusLines = jest
      .fn()
      .mockRejectedValue(new Error('unavailable'));
    const resolver = createResolver(fetchSpecialRailStatusLines);

    await resolver.getSpecialLinesStatus();
    await resolver.getSpecialLinesStatus();

    expect(fetchSpecialRailStatusLines).toHaveBeenCalledTimes(1);
  });
});
