import { RailStatusCode, RailStatusColor } from '@metro/shared/utils';

export interface RailStatusSourceLine {
  code: number;
  colorName: string;
  colorHex: string;
  line: string;
  statusCode: RailStatusCode;
  statusLabel: string;
  statusColor: RailStatusColor;
  description?: string;
  incidentCategory?: string;
  detail?: string;
}

export abstract class RailStatusSourcePort {
  abstract fetchRailStatusLines(): Promise<Map<number, RailStatusSourceLine>>;
}
