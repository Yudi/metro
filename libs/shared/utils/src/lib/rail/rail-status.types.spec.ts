import {
  getStatusCodeFromLabel,
  getStatusColorClass,
  hasStatusIssue,
  STATUS_CODE_TO_COLOR,
} from './rail-status.types';

describe('yellow rail statuses', () => {
  it.each([
    ['Maiores Intervalos', 'MaioresIntervalos'],
    ['Operação Diferenciada', 'OperacaoDiferenciada'],
  ] as const)('recognizes %s as a yellow issue', (label, code) => {
    expect(getStatusCodeFromLabel(label)).toBe(code);
    expect(STATUS_CODE_TO_COLOR[code]).toBe('amarelo');
    expect(getStatusColorClass(code)).toBe('status-warning');
    expect(hasStatusIssue(code)).toBe(true);
  });
});
