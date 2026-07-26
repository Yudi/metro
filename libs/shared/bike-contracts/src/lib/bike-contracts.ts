export interface BikePricingPlan {
  planId: string;
  name: string;
  currency: string;
  initialPrice: number;
  initialPriceFormatted: string;
  activationFee: number | null;
  activationFeeFormatted: string | null;
  perMinuteRate: number | null;
  perMinuteRateFormatted: string | null;
  perMinuteChargingStartsAfterMinutes: number;
  maxUsageMinutes: number | null;
}

export interface BikeVehicleAvailability {
  vehicleTypeId: string;
  name: string;
  formFactor: string;
  propulsionType: string;
  count: number;
  maxRangeMeters: number | null;
  pricingPlan: BikePricingPlan | null;
}
