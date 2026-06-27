import type { SpecialCptmLineCode } from './cptm-stations';

export interface SpecialRailServiceStation {
  stationCode: string;
  name: string;
  latitude: number;
  longitude: number;
}

export interface SpecialRailService {
  code: SpecialCptmLineCode;
  name: string;
  colorHex: string;
  textColorHex: string;
  stations: SpecialRailServiceStation[];
}
