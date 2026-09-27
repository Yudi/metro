import { DOCUMENT } from '@angular/common';
import { Injectable, inject, signal } from '@angular/core';
import type { Signal, Type } from '@angular/core';
import { MapPanelCloseReason, MapPanelRef } from './map-panel-ref';

export type MapPanelSnap = 'compact' | 'half' | 'expanded';

export interface MapPanelLineBadge {
  code: number;
  backgroundColor: string;
  textColor: string;
}

export interface MapPanelAgencyLineGroup {
  agency: string;
  iconPath: string;
  ariaLabel: string;
  lines: MapPanelLineBadge[];
}

export interface MapPanelOpenOptions<TData> {
  component: Type<unknown> | null;
  data: TData;
  title: string;
  summary: string | Signal<string>;
  titleLineGroups?: MapPanelAgencyLineGroup[];
  icon?: string;
  initialSnap?: MapPanelSnap;
  showDismiss?: boolean;
}

export interface MapPanelDescriptor {
  id: number;
  component: Type<unknown> | null;
  data: unknown;
  title: string;
  summary: string | Signal<string>;
  titleLineGroups?: MapPanelAgencyLineGroup[];
  icon?: string;
  ref: MapPanelRef<unknown, unknown>;
  showDismiss: boolean;
}

export interface MapPanelNoticeData {
  title: string;
  message: string;
  icon: string;
}

@Injectable({ providedIn: 'root' })
export class MapPanelService {
  private readonly document = inject(DOCUMENT);
  private readonly panelState = signal<MapPanelDescriptor | null>(null);
  private readonly snapState = signal<MapPanelSnap>('compact');
  private nextPanelId = 1;
  private lifecycleGeneration = 0;

  readonly panel = this.panelState.asReadonly();
  readonly snap = this.snapState.asReadonly();

  get generation(): number {
    return this.lifecycleGeneration;
  }

  openComponent<TData, TResult = unknown>(
    options: MapPanelOpenOptions<TData>,
  ): MapPanelRef<TData, TResult> {
    this.finishActivePanel('replaced');
    this.lifecycleGeneration++;

    const id = this.nextPanelId++;
    const ref = new MapPanelRef<TData, TResult>(
      id,
      options.data,
      (panelId, result) => this.closePanel(panelId, result, 'dismissed'),
    );

    this.panelState.set({
      id,
      component: options.component,
      data: options.data,
      title: options.title,
      summary: options.summary,
      titleLineGroups: options.titleLineGroups,
      icon: options.icon,
      showDismiss: options.showDismiss ?? true,
      ref: ref as unknown as MapPanelRef<unknown, unknown>,
    });
    this.snapState.set(options.initialSnap ?? this.defaultSnap());

    return ref;
  }

  openNotice(options: {
    title: string;
    summary: string;
    icon?: string;
    initialSnap?: MapPanelSnap;
  }): MapPanelRef<MapPanelNoticeData, void> {
    const data: MapPanelNoticeData = {
      title: options.title,
      message: options.summary,
      icon: options.icon ?? 'info',
    };

    return this.openComponent<MapPanelNoticeData, void>({
      component: null,
      data,
      title: options.title,
      summary: options.summary,
      icon: data.icon,
      initialSnap: options.initialSnap ?? 'compact',
    });
  }

  setSnap(snap: MapPanelSnap): void {
    this.snapState.set(snap);
  }

  compactOnMobile(): void {
    const isDesktop = this.document.defaultView
      ?.matchMedia?.('(min-width: 768px)')
      ?.matches;
    if (!isDesktop) this.setSnap('compact');
  }

  nextSnap(): void {
    const current = this.snapState();
    this.setSnap(current === 'compact' ? 'half' : 'expanded');
  }

  toggleSnap(): void {
    if (this.snapState() === 'expanded') {
      this.previousSnap();
    } else {
      this.nextSnap();
    }
  }

  previousSnap(): void {
    const current = this.snapState();
    this.setSnap(current === 'expanded' ? 'half' : 'compact');
  }

  close(): void {
    const active = this.panelState();
    if (active) {
      this.closePanel(active.id, undefined, 'dismissed');
    }
  }

  /** Closes the current panel and invalidates work started by the old map view. */
  clear(): void {
    this.lifecycleGeneration++;
    const active = this.panelState();
    if (active) {
      this.closePanel(active.id, undefined, 'cleared');
    }
    this.snapState.set('compact');
  }

  private finishActivePanel(reason: MapPanelCloseReason): void {
    this.panelState()?.ref.complete(undefined, reason);
  }

  private closePanel(
    panelId: number,
    result: unknown,
    reason: MapPanelCloseReason,
  ): void {
    const active = this.panelState();
    if (!active || active.id !== panelId) {
      return;
    }

    if (reason === 'dismissed') {
      this.lifecycleGeneration++;
    }
    this.panelState.set(null);
    this.snapState.set('compact');
    active.ref.complete(result, reason);
  }

  private defaultSnap(): MapPanelSnap {
    return this.document.defaultView
      ?.matchMedia?.('(min-width: 768px)')
      ?.matches
      ? 'expanded'
      : 'half';
  }
}
