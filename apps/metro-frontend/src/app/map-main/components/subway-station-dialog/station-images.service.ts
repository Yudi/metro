import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { API_BASE_URL } from '@metro/shared/api';
import { getRailStationIdentityKey } from '@metro/shared/utils';
import { take } from 'rxjs';
import type { StationImage } from '@metro/shared/station-image-contracts';
import {
  isStationImageFileKey,
  isStationImageManifest,
  isTerminalImageIdentity,
  selectStationImage,
  StationHeaderImage,
  StationImageManifest,
} from './station-images';

@Injectable({ providedIn: 'root' })
export class StationImagesService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = inject(API_BASE_URL);
  private readonly manifest = signal<StationImageManifest | null>(null);
  private readonly unavailable = signal<ReadonlySet<string>>(new Set());
  private loading = false;

  load(): void {
    if (this.loading || this.manifest()) return;
    this.loading = true;
    this.http
      .get<unknown>(`${this.apiUrl}/media/station-images`, {
        timeout: 15_000,
      })
      .pipe(take(1))
      .subscribe({
        next: (response) => {
          if (isStationImageManifest(response)) this.manifest.set(response);
          this.loading = false;
        },
        error: () => {
          this.loading = false;
        },
      });
  }

  image(
    stationName: string,
    lineId?: string | number | null,
  ): StationHeaderImage | undefined {
    const stations = this.manifest()?.stations;
    const identity = getRailStationIdentityKey(stationName);
    if (!stations || !Object.prototype.hasOwnProperty.call(stations, identity))
      return undefined;
    const images = stations[identity];
    const image = selectStationImage(images, lineId);
    return this.headerImage(image, 'station');
  }

  terminalImage(terminalId: string): StationHeaderImage | undefined {
    if (!isTerminalImageIdentity(terminalId)) return undefined;
    const images = this.manifest()?.terminals?.[terminalId];
    if (!images) return undefined;
    return this.headerImage(selectStationImage(images), 'terminal');
  }

  markUnavailable(key: string): void {
    this.unavailable.update((keys) => new Set([...keys, key]));
  }

  private headerImage(
    image: StationImage | undefined,
    category: 'station' | 'terminal',
  ): StationHeaderImage | undefined {
    // A failed image must not replace a line-specific view with an unrelated photo.
    if (!image || this.unavailable().has(image.key)) return undefined;
    if (!isStationImageFileKey(image.key, category)) return undefined;
    return {
      ...image,
      src: `${this.apiUrl}/media/station-images/files/${image.key.slice('station-images/'.length)}`,
    };
  }
}
