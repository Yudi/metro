import { Injectable, Logger } from '@nestjs/common';
import {
  BikeStationDto,
  BikeStationsPayloadDto,
  BikeVehicleAvailabilityDto,
} from '../dto/bike.dto';
import { GbfsClientService } from '../gbfs/gbfs-client.service';
import {
  GbfsPricingPlan,
  GbfsPricingPlansData,
  GbfsResponse,
  GbfsStationInformation,
  GbfsStationInformationData,
  GbfsStationStatus,
  GbfsStationStatusData,
  GbfsVehicleType,
  GbfsVehicleTypesData,
} from '../gbfs/gbfs-v3.types';
import { BikePricingService } from './bike-pricing.service';

@Injectable()
export class BikeApiService {
  private readonly logger = new Logger(BikeApiService.name);

  constructor(
    private readonly gbfs: GbfsClientService,
    private readonly pricing: BikePricingService,
  ) {}

  async fetchStations(): Promise<BikeStationsPayloadDto> {
    const fetchedAt = Date.now();
    const [information, statuses, vehicleTypes, pricingPlans] =
      await Promise.all([
        this.gbfs.fetchFeed<GbfsStationInformationData>(
          'station_information',
        ),
        this.gbfs.fetchFeed<GbfsStationStatusData>('station_status'),
        this.gbfs.fetchFeed<GbfsVehicleTypesData>('vehicle_types'),
        this.gbfs.fetchFeed<GbfsPricingPlansData>('system_pricing_plans'),
      ]);

    const informationById = new Map(
      information.data.stations.map((station) => [station.station_id, station]),
    );
    const vehicleTypesById = new Map(
      vehicleTypes.data.vehicle_types.map((vehicleType) => [
        vehicleType.vehicle_type_id,
        vehicleType,
      ]),
    );
    const pricingPlansById = new Map(
      pricingPlans.data.plans.map((plan) => [plan.plan_id, plan]),
    );

    const stations = statuses.data.stations.flatMap((status) => {
      const stationInformation = informationById.get(status.station_id);
      if (!stationInformation) {
        this.logger.warn(
          `Station status without matching information: ${status.station_id}`,
        );
        return [];
      }

      return [
        this.buildStation(
          stationInformation,
          status,
          vehicleTypesById,
          pricingPlansById,
        ),
      ];
    });

    this.logger.debug(
      `Fetched ${stations.length} bike stations from GBFS v3 feeds`,
    );

    return {
      lastUpdated: Math.max(
        this.toUnixSeconds(information.last_updated),
        this.toUnixSeconds(statuses.last_updated),
      ),
      ttl: Math.min(information.ttl, statuses.ttl),
      stations,
      fetchedAt,
    };
  }

  private buildStation(
    information: GbfsStationInformation,
    status: GbfsStationStatus,
    vehicleTypes: Map<string, GbfsVehicleType>,
    pricingPlans: Map<string, GbfsPricingPlan>,
  ): BikeStationDto {
    const lastReported = this.toUnixSeconds(status.last_reported);
    const {
      vehicleAvailability,
      electricBikesAvailable,
      hasElectricBikesAvailable,
    } = this.resolveVehicleAvailability(status, vehicleTypes, pricingPlans);

    return {
      stationId: status.station_id,
      name: this.localizedText(information.name),
      latitude: information.lat,
      longitude: information.lon,
      address: information.address ?? null,
      capacity: information.capacity,
      numBikesAvailable: status.num_vehicles_available,
      numBikesDisabled: status.num_vehicles_disabled,
      numDocksAvailable: status.num_docks_available,
      numDocksDisabled: status.num_docks_disabled,
      isInstalled: status.is_installed,
      isRenting: status.is_renting,
      isReturning: status.is_returning,
      status: this.stationStatus(status),
      lastReported,
      lastReportedIso: new Date(lastReported * 1000).toISOString(),
      effectiveCapacity:
        information.capacity ??
        status.num_vehicles_available + status.num_docks_available,
      electricBikesAvailable,
      hasElectricBikesAvailable,
      vehicleAvailability,
    };
  }

  private resolveVehicleAvailability(
    status: GbfsStationStatus,
    vehicleTypes: Map<string, GbfsVehicleType>,
    pricingPlans: Map<string, GbfsPricingPlan>,
  ): {
    vehicleAvailability: BikeVehicleAvailabilityDto[];
    electricBikesAvailable: number;
    hasElectricBikesAvailable: boolean;
  } {
    const vehicleAvailability = (status.vehicle_types_available ?? []).map(
      (entry): BikeVehicleAvailabilityDto => {
        const vehicleType = vehicleTypes.get(entry.vehicle_type_id);
        const propulsionType = vehicleType?.propulsion_type ?? 'unknown';

        if (!vehicleType) {
          this.logger.warn(
            `Vehicle type ${entry.vehicle_type_id} missing from vehicle_types feed`,
          );
        }

        return {
          vehicleTypeId: entry.vehicle_type_id,
          name: vehicleType
            ? this.localizedText(vehicleType.name)
            : entry.vehicle_type_id,
          formFactor: vehicleType?.form_factor ?? 'unknown',
          propulsionType,
          count: entry.count,
          maxRangeMeters: vehicleType?.max_range_meters ?? null,
          pricingPlan: this.pricing.resolvePlan(vehicleType, pricingPlans),
        };
      },
    );

    vehicleAvailability.sort((left, right) =>
      left.name.localeCompare(right.name, 'pt-BR'),
    );

    const electricBikesAvailable = vehicleAvailability
      .filter(
        (vehicle) =>
          vehicle.propulsionType === 'electric' ||
          vehicle.propulsionType === 'electric_assist',
      )
      .reduce((total, vehicle) => total + vehicle.count, 0);

    return {
      vehicleAvailability,
      electricBikesAvailable,
      hasElectricBikesAvailable: electricBikesAvailable > 0,
    };
  }

  private localizedText(
    values: { text: string; language: string }[],
  ): string {
    return (
      values.find((value) => value.language === 'pt')?.text ??
      values.find((value) => value.language === 'en')?.text ??
      values[0]?.text ??
      ''
    );
  }

  private stationStatus(status: GbfsStationStatus): string {
    return status.is_installed && (status.is_renting || status.is_returning)
      ? 'IN_SERVICE'
      : 'OUT_OF_SERVICE';
  }

  private toUnixSeconds(timestamp: GbfsResponse<unknown>['last_updated']): number {
    const milliseconds = Date.parse(timestamp);
    if (!Number.isFinite(milliseconds)) {
      throw new Error(`Invalid GBFS timestamp: ${timestamp}`);
    }
    return Math.floor(milliseconds / 1000);
  }
}
