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
import {
  NextTrainPollingService,
  StationDelta,
} from '../services/next-train-polling.service';
import {
  CptmVehiclePollingService,
  CptmVehicleDelta,
} from '../services/cptm-vehicle-polling.service';
import { HeadwayTrackingService } from '../services/headway-tracking.service';
import { SubscribeStationDto, NextTrainUpdateDto } from '../dto/next-train.dto';
import {
  isValidStation,
  hasExternalRailVehicles,
  isApi1RailLine,
  CptmLineCode,
  ExtendedNextTrainLineCode,
  isValidApi1RailStationCode,
} from '@metro/shared/utils';

const NEXT_TRAIN_SUBSCRIBE_EVENT = 'subscribe_station';
const NEXT_TRAIN_UNSUBSCRIBE_EVENT = 'unsubscribe_station';
const NEXT_TRAIN_UPDATE_EVENT = 'next_train_update';

// Vehicle events (supports privately tracked rail lines)
const CPTM_VEHICLE_SUBSCRIBE_EVENT = 'subscribe_cptm_vehicles';
const CPTM_VEHICLE_UNSUBSCRIBE_EVENT = 'unsubscribe_cptm_vehicles';
const CPTM_VEHICLE_UPDATE_EVENT = 'cptm_vehicle_update';

const VALID_LINE_CODES: ExtendedNextTrainLineCode[] = [
  'L4',
  'L8',
  'L9',
  'L10',
  'L11',
  'L12',
  'L13',
  'EA',
  '10X',
];

/**
 * WebSocket gateway for real-time next train updates and vehicle positions
 * - Next-train: L4, L8/L9, L10-L13
 * - Vehicle positions: L4, L10-L13
 * Supports delta updates to minimize bandwidth
 */
@UseGuards(WsThrottlerGuard)
@WebSocketGateway({
  namespace: '/next-train',
  path: '/api/socket.io',
  cors: {
    origin:
      process.env.NODE_ENV === 'production' ? 'https://metro.yudi.com.br' : '*',
  },
})
@Injectable()
export class NextTrainGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(NextTrainGateway.name);

  // Track client subscriptions: Map<clientId, Set<"L9:HBR">>
  private readonly clientSubscriptions = new Map<string, Set<string>>();

  // Track client vehicle subscriptions: Map<clientId, Set<"L11">>
  private readonly clientVehicleSubscriptions = new Map<
    string,
    Set<CptmLineCode>
  >();

  // Bound listeners for polling services
  private readonly deltaListener = this.handleDeltas.bind(this);
  private readonly vehicleDeltaListener = this.handleVehicleDeltas.bind(this);

  constructor(
    private readonly polling: NextTrainPollingService,
    private readonly vehiclePolling: CptmVehiclePollingService,
    private readonly headwayTracking: HeadwayTrackingService,
  ) {
    this.polling.onPollComplete(this.deltaListener);
    this.vehiclePolling.onPollComplete(this.vehicleDeltaListener);
  }

  onModuleDestroy(): void {
    this.polling.offPollComplete(this.deltaListener);
    this.vehiclePolling.offPollComplete(this.vehicleDeltaListener);
  }

  handleConnection(@ConnectedSocket() client: Socket): void {
    this.logger.debug(`Next train client connected: ${client.id}`);
    this.clientSubscriptions.set(client.id, new Set());
    this.clientVehicleSubscriptions.set(client.id, new Set());
  }

  handleDisconnect(@ConnectedSocket() client: Socket): void {
    this.logger.debug(`Next train client disconnected: ${client.id}`);

    // Unsubscribe from all stations and vehicles
    this.polling.unsubscribeAll(client.id);
    this.vehiclePolling.unsubscribeAll(client.id);
    this.clientSubscriptions.delete(client.id);
    this.clientVehicleSubscriptions.delete(client.id);
  }

  @SubscribeMessage(NEXT_TRAIN_SUBSCRIBE_EVENT)
  async handleSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: SubscribeStationDto,
  ): Promise<void> {
    const { lineCode, stationCode } = body;

    // Validate line code
    if (!VALID_LINE_CODES.includes(lineCode)) {
      this.logger.warn(`Invalid line code: ${lineCode}`);
      client.emit('error', {
        message:
          'Invalid line code. Must be L4, L8, L9, L10, L11, L12, L13, EA, or 10X.',
      });
      return;
    }

    if (
      isApi1RailLine(lineCode) &&
      !isValidApi1RailStationCode(lineCode, stationCode)
    ) {
      this.logger.warn(`Invalid station code: ${stationCode} for ${lineCode}`);
      client.emit('error', {
        message: `Invalid station code ${stationCode} for line ${lineCode}`,
      });
      return;
    }

    if (!isApi1RailLine(lineCode) && !isValidStation(lineCode, stationCode)) {
      this.logger.warn(`Invalid station code: ${stationCode} for ${lineCode}`);
      client.emit('error', {
        message: `Invalid station code ${stationCode} for line ${lineCode}`,
      });
      return;
    }

    const key = `${lineCode}:${stationCode}`;
    const subs = this.clientSubscriptions.get(client.id);
    if (subs) {
      subs.add(key);
    }

    // Subscribe and get cached data
    const cached = this.polling.subscribe(client.id, lineCode, stationCode);

    // If we have cached data, send it immediately
    if (cached) {
      const headway = await this.headwayTracking.getHeadway(
        lineCode,
        stationCode,
      );

      const update: NextTrainUpdateDto = {
        type: 'full',
        lineCode,
        stationCode,
        trains: cached.trains,
        timestamp: cached.fetchedAt,
        hasError: cached.hasError,
        processing: false,
        operationClosed: cached.operationClosed,
        headway: headway?.directions,
      };
      client.emit(NEXT_TRAIN_UPDATE_EVENT, update);
    } else {
      const update: NextTrainUpdateDto = {
        type: 'full',
        lineCode,
        stationCode,
        trains: [],
        timestamp: Date.now(),
        hasError: false,
        processing: true,
      };
      client.emit(NEXT_TRAIN_UPDATE_EVENT, update);
    }
  }

  @SubscribeMessage(NEXT_TRAIN_UNSUBSCRIBE_EVENT)
  handleUnsubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: SubscribeStationDto,
  ): void {
    const { lineCode, stationCode } = body;

    if (!VALID_LINE_CODES.includes(lineCode)) return;

    const key = `${lineCode}:${stationCode}`;
    const subs = this.clientSubscriptions.get(client.id);
    if (subs) {
      subs.delete(key);
    }

    this.polling.unsubscribe(client.id, lineCode, stationCode);
  }

  /**
   * Subscribe to vehicle positions for privately tracked lines (L4, L10-L13)
   */
  @SubscribeMessage(CPTM_VEHICLE_SUBSCRIBE_EVENT)
  handleVehicleSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { lineCode: CptmLineCode },
  ): void {
    const { lineCode } = body;

    if (!hasExternalRailVehicles(lineCode)) {
      this.logger.warn(`Invalid line code for private vehicles: ${lineCode}`);
      client.emit('error', {
        message:
          'Invalid line code. Must be L4, L10, L11, L12, L13, EA, or 10X.',
      });
      return;
    }

    const subs = this.clientVehicleSubscriptions.get(client.id);
    if (subs) {
      subs.add(lineCode);
    }

    // Subscribe and get cached data
    const cached = this.vehiclePolling.subscribe(client.id, lineCode);

    // If we have cached data, send it immediately
    if (cached) {
      client.emit(CPTM_VEHICLE_UPDATE_EVENT, {
        type: 'full',
        lineCode,
        lineName: cached.lineName,
        vehicles: cached.vehicles,
        timestamp: cached.timestamp,
      });
    }
  }

  /**
   * Unsubscribe from vehicle positions for privately tracked lines
   */
  @SubscribeMessage(CPTM_VEHICLE_UNSUBSCRIBE_EVENT)
  handleVehicleUnsubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { lineCode: CptmLineCode },
  ): void {
    const { lineCode } = body;

    if (!hasExternalRailVehicles(lineCode)) return;

    const subs = this.clientVehicleSubscriptions.get(client.id);
    if (subs) {
      subs.delete(lineCode);
    }

    this.vehiclePolling.unsubscribe(client.id, lineCode);
  }

  /**
   * Handle delta updates from polling service
   * Send updates only to subscribed clients
   */
  private handleDeltas(deltas: StationDelta[]): void {
    for (const delta of deltas) {
      // Get all clients subscribed to this station
      const subscribers = this.polling.getSubscribers(
        delta.lineCode,
        delta.stationCode,
      );

      if (subscribers.size === 0) continue;

      // Fetch headway asynchronously - don't block the delta emission
      void this.headwayTracking
        .getHeadway(delta.lineCode, delta.stationCode)
        .then((headway) => {
          const update: NextTrainUpdateDto = {
            type: 'delta',
            lineCode: delta.lineCode,
            stationCode: delta.stationCode,
            trains: delta.trains,
            timestamp: delta.timestamp,
            hasError: delta.hasError,
            processing: false,
            operationClosed: delta.operationClosed,
            headway: headway?.directions,
          };

          // Send to each subscribed client
          for (const clientId of subscribers) {
            this.server.to(clientId).emit(NEXT_TRAIN_UPDATE_EVENT, update);
          }
        })
        .catch(() => {
          // If headway fails, send update without headway
          const update: NextTrainUpdateDto = {
            type: 'delta',
            lineCode: delta.lineCode,
            stationCode: delta.stationCode,
            trains: delta.trains,
            timestamp: delta.timestamp,
            hasError: delta.hasError,
            processing: false,
            operationClosed: delta.operationClosed,
          };

          for (const clientId of subscribers) {
            this.server.to(clientId).emit(NEXT_TRAIN_UPDATE_EVENT, update);
          }
        });
    }
  }

  /**
   * Handle vehicle position delta updates from private polling service
   * Sends updates for L4 and CPTM lines (L10-L13)
   */
  private handleVehicleDeltas(deltas: CptmVehicleDelta[]): void {
    for (const delta of deltas) {
      const subscribers = this.vehiclePolling.getSubscribers(delta.lineCode);

      if (subscribers.size === 0) continue;

      // Send to each subscribed client
      for (const clientId of subscribers) {
        this.server.to(clientId).emit(CPTM_VEHICLE_UPDATE_EVENT, {
          type: 'delta',
          lineCode: delta.lineCode,
          vehicles: delta.vehicles,
          timestamp: delta.timestamp,
        });
      }

      this.logger.debug(
        `Sent CPTM vehicle delta for ${delta.lineCode} to ${subscribers.size} client(s)`,
      );
    }
  }
}
