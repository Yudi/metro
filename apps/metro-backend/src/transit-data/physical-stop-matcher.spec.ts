import { extractBusPlatform, matchPhysicalStops, PhysicalStopCandidate } from './physical-stop-matcher';

const pair = (overrides: Partial<PhysicalStopCandidate> = {}): PhysicalStopCandidate => ({
  sptransStopId: '350002754',
  artespStopId: 'artesp:601',
  sptransName: 'R. Tibúrcio De Souza, 3200',
  artespName: 'Rua Tibúrcio de Souza, 3200 - São Paulo - SP, Brasil',
  distanceMeters: 0.62,
  ...overrides,
});

describe('physical bus stop matching', () => {
  it('merges a source-backed address match while retaining both original identities', () => {
    expect(matchPhysicalStops([pair()])).toEqual([
      { sptransStopId: '350002754', artespStopId: 'artesp:601' },
    ]);
  });

  it.each([
    { artespName: 'R. Tibúrcio de Souza, 3201' },
    { artespName: 'R. Tibúrcio de Souza, 3200 (oposto)' },
    { artespName: 'R. Tibúrcio de Souza, 3200 B/C', sptransName: 'R. Tibúrcio de Souza, 3200 C/B' },
    { artespPlatform: 'A', sptransPlatform: 'B' },
    { artespPlatform: 'A' },
    { artespName: 'Rua Totalmente Diferente, 3200' },
    { distanceMeters: 10.01 },
    { distanceMeters: Number.NaN },
  ])('preserves separate boarding points for conflicting or insufficient evidence: %p', (overrides) => {
    expect(matchPhysicalStops([pair(overrides)])).toEqual([]);
  });

  it('matches only mutual nearest neighbours, rejecting near-equal alternatives', () => {
    expect(matchPhysicalStops([
      pair(), pair({ artespStopId: 'artesp:602', distanceMeters: 0.8 }),
    ])).toEqual([]);
    expect(matchPhysicalStops([
      pair(), pair({ sptransStopId: 'other', distanceMeters: 3 }),
    ])).toEqual([{ sptransStopId: '350002754', artespStopId: 'artesp:601' }]);
  });

  it('does not match a farther compatible stop when the nearest has conflicting evidence', () => {
    expect(matchPhysicalStops([
      pair({ artespPlatform: 'A' }),
      pair({ artespStopId: 'artesp:602', distanceMeters: 4 }),
    ])).toEqual([]);
  });

  it('recognizes explicit platform metadata in both feeds without inventing it', () => {
    expect(extractBusPlatform('Terminal Barra Funda Lado Norte Plat. A')).toBe('A');
    expect(extractBusPlatform('Terminal', 'Plataforma 12')).toBe('12');
    expect(extractBusPlatform('Terminal', null, 'B2')).toBe('B2');
    expect(extractBusPlatform('Rua das Flores, 12')).toBeUndefined();
  });
});
