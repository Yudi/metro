import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';
import type { Map } from 'ol';
import type { Extent } from 'ol/extent';
import { fromLonLat } from 'ol/proj';
import { easeOut } from 'ol/easing';
import { getProjectedCoordinateExtent } from './map-coordinate-extent.utils';

type Coordinates = readonly (readonly [number, number])[];
const CAMERA_KEYS = new Set([
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', '+', '-', '=',
]);

/** A user action owns the camera only until another action or gesture takes over. */
export interface MapFocusRequest {
  point(coordinates: [number, number], minimumZoom?: number): void;
  coordinates(coordinates: Coordinates, minimumZoom?: number): void;
  isCurrent(): boolean;
  cancel(): void;
}

@Injectable({ providedIn: 'root' })
export class MapCameraService {
  private readonly document = inject(DOCUMENT);
  private map: Map | null = null;
  private generation = 0;
  private frame: number | null = null;
  private removeGestureListeners: (() => void) | null = null;
  private pendingFocus: {
    isCurrent: () => boolean;
    action: () => void;
  } | null = null;
  private layoutObserver: MutationObserver | null = null;
  private resizeObserver: ResizeObserver | null = null;

  attach(map: Map): void {
    this.detach();
    this.map = map;
    const viewport = map.getViewport();
    const keyboardTarget = map.getTargetElement();
    const cancel = () => this.cancel();
    const isMapControl = (target: EventTarget | null) =>
      target instanceof Element && target.closest('.ol-control button') !== null;
    const cancelForKey = (event: KeyboardEvent) => {
      const activatesControl = ['Enter', ' '].includes(event.key) &&
        isMapControl(event.target);
      if (CAMERA_KEYS.has(event.key) || activatesControl) cancel();
    };
    // Capture runs before OpenLayers starts the control's own zoom animation.
    const cancelForControl = (event: MouseEvent) => {
      if (isMapControl(event.target)) cancel();
    };
    const layoutTarget = keyboardTarget.parentElement ?? keyboardTarget;
    const resume = () => this.resumeFocus();
    viewport.addEventListener('pointerdown', cancel, { passive: true });
    viewport.addEventListener('wheel', cancel, { passive: true });
    viewport.addEventListener('click', cancelForControl, true);
    keyboardTarget.addEventListener('keydown', cancelForKey);
    layoutTarget.addEventListener('transitionend', resume);
    this.document.defaultView?.addEventListener('resize', resume);
    if (typeof MutationObserver !== 'undefined') {
      this.layoutObserver = new MutationObserver(resume);
      this.layoutObserver.observe(layoutTarget, {
        attributes: true,
        attributeFilter: ['class', 'style', 'data-snap'],
        childList: true,
        subtree: true,
      });
    }
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(resume);
      this.resizeObserver.observe(keyboardTarget);
    }
    this.removeGestureListeners = () => {
      viewport.removeEventListener('pointerdown', cancel);
      viewport.removeEventListener('wheel', cancel);
      viewport.removeEventListener('click', cancelForControl, true);
      keyboardTarget.removeEventListener('keydown', cancelForKey);
      layoutTarget.removeEventListener('transitionend', resume);
      this.document.defaultView?.removeEventListener('resize', resume);
    };
  }

  detach(): void {
    this.cancel();
    this.removeGestureListeners?.();
    this.removeGestureListeners = null;
    this.layoutObserver?.disconnect();
    this.layoutObserver = null;
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.map = null;
  }

  cancel(): void {
    this.generation++;
    this.pendingFocus = null;
    if (this.frame !== null) {
      this.document.defaultView?.cancelAnimationFrame(this.frame);
      this.frame = null;
    }
    this.map?.getView().cancelAnimations();
  }

  createFocusRequest(): MapFocusRequest {
    this.cancel();
    const generation = this.generation;
    const isCurrent = () => generation === this.generation && this.map !== null;
    return {
      isCurrent,
      cancel: () => {
        if (isCurrent()) this.cancel();
      },
      point: (coordinates, minimumZoom = 16) => {
        if (!getProjectedCoordinateExtent([coordinates])) return;
        this.schedule(isCurrent, () => {
          const view = this.map?.getView();
          if (!view) return;
          const zoom = Math.max(view.getZoom() ?? minimumZoom, minimumZoom);
          this.pan(fromLonLat(coordinates), zoom);
        });
      },
      coordinates: (coordinates, minimumZoom = 12) => {
        const extent = getProjectedCoordinateExtent(coordinates);
        if (extent) {
          this.schedule(isCurrent, () => this.focusExtent(extent, minimumZoom));
        }
      },
    };
  }

  focusPoint(coordinates: [number, number], minimumZoom = 16): void {
    this.createFocusRequest().point(coordinates, minimumZoom);
  }

  showOverview(coordinates: [number, number], zoom: number): void {
    if (!getProjectedCoordinateExtent([coordinates])) return;
    const request = this.createFocusRequest();
    this.schedule(request.isCurrent, () => this.pan(fromLonLat(coordinates), zoom));
  }

  fitExtent(extent: Extent, minimumZoom = 12, maximumZoom = 16): void {
    const request = this.createFocusRequest();
    this.schedule(request.isCurrent, () =>
      this.focusExtent(extent, minimumZoom, maximumZoom),
    );
  }

  private schedule(isCurrent: () => boolean, action: () => void): void {
    if (!isCurrent()) return;
    this.pendingFocus = { isCurrent, action };
    this.resumeFocus();
  }

  private resumeFocus(): void {
    const window = this.document.defaultView;
    if (!window || !this.pendingFocus || this.frame !== null) return;
    // Read the panel's new layout after Angular has rendered the selection.
    this.frame = window.requestAnimationFrame(() => {
      this.frame = null;
      const pending = this.pendingFocus;
      if (!pending) return;
      if (!pending.isCurrent()) {
        this.pendingFocus = null;
        return;
      }
      // Keep the request until a sheet/layout change reveals usable map space.
      if (!this.padding()) return;
      this.pendingFocus = null;
      pending.action();
    });
  }

  private focusExtent(
    extent: Extent,
    minimumZoom: number,
    maximumZoom = 16,
  ): void {
    const map = this.map;
    const size = map?.getSize();
    const padding = this.padding();
    if (
      !map || !size || !padding ||
      extent.length !== 4 || !extent.every(Number.isFinite)
    ) return;
    const view = map.getView();
    const width = size[0] - padding[1] - padding[3];
    const height = size[1] - padding[0] - padding[2];
    const rotation = view.getRotation();
    const cos = Math.abs(Math.cos(rotation));
    const sin = Math.abs(Math.sin(rotation));
    const extentWidth = extent[2] - extent[0];
    const extentHeight = extent[3] - extent[1];
    const resolution = Math.max(
      (extentWidth * cos + extentHeight * sin) / width,
      (extentWidth * sin + extentHeight * cos) / height,
    );
    const currentZoom = view.getZoom() ?? minimumZoom;
    const fitZoom = (resolution > 0
      ? view.getZoomForResolution(resolution)
      : Math.max(currentZoom, maximumZoom)) ?? maximumZoom;
    // Zoom out only to make room; zoom in only when the current view lacks detail.
    const detailZoom = Math.min(minimumZoom, fitZoom, maximumZoom);
    const zoom = currentZoom < detailZoom
      ? detailZoom
      : Math.min(currentZoom, fitZoom);
    const center = [(extent[0] + extent[2]) / 2, (extent[1] + extent[3]) / 2];
    this.pan(center, zoom);
  }

  private pan(coordinate: number[], zoom: number): void {
    const map = this.map;
    const size = map?.getSize();
    const padding = this.padding();
    if (!map || !size || !padding) return;
    const view = map.getView();
    const targetZoom = view.getConstrainedZoom(zoom) ?? zoom;
    const resolution = view.getResolutionForZoom(targetZoom);
    const rotation = view.getRotation();
    const dx = (padding[3] - padding[1]) / 2;
    const dy = (padding[0] - padding[2]) / 2;
    const center = [
      coordinate[0] + (-dx * Math.cos(rotation) - dy * Math.sin(rotation)) * resolution,
      coordinate[1] + (-dx * Math.sin(rotation) + dy * Math.cos(rotation)) * resolution,
    ];
    const currentCenter = view.getCenter();
    const currentZoom = view.getZoom();
    const zoomChanged = currentZoom === undefined ||
      Math.abs(currentZoom - targetZoom) > 0.01;
    const centered = currentCenter &&
      Math.hypot(center[0] - currentCenter[0], center[1] - currentCenter[1]) < resolution;
    if (!zoomChanged && centered) return;
    const reducedMotion = this.document.defaultView
      ?.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    view.cancelAnimations();
    view.animate({
      center,
      ...(zoomChanged ? { zoom: targetZoom } : {}),
      duration: reducedMotion ? 0 : 350,
      easing: easeOut,
    });
  }

  /** Reserve the portion of the map covered by the persistent information panel. */
  private padding(): [number, number, number, number] | null {
    const map = this.map;
    const size = map?.getSize();
    const target = map?.getTargetElement();
    if (!map || !size || !target || size[0] <= 0 || size[1] <= 0) return null;
    const padding: [number, number, number, number] = [32, 64, 32, 32];
    const panel = target.parentElement?.querySelector<HTMLElement>('.map-panel');
    if (panel) {
      if (panel.classList.contains('is-dragging')) return null;
      const mapRect = target.getBoundingClientRect();
      const panelRect = panel.getBoundingClientRect();
      if (panelRect.width > 0 && panelRect.height > 0) {
        if (panel.classList.contains('is-desktop')) {
          padding[3] = Math.max(padding[3], panelRect.right - mapRect.left + 24);
        } else {
          // The CSS variable holds the destination height during sheet transitions.
          const style = this.document.defaultView?.getComputedStyle(panel);
          const destinationHeight = Number.parseFloat(
            style?.getPropertyValue('--map-panel-height') ?? '',
          );
          const toolbarHeight = Number.parseFloat(
            style?.getPropertyValue('--app-bottom-toolbar-height') ?? '',
          ) || 0;
          const coveredHeight = Number.isFinite(destinationHeight)
            ? destinationHeight + toolbarHeight + 24
            : mapRect.bottom - panelRect.top + 24;
          padding[2] = Math.max(padding[2], coveredHeight);
        }
      }
    }
    // A fully expanded sheet has no usable map area; retain focus until it shrinks.
    const width = size[0] - padding[1] - padding[3];
    const height = size[1] - padding[0] - padding[2];
    return width >= 80 && height >= 80 ? padding : null;
  }
}
