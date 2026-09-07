import type {
  BikePricingPlan,
  BikeStation,
  BikeVehicleAvailability,
} from './bus-data.types';

// Mock Bike Stations

const PRICING_PLAN_FIT: BikePricingPlan = {
  planId: '243',
  name: 'Avulso dia de semana',
  currency: 'BRL',
  initialPrice: 6.9,
  initialPriceFormatted: 'R$ 6,90',
  activationFee: null,
  activationFeeFormatted: null,
  perMinuteRate: 0.49,
  perMinuteRateFormatted: 'R$ 0,49/min',
  perMinuteChargingStartsAfterMinutes: 15,
  maxUsageMinutes: null,
};

const PRICING_PLAN_EFIT: BikePricingPlan = {
  planId: '247-121',
  name: 'Mensal',
  currency: 'BRL',
  initialPrice: 43.9,
  initialPriceFormatted: 'R$ 43,90',
  activationFee: 9.99,
  activationFeeFormatted: 'R$ 9,99',
  perMinuteRate: 0.39,
  perMinuteRateFormatted: 'R$ 0,39/min',
  perMinuteChargingStartsAfterMinutes: 60,
  maxUsageMinutes: 120,
};

const VEHICLE_FIT: BikeVehicleAvailability = {
  vehicleTypeId: 'FIT',
  name: 'FIT',
  formFactor: 'bicycle',
  propulsionType: 'human',
  count: 5,
  maxRangeMeters: null,
  pricingPlan: PRICING_PLAN_FIT,
};

const VEHICLE_EFIT: BikeVehicleAvailability = {
  vehicleTypeId: 'EFIT',
  name: 'EFIT',
  formFactor: 'bicycle',
  propulsionType: 'electric_assist',
  count: 2,
  maxRangeMeters: null,
  pricingPlan: PRICING_PLAN_EFIT,
};

const VEHICLE_FIT_EMPTY: BikeVehicleAvailability = {
  ...VEHICLE_FIT,
  count: 0,
};

const VEHICLE_EFIT_EMPTY: BikeVehicleAvailability = {
  ...VEHICLE_EFIT,
  count: 0,
};

export const BIKE_STATION_FULL: BikeStation = {
  stationId: 'station-1',
  name: 'Estação Paulista',
  latitude: -23.5614,
  longitude: -46.656,
  address: 'Av. Paulista, 1000',
  capacity: 20,
  effectiveCapacity: 20,
  numBikesAvailable: 7,
  numBikesDisabled: 1,
  numDocksAvailable: 12,
  numDocksDisabled: 0,
  status: 'IN_SERVICE',
  isInstalled: true,
  isRenting: true,
  isReturning: true,
  lastReported: Date.now(),
  lastReportedIso: new Date().toISOString(),
  fetchedAt: Date.now(),
  electricBikesAvailable: 2,
  hasElectricBikesAvailable: true,
  vehicleAvailability: [VEHICLE_FIT, VEHICLE_EFIT],
  detailsLoaded: true,
};

export const BIKE_STATION_EMPTY: BikeStation = {
  stationId: 'station-2',
  name: 'Estação Faria Lima',
  latitude: -23.5669,
  longitude: -46.6918,
  address: 'Av. Brigadeiro Faria Lima, 500',
  capacity: 15,
  effectiveCapacity: 15,
  numBikesAvailable: 0,
  numBikesDisabled: 2,
  numDocksAvailable: 13,
  numDocksDisabled: 0,
  status: 'IN_SERVICE',
  isInstalled: true,
  isRenting: true,
  isReturning: true,
  lastReported: Date.now(),
  lastReportedIso: new Date().toISOString(),
  fetchedAt: Date.now(),
  electricBikesAvailable: 0,
  hasElectricBikesAvailable: false,
  vehicleAvailability: [VEHICLE_FIT_EMPTY, VEHICLE_EFIT_EMPTY],
  detailsLoaded: true,
};

export const BIKE_STATION_NO_DOCKS: BikeStation = {
  stationId: 'station-3',
  name: 'Estação República',
  latitude: -23.5437,
  longitude: -46.6422,
  address: 'Praça da República, 100',
  capacity: 10,
  effectiveCapacity: 10,
  numBikesAvailable: 10,
  numBikesDisabled: 0,
  numDocksAvailable: 0,
  numDocksDisabled: 0,
  status: 'IN_SERVICE',
  isInstalled: true,
  isRenting: true,
  isReturning: true,
  lastReported: Date.now(),
  lastReportedIso: new Date().toISOString(),
  fetchedAt: Date.now(),
  electricBikesAvailable: 3,
  hasElectricBikesAvailable: true,
  vehicleAvailability: [
    { ...VEHICLE_FIT, count: 7 },
    { ...VEHICLE_EFIT, count: 3 },
  ],
  detailsLoaded: true,
};

export const BIKE_STATION_LOADING: BikeStation = {
  stationId: 'station-4',
  name: 'Estação Consolação',
  latitude: -23.5563,
  longitude: -46.6602,
  address: 'Rua da Consolação, 300',
  capacity: 12,
  effectiveCapacity: 12,
  numBikesAvailable: 0,
  numBikesDisabled: 0,
  numDocksAvailable: 0,
  numDocksDisabled: 0,
  status: 'IN_SERVICE',
  isInstalled: true,
  isRenting: true,
  isReturning: true,
  lastReported: Date.now(),
  lastReportedIso: new Date().toISOString(),
  fetchedAt: Date.now(),
  electricBikesAvailable: 0,
  hasElectricBikesAvailable: false,
  vehicleAvailability: [],
  detailsLoaded: false,
};

export const BIKE_STATION_OUT_OF_SERVICE: BikeStation = {
  stationId: 'station-5',
  name: 'Estação Liberdade',
  latitude: -23.5568,
  longitude: -46.6345,
  address: 'Av. Liberdade, 200',
  capacity: 8,
  effectiveCapacity: 8,
  numBikesAvailable: 0,
  numBikesDisabled: 8,
  numDocksAvailable: 0,
  numDocksDisabled: 0,
  status: 'OUT_OF_SERVICE',
  isInstalled: true,
  isRenting: false,
  isReturning: false,
  lastReported: Date.now() - 3600000, // 1 hour ago
  lastReportedIso: new Date(Date.now() - 3600000).toISOString(),
  fetchedAt: Date.now(),
  electricBikesAvailable: 0,
  hasElectricBikesAvailable: false,
  vehicleAvailability: [],
  detailsLoaded: true,
};
