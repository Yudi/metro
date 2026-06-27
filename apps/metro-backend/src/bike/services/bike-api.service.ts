import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { AxiosResponse } from 'axios';
import {
  BikeStationDto,
  BikeStationsPayloadDto,
  BikeVehicleAvailabilityDto,
  BikePricingPlanDto,
} from '../dto/bike.dto';

import { isWeekend } from 'date-fns';

interface GbfsResponse<T> {
  last_updated: number;
  ttl: number;
  data: T;
}

interface StationInformation {
  station_id: string;
  name: string;
  lat: number;
  lon: number;
  address?: string | null;
  capacity: number | null;
  is_virtual_station?: boolean;
}

interface StationInformationWrapper {
  stations: StationInformation[];
}

interface StationStatus {
  station_id: string;
  num_bikes_available: number;
  num_bikes_disabled: number;
  num_docks_available: number;
  num_docks_disabled: number;
  is_installed: boolean;
  is_renting: boolean;
  is_returning: boolean;
  status: string;
  last_reported: number;
  vehicle_types_available?: {
    vehicle_type_id: string;
    count: number;
  }[];
}

interface StationStatusWrapper {
  stations: StationStatus[];
}

interface VehicleType {
  vehicle_type_id: string;
  form_factor: string;
  propulsion_type: string;
  max_range_meters?: number | null;
  name: string;
  default_pricing_plan_id?: string | null;
}

interface VehicleTypeWrapper {
  vehicle_types: VehicleType[];
}

interface PerMinutePricing {
  start: number;
  end?: number | null;
  interval: number;
  rate: number;
}

interface PricingPlan {
  plan_id: string;
  name: string;
  currency: string;
  price: number;
  description?: string;
  per_min_pricing?: PerMinutePricing[];
}

interface PricingPlansWrapper {
  plans: PricingPlan[];
}

@Injectable()
export class BikeApiService {
  private readonly logger = new Logger(BikeApiService.name);

  private readonly stationInformationUrl =
    'https://saopaulo.publicbikesystem.net/customer/gbfs/v2/en/station_information';
  private readonly stationStatusUrl =
    'https://saopaulo.publicbikesystem.net/customer/gbfs/v2/en/station_status';
  private readonly vehicleTypesUrl =
    'https://saopaulo.publicbikesystem.net/customer/gbfs/v2/en/vehicle_types';
  private readonly pricingPlansUrl =
    'https://saopaulo.publicbikesystem.net/customer/gbfs/v2/en/system_pricing_plans';

  private readonly priceFormatter = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 2,
  });

  private readonly PER_MINUTE_GRACE_PERIOD_MINUTES = 15;
  private readonly MAX_USAGE_MINUTES_EFIT = 120;

  /** Hardcoded pricing plan IDs for specific vehicle types */
  private readonly VEHICLE_PRICING_CONFIG = {
    FIT: {
      weekday: '243',
      weekend: '231',
    },
    EFIT: {
      weekday: '247-121',
      weekend: '247-122',
    },
  } as const;

  private vehicleTypesCache: {
    map: Map<string, VehicleType>;
    expiresAt: number;
  } | null = null;
  private pricingPlansCache: {
    map: Map<string, BikePricingPlanDto>;
    expiresAt: number;
  } | null = null;

  constructor(private readonly http: HttpService) {}

  async fetchStations(): Promise<BikeStationsPayloadDto> {
    const fetchedAt = Date.now();

    const [infoResponse, statusResponse] = await Promise.all([
      this.fetchGbfs<StationInformationWrapper>(this.stationInformationUrl),
      this.fetchGbfs<StationStatusWrapper>(this.stationStatusUrl),
    ]);

    const infoById = new Map<string, StationInformation>();
    for (const station of infoResponse.data.stations) {
      infoById.set(station.station_id, station);
    }

    const [vehicleTypeMap, pricingPlanMap] = await Promise.all([
      this.getVehicleTypeMap(),
      this.getPricingPlanMap(),
    ]);

    const stations: BikeStationDto[] = statusResponse.data.stations.flatMap(
      (status) => {
        const info = infoById.get(status.station_id);
        if (!info) {
          this.logger.warn(
            `Station status without matching information: ${status.station_id}`,
          );
          return [];
        }

        const effectiveCapacity =
          info.capacity ??
          status.num_bikes_available + status.num_docks_available;

        const {
          vehicleAvailability,
          electricBikesAvailable,
          hasElectricBikesAvailable,
        } = this.resolveVehicleAvailability(
          status,
          vehicleTypeMap,
          pricingPlanMap,
        );

        const station: BikeStationDto = {
          stationId: status.station_id,
          name: info.name,
          latitude: info.lat,
          longitude: info.lon,
          address: info.address ?? null,
          capacity: info.capacity,
          numBikesAvailable: status.num_bikes_available,
          numBikesDisabled: status.num_bikes_disabled,
          numDocksAvailable: status.num_docks_available,
          numDocksDisabled: status.num_docks_disabled,
          isInstalled: status.is_installed,
          isRenting: status.is_renting,
          isReturning: status.is_returning,
          status: status.status,
          lastReported: status.last_reported,
          lastReportedIso: new Date(status.last_reported * 1000).toISOString(),
          effectiveCapacity,
          electricBikesAvailable,
          hasElectricBikesAvailable,
          vehicleAvailability,
        };

        return [station];
      },
    );

    this.logger.debug(
      `Fetched ${stations.length} bike stations from GBFS feed`,
    );

    return {
      lastUpdated: Math.max(
        infoResponse.last_updated,
        statusResponse.last_updated,
      ),
      ttl: Math.min(infoResponse.ttl, statusResponse.ttl),
      stations,
      fetchedAt,
    } satisfies BikeStationsPayloadDto;
  }

  private async fetchGbfs<T>(url: string): Promise<GbfsResponse<T>> {
    try {
      const response: AxiosResponse<GbfsResponse<T>> = await firstValueFrom(
        this.http.get<GbfsResponse<T>>(url),
      );
      return response.data;
    } catch (error) {
      const trace =
        error instanceof Error ? error.stack : JSON.stringify(error);
      this.logger.error(`Failed to fetch GBFS data from ${url}`, trace);
      throw error;
    }
  }

  private async getVehicleTypeMap(): Promise<Map<string, VehicleType>> {
    const now = Date.now();
    if (this.vehicleTypesCache && this.vehicleTypesCache.expiresAt > now) {
      return this.vehicleTypesCache.map;
    }

    const response = await this.fetchGbfs<VehicleTypeWrapper>(
      this.vehicleTypesUrl,
    );
    const map = new Map<string, VehicleType>();
    for (const vehicleType of response.data.vehicle_types) {
      map.set(vehicleType.vehicle_type_id, vehicleType);
    }

    this.vehicleTypesCache = {
      map,
      expiresAt: now + response.ttl * 1000,
    };

    return map;
  }

  private async getPricingPlanMap(): Promise<Map<string, BikePricingPlanDto>> {
    const now = Date.now();
    if (this.pricingPlansCache && this.pricingPlansCache.expiresAt > now) {
      return this.pricingPlansCache.map;
    }

    const response = await this.fetchGbfs<PricingPlansWrapper>(
      this.pricingPlansUrl,
    );
    const map = new Map<string, BikePricingPlanDto>();

    for (const plan of response.data.plans) {
      const processedPlan = this.buildPricingPlan(plan);
      map.set(processedPlan.planId, processedPlan);
    }

    this.pricingPlansCache = {
      map,
      expiresAt: now + response.ttl * 1000,
    };

    return map;
  }

  private resolveVehicleAvailability(
    status: StationStatus,
    vehicleTypeMap: Map<string, VehicleType>,
    pricingPlanMap: Map<string, BikePricingPlanDto>,
  ): {
    vehicleAvailability: BikeVehicleAvailabilityDto[];
    electricBikesAvailable: number;
    hasElectricBikesAvailable: boolean;
  } {
    if (!status.vehicle_types_available?.length) {
      return {
        vehicleAvailability: [],
        electricBikesAvailable: 0,
        hasElectricBikesAvailable: false,
      };
    }

    const availability: BikeVehicleAvailabilityDto[] = [];
    let electricTotal = 0;

    for (const vehicleEntry of status.vehicle_types_available) {
      const typeInfo = vehicleTypeMap.get(vehicleEntry.vehicle_type_id);

      if (!typeInfo) {
        this.logger.warn(
          `Vehicle type ${vehicleEntry.vehicle_type_id} missing from vehicle_types feed`,
        );
      }

      const propulsionType = typeInfo?.propulsion_type ?? 'unknown';
      if (
        propulsionType === 'electric_assist' ||
        propulsionType === 'electric'
      ) {
        electricTotal += vehicleEntry.count;
      }

      const pricingPlan = this.resolvePricingPlanForVehicle(
        vehicleEntry.vehicle_type_id,
        pricingPlanMap,
      );

      availability.push({
        vehicleTypeId: vehicleEntry.vehicle_type_id,
        name: typeInfo?.name ?? vehicleEntry.vehicle_type_id,
        formFactor: typeInfo?.form_factor ?? 'unknown',
        propulsionType,
        count: vehicleEntry.count,
        maxRangeMeters:
          typeInfo?.max_range_meters === undefined
            ? null
            : typeInfo.max_range_meters,
        pricingPlan,
      });
    }

    availability.sort((a, b) => a.name.localeCompare(b.name));

    return {
      vehicleAvailability: availability,
      electricBikesAvailable: electricTotal,
      hasElectricBikesAvailable: electricTotal > 0,
    };
  }

  /**
   * Resolves the pricing plan for a specific vehicle type.
   * - FIT bikes use weekday/weekend pay-per-use pricing
   * - EFIT bikes use subscription + activation fee pricing
   */
  private resolvePricingPlanForVehicle(
    vehicleTypeId: string,
    pricingPlanMap: Map<string, BikePricingPlanDto>,
  ): BikePricingPlanDto | null {
    if (vehicleTypeId === 'FIT') {
      return this.getFitPricingPlan(pricingPlanMap);
    }

    if (vehicleTypeId === 'EFIT') {
      return this.getEfitPricingPlan(pricingPlanMap);
    }

    // Other vehicle types - no pricing plan available
    return null;
  }

  /**
   * Returns the appropriate FIT pricing plan based on the current day.
   * Weekdays (Mon-Fri): Plan 243 "Avulso dia de semana"
   * Weekends (Sat-Sun): Plan 231 "Avulso fim de semana"
   * Prices are fetched from the API, only the name is hardcoded.
   */
  private getFitPricingPlan(
    pricingPlanMap: Map<string, BikePricingPlanDto>,
  ): BikePricingPlanDto | null {
    const isWeekendBool = isWeekend(new Date());
    const planId = isWeekendBool
      ? this.VEHICLE_PRICING_CONFIG.FIT.weekend
      : this.VEHICLE_PRICING_CONFIG.FIT.weekday;

    const planName = isWeekendBool
      ? 'Avulso fim de semana'
      : 'Avulso dia de semana';

    const plan = pricingPlanMap.get(planId);
    if (!plan) {
      this.logger.warn(`FIT pricing plan ${planId} not found in API response`);
      return null;
    }

    return {
      ...plan,
      name: planName,
    };
  }

  /**
   * Returns the EFIT pricing plan.
   * Plan 247-121 "Mensal" - Monthly subscription with activation fee.
   * Prices are fetched from the API, only the name is hardcoded.
   */
  private getEfitPricingPlan(
    pricingPlanMap: Map<string, BikePricingPlanDto>,
  ): BikePricingPlanDto | null {
    const isWeekendBool = isWeekend(new Date());
    const planId = isWeekendBool
      ? this.VEHICLE_PRICING_CONFIG.EFIT.weekend
      : this.VEHICLE_PRICING_CONFIG.EFIT.weekday;
    const plan = pricingPlanMap.get(planId);
    if (!plan) {
      this.logger.warn(`EFIT pricing plan ${planId} not found in API response`);
      return null;
    }

    return {
      ...plan,
      name: 'Mensal',
      maxUsageMinutes: this.MAX_USAGE_MINUTES_EFIT,
    };
  }

  private buildPricingPlan(plan: PricingPlan): BikePricingPlanDto {
    const pricingEntries = plan.per_min_pricing ?? [];

    // Activation fee entries: start at 0 with a larger interval (the grace period)
    // Per-minute entries: have a smaller interval for recurring charges
    // Strategy: find entry with largest interval starting at 0 as activation fee,
    // then find entry with smallest interval as the per-minute rate
    const activationFeeEntry = pricingEntries
      .filter((entry) => entry.start === 0)
      .sort((a, b) => b.interval - a.interval)[0];

    // Only consider it an activation fee if there are multiple entries
    // (single entry means it's just per-minute pricing)
    const hasActivationFee =
      activationFeeEntry &&
      pricingEntries.length > 1 &&
      activationFeeEntry.interval > 1;

    const activationFee = hasActivationFee ? activationFeeEntry.rate : null;
    const graceMinutes = hasActivationFee ? activationFeeEntry.interval : null;

    // Find the per-minute rate: entry with smallest interval that's not the activation fee
    // For plans with activation fee: entry starting after grace period
    // For standard plans: entry with smallest interval
    const perMinuteEntry = pricingEntries
      .filter((entry) => {
        if (hasActivationFee) {
          return entry.start >= (graceMinutes ?? 0);
        }
        return true;
      })
      .sort((a, b) => a.interval - b.interval)[0];

    const perMinuteRate = perMinuteEntry?.rate ?? null;
    const perMinuteInterval = perMinuteEntry?.interval ?? 1;
    const perMinuteStart = hasActivationFee
      ? (graceMinutes ?? this.PER_MINUTE_GRACE_PERIOD_MINUTES)
      : (perMinuteEntry?.start ?? this.PER_MINUTE_GRACE_PERIOD_MINUTES);

    // Format rate label dynamically based on interval
    const formatRateLabel = (rate: number, interval: number): string => {
      const formatted = this.priceFormatter.format(rate);
      if (interval === 1) return `${formatted}/min`;
      return `${formatted} a cada ${interval} min`;
    };

    return {
      planId: plan.plan_id,
      name: plan.name,
      currency: 'BRL',
      initialPrice: plan.price,
      initialPriceFormatted: this.priceFormatter.format(plan.price),
      activationFee,
      activationFeeFormatted: activationFee
        ? this.priceFormatter.format(activationFee)
        : null,
      perMinuteRate,
      perMinuteRateFormatted: perMinuteRate
        ? formatRateLabel(perMinuteRate, perMinuteInterval)
        : null,
      perMinuteChargingStartsAfterMinutes: perMinuteStart,
      maxUsageMinutes: null,
    } satisfies BikePricingPlanDto;
  }
}
