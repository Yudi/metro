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
import { MapService } from '.././map.service';
import { VectorTileLayerType } from '../vector-tiles/vector-tile-layer.service';
import { MAP_PANEL_REF } from '../map-panel/map-panel-ref';

/**
 * Unified layer configuration for the settings dialog
 */
interface LayerToggleConfig {
  id: string;
  name: string;
  visible: boolean;
  toggleable: boolean;
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
  protected readonly panelRef = inject(MAP_PANEL_REF, { optional: true });
  private readonly dialogRef =
    this.panelRef ?? inject(MatDialogRef<LayerSettingsDialogComponent>);
  private vectorTileLayerService = this.mapService.getVectorTileLayerService();

  readonly toggleableLayers = computed<LayerToggleConfig[]>(() =>
    this.vectorTileLayerService.layerConfigs().filter((layer) => layer.toggleable),
  );

  onLayerToggle(layerId: string): void {
    this.vectorTileLayerService.toggleLayer(layerId as VectorTileLayerType);
  }

  /**
   * Get icon for layer type
   */
  getLayerIcon(layerId: string): string {
    switch (layerId) {
      case VectorTileLayerType.RAIL_STATIONS:
        return 'subway';
      case VectorTileLayerType.RAIL_ROUTES:
        return 'route';
      case VectorTileLayerType.BUS_ROUTES:
        return 'directions_bus';
      case VectorTileLayerType.BUS_STOPS:
        return 'directions_bus';
      case VectorTileLayerType.BIKE_STATIONS:
        return 'pedal_bike';
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
