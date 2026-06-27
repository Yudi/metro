import {
  BikeStation,
  FeatureCreationSource,
} from '../components/map/map.types';

export function createBikeStationFeatureProperties(
  station: BikeStation,
  isSelected: boolean,
  creationSource: FeatureCreationSource = FeatureCreationSource.BIKE,
): Record<string, unknown> {
  return {
    id: station.stationId,
    stationId: station.stationId,
    name: station.name,
    type: 'bike_station',
    creationSource,
    isSelected,
    bikesAvailable: station.numBikesAvailable,
    docksAvailable: station.numDocksAvailable,
    bikesDisabled: station.numBikesDisabled,
    docksDisabled: station.numDocksDisabled,
    capacity: station.capacity,
    effectiveCapacity: station.effectiveCapacity,
    status: station.status,
    lastReported: station.lastReported,
    lastReportedIso: station.lastReportedIso,
    fetchedAt: station.fetchedAt,
    address: station.address ?? null,
    isInstalled: station.isInstalled,
    isRenting: station.isRenting,
    isReturning: station.isReturning,
    electricBikesAvailable: station.electricBikesAvailable,
    hasElectricBikesAvailable: station.hasElectricBikesAvailable,
    vehicleAvailability: station.vehicleAvailability,
    stationData: station,
  };
}
