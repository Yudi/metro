import { InjectionToken } from '@angular/core';
import { MatDialogRef } from '@angular/material/dialog';
import { Observable, ReplaySubject } from 'rxjs';

/** The close capability injected into a component shown by the map panel. */
export interface MapPanelCloseHandle {
  close(result?: unknown): void;
}

export type MapPanelCloseReason = 'dismissed' | 'replaced' | 'cleared';

export const MAP_PANEL_REF = new InjectionToken<MapPanelCloseHandle>(
  'MAP_PANEL_REF',
);

export function closeMapPanelOrDialog<TComponent, TResult>(
  panelRef: MapPanelCloseHandle | null,
  dialogRef: MatDialogRef<TComponent, TResult> | null,
  result?: TResult,
): void {
  if (panelRef) {
    panelRef.close(result);
  } else {
    dialogRef?.close(result);
  }
}

/** A typed handle for updating or closing one map panel instance. */
export class MapPanelRef<TData, TResult = unknown> {
  private readonly closedSubject = new ReplaySubject<TResult | undefined>(1);
  private closed = false;
  private currentCloseReason: MapPanelCloseReason | null = null;
  private currentData: TData;
  private componentInstance: unknown | null = null;
  private updateInstanceData:
    | ((instance: unknown, data: TData) => void)
    | null = null;

  readonly closeHandle: MapPanelCloseHandle = {
    close: (result) => this.close(result as TResult | undefined),
  };

  constructor(
    readonly id: number,
    data: TData,
    private readonly closePanel: (
      id: number,
      result: TResult | undefined,
    ) => void,
  ) {
    this.currentData = data;
  }

  get data(): TData {
    return this.currentData;
  }

  get closeReason(): MapPanelCloseReason | null {
    return this.currentCloseReason;
  }

  afterClosed(): Observable<TResult | undefined> {
    return this.closedSubject.asObservable();
  }

  close(result?: TResult): void {
    if (!this.closed) {
      this.closePanel(this.id, result);
    }
  }

  updateData(data: TData): void {
    if (this.closed) {
      return;
    }

    this.currentData = data;
    if (this.componentInstance && this.updateInstanceData) {
      this.updateInstanceData(this.componentInstance, data);
    }
  }

  setDataUpdater<TComponent>(
    update: (component: TComponent, data: TData) => void,
  ): void {
    this.updateInstanceData = (instance, data) =>
      update(instance as TComponent, data);
    if (this.componentInstance) {
      this.updateInstanceData(this.componentInstance, this.currentData);
    }
  }

  attachComponentInstance(instance: unknown): void {
    if (this.closed) {
      return;
    }

    this.componentInstance = instance;
    if (this.updateInstanceData) {
      this.updateInstanceData(instance, this.currentData);
    }
  }

  /** @internal Completes the result stream when the panel is dismissed. */
  complete(result: TResult | undefined, reason: MapPanelCloseReason): void {
    if (this.closed) {
      return;
    }

    this.closed = true;
    this.currentCloseReason = reason;
    this.componentInstance = null;
    this.closedSubject.next(result);
    this.closedSubject.complete();
  }
}
