export type GbfsFeedName =
  | 'station_information'
  | 'station_status'
  | 'system_pricing_plans'
  | 'vehicle_types';

export interface GbfsLocalizedText {
  text: string;
  language: string;
}

export interface GbfsResponse<T> {
  last_updated: string;
  ttl: number;
  data: T;
  version: '3.0';
}

export interface GbfsAutoDiscovery {
  feeds: {
    name: string;
    url: string;
  }[];
}

export interface GbfsStationInformation {
  station_id: string;
  name: GbfsLocalizedText[];
  lat: number;
  lon: number;
  address?: string | null;
  capacity: number | null;
  is_virtual_station?: boolean;
}

export interface GbfsStationInformationData {
  stations: GbfsStationInformation[];
}

export interface GbfsStationStatus {
  station_id: string;
  num_vehicles_available: number;
  num_vehicles_disabled: number;
  num_docks_available: number;
  num_docks_disabled: number;
  is_installed: boolean;
  is_renting: boolean;
  is_returning: boolean;
  last_reported: string;
  vehicle_types_available?: {
    vehicle_type_id: string;
    count: number;
  }[];
}

export interface GbfsStationStatusData {
  stations: GbfsStationStatus[];
}

export interface GbfsVehicleType {
  vehicle_type_id: string;
  form_factor: string;
  propulsion_type: string;
  max_range_meters?: number | null;
  name: GbfsLocalizedText[];
  default_pricing_plan_id?: string | null;
}

export interface GbfsVehicleTypesData {
  vehicle_types: GbfsVehicleType[];
}

export interface GbfsPerMinutePricing {
  start: number;
  end?: number | null;
  interval: number;
  rate: number;
}

export interface GbfsPricingPlan {
  plan_id: string;
  name: GbfsLocalizedText[];
  currency: string;
  price: number;
  description?: GbfsLocalizedText[];
  per_min_pricing?: GbfsPerMinutePricing[];
}

export interface GbfsPricingPlansData {
  plans: GbfsPricingPlan[];
}
