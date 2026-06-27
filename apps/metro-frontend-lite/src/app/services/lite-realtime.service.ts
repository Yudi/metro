import { isPlatformBrowser } from '@angular/common';
import {
  Injectable,
  OnDestroy,
  PLATFORM_ID,
  inject,
  signal,
} from '@angular/core';
import { API_BASE_URL } from '@metro/shared/api';
import { io, Socket } from 'socket.io-client';

export interface LiteVehiclePosition {
  p: number;
  a: boolean;
  ta: string;
  py: number;
  px: number;
  t?: string;
}

export interface LiteArrivalLine {
  c: string;
  cl: number;
  sl: number;
  lt0: string;
  lt1: string;
  qv: number;
  vs: LiteVehiclePosition[];
}

export interface LiteStopArrivalUpdate {
  stopCode: string;
  hr: string;
  p: {
    cp: number;
    np: string;
    py: number;
    px: number;
    l: LiteArrivalLine[];
  };
  cacheTimestamp: number;
}

interface LiteRealtimeMessage<TData> {
  type: string;
  data: TData;
}

const ARRIVAL_PREDICTIONS_EVENT = 'arrival_predictions';
const SUBSCRIBE_STOP_EVENT = 'subscribe_stop';
const UNSUBSCRIBE_STOP_EVENT = 'unsubscribe_stop';

@Injectable({
  providedIn: 'root',
})
export class LiteRealtimeService implements OnDestroy {
  private readonly baseUrl = inject(API_BASE_URL);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);
  private readonly socketUrl = this.baseUrl.replace(/\/api$/, '');
  private socket: Socket | null = null;
  private readonly subscribedStops = new Set<string>();

  readonly connected = signal(false);
  readonly stopArrivals = signal<Map<string, LiteStopArrivalUpdate>>(new Map());

  fetchStopArrivalOnce(stopCode: string): Promise<LiteStopArrivalUpdate | null> {
    if (!this.isBrowser || !stopCode) {
      return Promise.resolve(null);
    }

    this.ensureSocket();

    return new Promise((resolve) => {
      const timeoutId = window.setTimeout(() => {
        cleanup();
        resolve(null);
      }, 10000);

      const handler = (payload: LiteRealtimeMessage<LiteStopArrivalUpdate>) => {
        const update = this.readArrivalUpdate(payload);
        if (update?.stopCode !== stopCode) {
          return;
        }

        cleanup();
        resolve(update);
      };

      const cleanup = () => {
        window.clearTimeout(timeoutId);
        this.socket?.off(ARRIVAL_PREDICTIONS_EVENT, handler);

        if (!this.subscribedStops.has(stopCode)) {
          this.socket?.emit(UNSUBSCRIBE_STOP_EVENT, { stopCode });
        }
      };

      this.socket?.on(ARRIVAL_PREDICTIONS_EVENT, handler);
      this.socket?.emit(SUBSCRIBE_STOP_EVENT, { stopCode });
    });
  }

  subscribeToStop(stopCode: string): void {
    if (!this.isBrowser || !stopCode || this.subscribedStops.has(stopCode)) {
      return;
    }

    this.ensureSocket();
    this.subscribedStops.add(stopCode);
    this.socket?.emit(SUBSCRIBE_STOP_EVENT, { stopCode });
  }

  unsubscribeFromStop(stopCode: string): void {
    if (!this.subscribedStops.has(stopCode)) {
      return;
    }

    this.subscribedStops.delete(stopCode);
    this.socket?.emit(UNSUBSCRIBE_STOP_EVENT, { stopCode });

    const arrivals = new Map(this.stopArrivals());
    arrivals.delete(stopCode);
    this.stopArrivals.set(arrivals);
  }

  ngOnDestroy(): void {
    this.socket?.disconnect();
    this.socket = null;
    this.connected.set(false);
    this.subscribedStops.clear();
  }

  private ensureSocket(): void {
    if (this.socket) {
      return;
    }

    this.socket = io(`${this.socketUrl}/realtime`, {
      path: '/api/socket.io',
      transports: ['websocket'],
      autoConnect: true,
      reconnection: true,
      reconnectionDelay: 5000,
      reconnectionAttempts: 3,
    });

    this.socket.on('connect', () => {
      this.connected.set(true);
      for (const stopCode of this.subscribedStops) {
        this.socket?.emit(SUBSCRIBE_STOP_EVENT, { stopCode });
      }
    });

    this.socket.on('disconnect', () => {
      this.connected.set(false);
    });

    this.socket.on(
      ARRIVAL_PREDICTIONS_EVENT,
      (payload: LiteRealtimeMessage<LiteStopArrivalUpdate>) => {
        this.handleArrivalPredictions(payload);
      },
    );
  }

  private handleArrivalPredictions(
    payload: LiteRealtimeMessage<LiteStopArrivalUpdate>,
  ): void {
    const update = this.readArrivalUpdate(payload);
    if (!update) {
      return;
    }

    const arrivals = new Map(this.stopArrivals());
    arrivals.set(update.stopCode, update);
    this.stopArrivals.set(arrivals);
  }

  private readArrivalUpdate(
    payload: LiteRealtimeMessage<LiteStopArrivalUpdate>,
  ): LiteStopArrivalUpdate | null {
    if (!payload.data?.stopCode) {
      return null;
    }

    return payload.data;
  }
}
