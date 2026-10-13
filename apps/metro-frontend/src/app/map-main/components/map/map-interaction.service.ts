import { Service, inject } from '@angular/core';
import { Feature } from 'ol';
import { FeatureLike } from 'ol/Feature';
import { SpecialRailService } from '@metro/shared/utils';
import { MapDetailsDialogService } from './map-details-dialog.service';
import { MapFeatureInteractionService } from './map-feature-interaction.service';
import { MapLocationService } from './map-location.service';
import { MapSelectionService } from './map-selection.service';

@Service()
export class MapInteractionService {
  private readonly selectionService = inject(MapSelectionService);
  private readonly featureService = inject(MapFeatureInteractionService);
  private readonly detailsService = inject(MapDetailsDialogService);
  private readonly locationService = inject(MapLocationService);

  openAddressSearch(): void {
    this.locationService.openAddressSearch();
  }

  focusRouteOnMap(routeId: string, isRail: boolean): void {
    this.selectionService.focusRouteOnMap(routeId, isRail);
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

  addOppositeDirectionToSelection(routeId: string): Promise<void> {
    return this.selectionService.addOppositeDirectionToSelection(routeId);
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

  removeRouteFromSelection(routeId: string, shouldDisplaySnackbar = true): void {
    this.selectionService.removeRouteFromSelection(routeId, shouldDisplaySnackbar);
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
    this.featureService.cancelPendingFeatureDetails();
    this.selectionService.clearAllSelections(shouldDisplaySnackbar);
  }

  cancelPendingFeatureDetails(): void {
    this.featureService.cancelPendingFeatureDetails();
  }

  cancelPendingWork(): void {
    this.selectionService.cancelPendingSelections();
    this.featureService.cancelPendingFeatureDetails();
  }

  cancelPendingStopSelections(): void {
    this.selectionService.cancelPendingStopSelections();
  }

  handleFeatureSelection(feature: Feature | FeatureLike): void {
    this.featureService.handleFeatureSelection(feature);
  }

  showRoutesForStop(stopId: string): Promise<void> {
    return this.detailsService.showRoutesForStop(stopId);
  }

  showBusTerminalDetails(terminalId: string): void {
    this.detailsService.showBusTerminalDetails(
      terminalId,
      undefined,
      undefined,
      true,
    );
  }

  toggleUserLocation(): Promise<void> {
    return this.locationService.toggleUserLocation();
  }
}
