import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { API_BASE_URL } from '@metro/shared/api';
import { getRailStationIdentityKey } from '@metro/shared/utils';
import { take } from 'rxjs';
import {
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
    this.http.get<StationImageManifest>(`${this.apiUrl}/media/station-images`, { timeout: 15_000 })
      .pipe(take(1))
      .subscribe({
        next: (manifest) => {
          if (manifest.version === 1 && manifest.stations) this.manifest.set(manifest);
          this.loading = false;
        },
        error: () => { this.loading = false; },
      });
  }

  image(stationName: string, lineId?: string | number | null): StationHeaderImage | undefined {
    const stations = this.manifest()?.stations;
    const identity = getRailStationIdentityKey(stationName);
    if (!stations || !Object.prototype.hasOwnProperty.call(stations, identity)) return undefined;
    const images = stations[identity];
    const image = selectStationImage(images, lineId);
    // A failed image must not replace a line-specific view with an unrelated photo.
    if (!image || this.unavailable().has(image.key)) return undefined;
    return {
      ...image,
      src: `${this.apiUrl}/media/station-images/files/${image.key.replace(/^station-images\//, '')}`,
    };
  }

  markUnavailable(key: string): void {
    this.unavailable.update((keys) => new Set([...keys, key]));
  }
}
