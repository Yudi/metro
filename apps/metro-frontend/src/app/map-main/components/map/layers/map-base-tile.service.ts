import { Service, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import TileLayer from 'ol/layer/Tile';
import { XYZ } from 'ol/source';
import { LoggerService } from '@metro/shared/api';

const LIGHT_TILE_URL =
  'https://{a-c}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png?key=cb1_2lkv_1_27d7ef4f354ced672732050a';
const DARK_TILE_URL =
  'https://{a-c}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png?key=cb1_2lkv_1_27d7ef4f354ced672732050a';

/** Creates and cleans up the light/dark Carto base layer. */
@Service()
export class MapBaseTileService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly logger = inject(LoggerService);
  private baseTileLayer: TileLayer | null = null;
  private colorSchemeMql: MediaQueryList | null = null;
  private colorSchemeListener:
    | ((event: MediaQueryListEvent | MediaQueryList) => void)
    | null = null;

  createLayer(): TileLayer {
    const colorSchemeMql = isPlatformBrowser(this.platformId)
      ? window.matchMedia('(prefers-color-scheme: dark)')
      : null;
    const isDarkMode = colorSchemeMql?.matches ?? false;
    const tileLayer = new TileLayer({
      source: new XYZ({
        url: isDarkMode ? DARK_TILE_URL : LIGHT_TILE_URL,
        attributions: '© OpenStreetMap contributors, © CartoDB',
      }),
    });
    this.baseTileLayer = tileLayer;

    if (colorSchemeMql) {
      this.colorSchemeMql = colorSchemeMql;
      this.colorSchemeListener = (event) => {
        const matches =
          'matches' in event
            ? event.matches
            : (event as MediaQueryList).matches;
        this.baseTileLayer?.setSource(
          new XYZ({
            url: matches ? DARK_TILE_URL : LIGHT_TILE_URL,
            attributions: '© OpenStreetMap contributors, © CartoDB',
          }),
        );
        this.logger.info(
          `Switched base tiles to ${matches ? 'dark' : 'light'} mode`,
        );
      };

      if (typeof colorSchemeMql.addEventListener === 'function') {
        colorSchemeMql.addEventListener(
          'change',
          this.colorSchemeListener as EventListener,
        );
      } else {
        const legacy = colorSchemeMql as unknown as {
          addListener?: (listener: (mql: MediaQueryList) => void) => void;
        };
        if (typeof legacy.addListener === 'function') {
          legacy.addListener(
            this.colorSchemeListener as (mql: MediaQueryList) => void,
          );
        }
      }
    }

    return tileLayer;
  }

  destroy(): void {
    if (this.colorSchemeMql && this.colorSchemeListener) {
      if (typeof this.colorSchemeMql.removeEventListener === 'function') {
        this.colorSchemeMql.removeEventListener(
          'change',
          this.colorSchemeListener as EventListener,
        );
      } else {
        const legacy = this.colorSchemeMql as unknown as {
          removeListener?: (listener: (mql: MediaQueryList) => void) => void;
        };
        if (typeof legacy.removeListener === 'function') {
          legacy.removeListener(
            this.colorSchemeListener as (mql: MediaQueryList) => void,
          );
        }
      }
    }
    this.colorSchemeMql = null;
    this.colorSchemeListener = null;
    this.baseTileLayer = null;
  }
}
