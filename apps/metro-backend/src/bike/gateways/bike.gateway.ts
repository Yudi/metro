import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Injectable, Logger, OnModuleDestroy, UseGuards } from '@nestjs/common';
import { WsThrottlerGuard } from '../../common/guards/ws-throttler.guard';
import { Server, Socket } from 'socket.io';
import { BikePollingService } from '../services/bike-polling.service';
import {
  BikeStationDto,
  BikeVehicleAvailabilityDto,
  BikeStationDetailsRequestDto,
  BikeStationDetailsEventPayloadDto,
  BikeStationDetailsEventStationDto,
  BikeStationsUpdatePayloadDto,
} from '../dto/bike.dto';
import {
  ApiTags,
  ApiExtraModels,
  ApiOperation,
  ApiResponse,
  ApiBody,
  getSchemaPath,
} from '@nestjs/swagger';

const BIKE_UPDATE_EVENT = 'stations_update';
const BIKE_DETAILS_EVENT = 'station_details';
const BIKE_DETAILS_REQUEST_EVENT = 'station_details_request';

@UseGuards(WsThrottlerGuard)
@WebSocketGateway({
  namespace: '/bike',
  path: '/api/socket.io',
  cors: {
    origin:
      process.env.NODE_ENV === 'production' ? 'https://metro.yudi.com.br' : '*',
  },
})
@ApiTags('bike')
@ApiExtraModels(
  BikeStationsUpdatePayloadDto,
  BikeStationDetailsRequestDto,
  BikeStationDetailsEventPayloadDto,
  BikeStationDetailsEventStationDto,
)
@Injectable()
export class BikeGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(BikeGateway.name);
  /** Clients that have received the full payload and can receive deltas */
  private readonly initializedClients = new Set<string>();
  /** All connected clients */
  private readonly clients = new Set<string>();
  private readonly pollListener = this.broadcastUpdates.bind(this);

  constructor(private readonly polling: BikePollingService) {
    this.polling.onPollComplete(this.pollListener);
  }

  async handleConnection(@ConnectedSocket() client: Socket): Promise<void> {
    this.logger.debug(`Bike client connected: ${client.id}`);
    this.clients.add(client.id);

    // Always send full payload on initial connection
    const fullUpdate = this.polling.getFullUpdatePayload();
    if (fullUpdate) {
      client.emit(BIKE_UPDATE_EVENT, fullUpdate);
      this.initializedClients.add(client.id);
      return;
    }

    this.logger.debug(
      'Bike cache is empty on connection; client will receive the next scheduled refresh',
    );
  }

  handleDisconnect(@ConnectedSocket() client: Socket): void {
    this.logger.debug(`Bike client disconnected: ${client.id}`);
    this.clients.delete(client.id);
    this.initializedClients.delete(client.id);
  }

  onModuleDestroy(): void {
    this.polling.offPollComplete(this.pollListener);
  }

  private broadcastUpdates(): void {
    if (this.clients.size === 0) {
      return;
    }

    const deltaPayload = this.polling.getDeltaUpdatePayload();
    const fullPayload = this.polling.getFullUpdatePayload();

    if (!fullPayload) {
      this.logger.warn('Poll completed but summary cache is empty');
      return;
    }

    let deltaCount = 0;
    let fullCount = 0;

    for (const clientId of this.clients) {
      if (this.initializedClients.has(clientId)) {
        // Client already has full data - send delta if there are changes
        if (deltaPayload) {
          this.server.to(clientId).emit(BIKE_UPDATE_EVENT, deltaPayload);
          deltaCount++;
        }
      } else {
        // New client that hasn't received full data yet - send full payload
        this.server.to(clientId).emit(BIKE_UPDATE_EVENT, fullPayload);
        this.initializedClients.add(clientId);
        fullCount++;
      }
    }

    if (deltaCount > 0 || fullCount > 0) {
      const deltaInfo = deltaPayload
        ? ` [+${deltaPayload.added?.length ?? 0} ~${
            deltaPayload.updated?.length ?? 0
          } -${deltaPayload.removed?.length ?? 0}]`
        : ' [no changes]';
      this.logger.debug(
        `Bike broadcast: ${deltaCount} delta(s), ${fullCount} full payload(s)${deltaInfo}`,
      );
    }
  }

  @SubscribeMessage(BIKE_DETAILS_REQUEST_EVENT)
  @ApiOperation({
    summary:
      'Request detailed information for a single bike station (via WebSocket message)',
  })
  @ApiBody({ type: BikeStationDetailsRequestDto })
  @ApiResponse({
    status: 200,
    description:
      'Emits a station details event with the requested station info (or null if not found)',
    schema: { $ref: getSchemaPath(BikeStationDetailsEventPayloadDto) },
  })
  async handleStationDetailsRequest(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: BikeStationDetailsRequestDto,
  ): Promise<void> {
    const stationId = body?.stationId;

    if (!stationId) {
      this.logger.warn('Received station details request without stationId');
      return;
    }

    try {
      const payload = await this.polling.getLatestPayload();
      const station = this.polling.getStationById(stationId);

      const response: BikeStationDetailsEventPayload = {
        stationId,
        station: station ? mapStationToDetails(station) : null,
        lastUpdated: payload.lastUpdated ?? null,
        fetchedAt: payload.fetchedAt ?? null,
      };

      if (!station) {
        this.logger.warn('Requested bike station not found', { stationId });
      }

      this.server.to(client.id).emit(BIKE_DETAILS_EVENT, response);
    } catch (error) {
      const trace =
        error instanceof Error ? error.stack : JSON.stringify(error);
      this.logger.error('Failed to handle station details request', trace);
    }
  }
}

interface BikeStationDetailsEventPayload {
  stationId: string;
  station: BikeStationDetailsEventStation | null;
  lastUpdated: number | null;
  fetchedAt: number | null;
}

type BikeStationDetailsEventStation = Pick<
  BikeStationDto,
  | 'stationId'
  | 'name'
  | 'latitude'
  | 'longitude'
  | 'capacity'
  | 'effectiveCapacity'
  | 'numBikesAvailable'
  | 'numBikesDisabled'
  | 'numDocksAvailable'
  | 'numDocksDisabled'
  | 'status'
  | 'isInstalled'
  | 'isRenting'
  | 'isReturning'
  | 'lastReported'
  | 'lastReportedIso'
  | 'electricBikesAvailable'
  | 'hasElectricBikesAvailable'
> & {
  address: string | null;
  vehicleAvailability: BikeVehicleAvailabilityDto[];
};

function mapStationToDetails(
  station: BikeStationDto,
): BikeStationDetailsEventStation {
  return {
    stationId: station.stationId,
    name: station.name,
    latitude: station.latitude,
    longitude: station.longitude,
    address: station.address ?? null,
    capacity: station.capacity,
    effectiveCapacity: station.effectiveCapacity,
    numBikesAvailable: station.numBikesAvailable,
    numBikesDisabled: station.numBikesDisabled,
    numDocksAvailable: station.numDocksAvailable,
    numDocksDisabled: station.numDocksDisabled,
    status: station.status,
    isInstalled: station.isInstalled,
    isRenting: station.isRenting,
    isReturning: station.isReturning,
    lastReported: station.lastReported,
    lastReportedIso: station.lastReportedIso,
    electricBikesAvailable: station.electricBikesAvailable,
    hasElectricBikesAvailable: station.hasElectricBikesAvailable,
    vehicleAvailability: station.vehicleAvailability,
  } satisfies BikeStationDetailsEventStation;
}
