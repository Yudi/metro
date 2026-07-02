import { Injectable, inject } from '@angular/core';
import { Feature } from 'ol';
import { FeatureLike } from 'ol/Feature';
import { SpecialRailService } from '@metro/shared/utils';
import { MapDetailsDialogService } from './map-details-dialog.service';
import { MapFeatureInteractionService } from './map-feature-interaction.service';
import { MapNearbyModeService } from './map-nearby-mode.service';
import { MapSearchInteractionService } from './map-search-interaction.service';
import { MapSelectionService } from './map-selection.service';

@Injectable({
  providedIn: 'root',
})
export class MapInteractionService {
  private readonly searchService = inject(MapSearchInteractionService);
  private readonly selectionService = inject(MapSelectionService);
  private readonly featureService = inject(MapFeatureInteractionService);
  private readonly detailsService = inject(MapDetailsDialogService);
  private readonly nearbyService = inject(MapNearbyModeService);

  openSearchModal(): void {
    this.searchService.openSearchModal();
  }

  openExploreModal(): void {
    this.nearbyService.openExploreModal();
  }

  addRouteToSelection(
    routeId: string,
    shouldDisplaySnackbar: boolean,
  ): Promise<void> {
    return this.selectionService.addRouteToSelection(
      routeId,
      shouldDisplaySnackbar,
    );
  }

  addRailLineToSelection(lineId: string, shouldDisplaySnackbar = true): void {
    this.selectionService.addRailLineToSelection(lineId, shouldDisplaySnackbar);
  }

  addSpecialRailLineToSelection(
    service: SpecialRailService,
    shouldDisplaySnackbar = true,
  ): void {
    this.selectionService.addSpecialRailLineToSelection(
      service,
      shouldDisplaySnackbar,
    );
  }

  addStopToSelection(
    stopId: string,
    shouldDisplaySnackbar = true,
  ): Promise<void> {
    return this.selectionService.addStopToSelection(
      stopId,
      shouldDisplaySnackbar,
    );
  }

  removeRouteFromSelection(routeId: string): void {
    this.selectionService.removeRouteFromSelection(routeId);
  }

  removeStopFromSelection(stopId: string): void {
    this.selectionService.removeStopFromSelection(stopId);
  }

  addBikeStationToSelection(
    stationId: string,
    shouldDisplaySnackbar = true,
  ): void {
    this.selectionService.addBikeStationToSelection(
      stationId,
      shouldDisplaySnackbar,
    );
  }

  removeBikeStationFromSelection(stationId: string): void {
    this.selectionService.removeBikeStationFromSelection(stationId);
  }

  clearAllSelections(shouldDisplaySnackbar = true): void {
    this.selectionService.clearAllSelections(shouldDisplaySnackbar);
  }

  handleFeatureSelection(feature: Feature | FeatureLike): void {
    this.featureService.handleFeatureSelection(feature);
  }

  showRoutesForStop(stopId: string): Promise<void> {
    return this.detailsService.showRoutesForStop(stopId);
  }

  activateNearbyMode(): void {
    this.nearbyService.activateNearbyMode();
  }

  deactivateNearbyMode(): void {
    this.nearbyService.deactivateNearbyMode();
  }

  /**
   * @deprecated Use activateNearbyMode() or deactivateNearbyMode() instead
   */
  toggleNearbyMode(): void {
    this.nearbyService.toggleNearbyMode();
  }
}
