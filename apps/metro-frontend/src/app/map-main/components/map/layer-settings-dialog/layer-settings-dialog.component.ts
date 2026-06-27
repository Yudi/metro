import {
  Component,
  inject,
  ChangeDetectionStrategy,
  computed,
} from '@angular/core';

import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDividerModule } from '@angular/material/divider';
import { MapService } from '../../../services/map.service';
import { LayerType } from '../../../services/map-layer.service';
import { VectorTileLayerType } from '../../../services/vector-tile-layer.service';
import { MapDataLoaderService } from '../map-data-loader.service';
import { LoggerService } from '@metro/shared/api';

/**
 * Unified layer configuration for the settings dialog
 */
interface LayerToggleConfig {
  id: string;
  name: string;
  visible: boolean;
  toggleable: boolean;
  isVectorTile: boolean;
}

@Component({
  selector: 'app-layer-settings-dialog',
  imports: [
    MatDialogModule,
    MatCheckboxModule,
    MatIconModule,
    MatButtonModule,
    MatTooltipModule,
    MatDividerModule,
  ],
  templateUrl: './layer-settings-dialog.component.html',
  styleUrl: './layer-settings-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LayerSettingsDialogComponent {
  private mapService = inject(MapService);
  private dataLoader = inject(MapDataLoaderService);
  private dialogRef = inject(MatDialogRef<LayerSettingsDialogComponent>);
  private logger = inject(LoggerService);
  private layerService = this.mapService.getLayerService();
  private vectorTileLayerService = this.mapService.getVectorTileLayerService();

  /**
   * Unified list of toggleable layers from both services
   * Subway layers come from VectorTileLayerService (MVT)
   * Other layers come from MapLayerService (GeoJSON)
   */
  readonly toggleableLayers = computed<LayerToggleConfig[]>(() => {
    const vtLayers = this.vectorTileLayerService
      .layerConfigs()
      .filter((c) => c.toggleable)
      .map((c) => ({
        id: c.id,
        name: c.name,
        visible: c.visible,
        toggleable: c.toggleable,
        isVectorTile: true,
      }));

    const regularLayers = this.layerService
      .toggleableLayers()
      // Exclude rail layers since they're now handled by vector tiles
      .filter(
        (c) =>
          c.id !== LayerType.RAIL_STATIONS && c.id !== LayerType.RAIL_ROUTES,
      )
      .map((c) => ({
        id: c.id,
        name: c.name,
        visible: c.visible,
        toggleable: c.toggleable,
        isVectorTile: false,
      }));

    return [...vtLayers, ...regularLayers];
  });

  /**
   * Toggle layer visibility and load data if needed
   */
  onLayerToggle(layerId: string, isVectorTile: boolean): void {
    const wasVisible = this.isLayerVisible(layerId, isVectorTile);

    this.logger.debug(`Toggling ${layerId}`, {
      wasVisible,
      isVectorTile,
    });

    // Toggle the appropriate layer type
    if (isVectorTile) {
      this.vectorTileLayerService.toggleLayer(layerId as VectorTileLayerType);
    } else {
      this.layerService.toggleLayer(layerId as LayerType);
    }

    const isNowVisible = this.isLayerVisible(layerId, isVectorTile);

    this.logger.debug(`After toggle ${layerId}`, {
      isNowVisible,
    });
    // Bike layer activation/deactivation is handled by MapComponent's effect
    // which watches the layer visibility signal
  }

  /**
   * Check if layer is visible
   */
  isLayerVisible(layerId: string, isVectorTile?: boolean): boolean {
    // Determine if it's a vector tile layer
    const isVT =
      isVectorTile ??
      (layerId === VectorTileLayerType.RAIL_STATIONS ||
        layerId === VectorTileLayerType.RAIL_ROUTES);

    if (isVT) {
      return this.vectorTileLayerService.isLayerVisible(
        layerId as VectorTileLayerType,
      );
    }
    return this.layerService.isLayerVisible(layerId as LayerType);
  }

  /**
   * Get icon for layer type
   */
  getLayerIcon(layerId: string): string {
    switch (layerId) {
      case VectorTileLayerType.RAIL_STATIONS:
      case LayerType.RAIL_STATIONS:
        return 'subway';
      case VectorTileLayerType.RAIL_ROUTES:
      case LayerType.RAIL_ROUTES:
        return 'route';
      case LayerType.BUS_ROUTES:
        return 'directions_bus';
      case LayerType.BUS_STOPS:
        return 'place';
      case LayerType.BIKE:
        return 'pedal_bike';
      case LayerType.SELECTION:
        return 'check_circle';
      default:
        return 'layers';
    }
  }

  /**
   * Close the dialog
   */
  close(): void {
    this.dialogRef.close();
  }
}
