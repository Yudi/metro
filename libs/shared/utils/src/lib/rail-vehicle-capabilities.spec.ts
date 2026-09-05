import * as sources from './search.utils';
import { extractTrackedRailVehicleLineCode, hasExternalRailVehicles } from './cptm-stations';

describe('rail vehicle stream availability', () => {
  afterEach(() => jest.restoreAllMocks());

  it('respects configured source availability', () => {
    expect(hasExternalRailVehicles('L8')).toBe(true);
    expect(hasExternalRailVehicles('L9')).toBe(true);
    jest.spyOn(sources, 'getLiveTrainTrackingApiIds').mockReturnValue([]);
    expect(hasExternalRailVehicles('L8')).toBe(false);
    expect(hasExternalRailVehicles('L9')).toBe(false);
    expect(extractTrackedRailVehicleLineCode('CPTM L9-ESMERALDA')).toBeUndefined();
    expect(extractTrackedRailVehicleLineCode('CPTM L9-ESMERALDA', false)).toBe('L9');
    expect(hasExternalRailVehicles('L4')).toBe(true);
    expect(hasExternalRailVehicles('L3')).toBe(false);
  });

  it('matches complete line identifiers in route names', () => {
    expect(extractTrackedRailVehicleLineCode('CPTM L9-ESMERALDA')).toBe('L9');
    expect(extractTrackedRailVehicleLineCode('L8')).toBe('L8');
    expect(extractTrackedRailVehicleLineCode('L10')).toBe('L10');
    expect(extractTrackedRailVehicleLineCode('L90')).toBeUndefined();
    expect(extractTrackedRailVehicleLineCode('SPECIAL4')).toBeUndefined();
  });
});
