import { DOCUMENT, NgOptimizedImage } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  ViewContainerRef,
  afterNextRender,
  afterRenderEffect,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { CdkPortalOutlet, ComponentPortal } from '@angular/cdk/portal';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MapPanelService, MapPanelSnap } from './map-panel.service';
import { MAP_PANEL_REF } from './map-panel-ref';
import { PhotoHandleTone, samplePhotoHandleTone } from './map-panel-photo-contrast';
import type { StationHeaderImage } from '../../subway-station-dialog/station-images';

interface FavoritablePanelContent {
  isFavorite(): boolean;
  favoriteIcon(): string;
  toggleFavorite(): void;
  setFavoriteHover?(hovering: boolean): void;
  canFavorite?(): boolean;
}

function isFavoritable(value: unknown): value is FavoritablePanelContent {
  return !!value && typeof value === 'object' &&
    'isFavorite' in value && typeof value.isFavorite === 'function' &&
    'favoriteIcon' in value && typeof value.favoriteIcon === 'function' &&
    'toggleFavorite' in value && typeof value.toggleFavorite === 'function';
}

interface IllustratedPanelContent {
  headerImage(): StationHeaderImage | undefined;
  onHeaderImageError(): void;
}

function isIllustrated(value: unknown): value is IllustratedPanelContent {
  return !!value && typeof value === 'object' &&
    'headerImage' in value && typeof value.headerImage === 'function' &&
    'onHeaderImageError' in value && typeof value.onHeaderImageError === 'function';
}

const SNAP_POINTS: MapPanelSnap[] = ['compact', 'half', 'expanded'];
const CONTENT_SCROLL_PAUSE_MS = 250;

type DragSample = Pick<PointerEvent, 'pointerId' | 'clientY' | 'timeStamp'>;

interface BodyGesture {
  startX: number;
  startY: number;
  scrollTop: number;
  dragging: boolean;
}

interface PanelDrag {
  source: 'handle' | 'body';
  id: number;
  startY: number;
  startHeight: number;
  lastY: number;
  lastTime: number;
  velocity: number;
  moved: boolean;
}

@Component({
  selector: 'app-map-panel',
  imports: [CdkPortalOutlet, MatButtonModule, MatIconModule, NgOptimizedImage],
  templateUrl: './map-panel.component.html',
  styleUrl: './map-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MapPanelComponent {
  readonly panelService = inject(MapPanelService);
  readonly hasSelections = input(false);
  readonly heightChange = output<number>();
  readonly expandedProgressChange = output<number>();
  readonly draggingChange = output<boolean>();
  readonly clearSelections = output<void>();

  private readonly document = inject(DOCUMENT);
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly viewContainerRef = inject(ViewContainerRef);
  private readonly panelFrame = viewChild<ElementRef<HTMLElement>>('panelFrame');
  private readonly panelBody = viewChild<ElementRef<HTMLElement>>('panelBody');
  private readonly panelTitleBlock = viewChild<ElementRef<HTMLElement>>('panelTitleBlock');
  private readonly panelTitleRow = viewChild<ElementRef<HTMLElement>>('panelTitleRow');
  private readonly panelFooter = viewChild<ElementRef<HTMLElement>>('panelFooter');
  private readonly handle = viewChild<ElementRef<HTMLElement>>('handle');
  private readonly grabber = viewChild<ElementRef<HTMLElement>>('grabber');
  private readonly headerPhoto = viewChild<ElementRef<HTMLImageElement>>('headerPhoto');
  private readonly photoSampleRevision = signal(0);
  private photoContrastContext?: CanvasRenderingContext2D | null;
  private photoSampleFrame?: number;
  readonly grabberTone = signal<PhotoHandleTone | null>(null);
  private readonly viewportHeight = signal(0);
  readonly isDesktop = signal(false);
  readonly hasPanelContent = computed(() =>
    this.panelService.panel() !== null || this.hasSelections(),
  );
  readonly showHandle = computed(() => !this.isDesktop() && this.hasPanelContent());
  readonly regionLabel = computed(() => {
    const panel = this.panelService.panel();
    if (panel) return `Detalhes no mapa: ${this.title()}`;
    return this.hasSelections() ? 'Seleções do mapa' : 'Ações do mapa';
  });
  readonly favoriteContent = signal<FavoritablePanelContent | null>(null);
  readonly illustratedContent = signal<IllustratedPanelContent | null>(null);
  readonly headerImage = computed(() => this.illustratedContent()?.headerImage());
  readonly photoProgress = computed(() => this.isDesktop() ? 1 : this.toolbarProgress());
  private readonly bodyScrollTop = signal(0);
  // Only the handle's paint reacts to scroll; native sticky positioning owns
  // the header collapse, without changing the scroll area's geometry.
  readonly handlePhotoVisibility = computed(() => this.headerImage()
    ? this.photoProgress() * Math.max(0, 1 - this.bodyScrollTop() / 168)
    : 0,
  );
  private readonly compactHeight = signal(152);
  readonly dragHeight = signal<number | null>(null);

  readonly anchors = computed<Record<MapPanelSnap, number>>(() => {
    const topGap = this.isDesktop() ? 104 : 12;
    const full = Math.max(0, this.viewportHeight() - topGap);
    const compact = Math.min(full, this.compactHeight());
    return {
      compact,
      half: Math.min(full, Math.max(
        this.viewportHeight() / 2,
        compact + (full - compact) / 4,
      )),
      expanded: full,
    };
  });
  readonly height = computed(() => {
    if (!this.viewportHeight()) return null;
    if (!this.hasPanelContent()) return Math.round(this.anchors().compact);
    return Math.round(this.isDesktop()
      ? this.anchors().expanded
      : (this.dragHeight() ?? this.anchors()[this.panelService.snap()]));
  });
  readonly expandedProgress = computed(() => {
    const anchors = this.anchors();
    const range = anchors.expanded - anchors.compact;
    if (range <= 0) return this.panelService.snap() === 'expanded' ? 1 : 0;

    const height = this.hasPanelContent()
      ? (this.dragHeight() ?? anchors[this.panelService.snap()])
      : anchors.compact;
    return Math.max(0, Math.min(1, (height - anchors.compact) / range));
  });
  readonly toolbarProgress = computed(() => {
    if (this.isDesktop() || !this.hasPanelContent()) return 0;
    const anchors = this.anchors();
    const range = anchors.expanded - anchors.half;
    const height = this.dragHeight() ?? anchors[this.panelService.snap()];
    return range > 0 ? Math.max(0, Math.min(1, (height - anchors.half) / range)) : 0;
  });
  readonly snapIndex = computed(() => SNAP_POINTS.indexOf(this.panelService.snap()));
  readonly snapLabel = computed(() => ['Compacto', 'Meia altura', 'Expandido'][this.snapIndex()]);
  readonly summary = computed(() => {
    const summary = this.panelService.panel()?.summary;
    return typeof summary === 'function' ? summary() : (summary ?? '');
  });
  readonly title = computed(() => {
    const title = this.panelService.panel()?.title;
    return typeof title === 'function' ? title() : (title ?? '');
  });

  readonly contentPortal = computed(() => {
    const panel = this.panelService.panel();
    if (!panel?.component) return null;

    return new ComponentPortal(
      panel.component,
      this.viewContainerRef,
      Injector.create({
        parent: this.viewContainerRef.injector,
        providers: [
          { provide: MAT_DIALOG_DATA, useFactory: () => panel.ref.data },
          { provide: MAP_PANEL_REF, useValue: panel.ref.closeHandle },
        ],
      }),
    );
  });

  private resizeObserver?: ResizeObserver;
  private observedHeader: HTMLElement | null = null;
  private previousFocus: HTMLElement | null = null;
  private wasOpen = false;
  private activePanelId: number | null = null;
  private activePointer: PanelDrag | null = null;
  private suppressHandleClick = false;
  private bodyGesture: BodyGesture | null = null;
  private suppressBodyClick = false;
  private wheelTimer: ReturnType<typeof setTimeout> | undefined;
  private wheelDirection = 0;
  private lastUpwardContentWheelTime = Number.NEGATIVE_INFINITY;

  constructor() {
    afterRenderEffect({ read: () => {
      this.photoSampleRevision();
      this.handlePhotoVisibility();
      this.headerPhoto();
      this.grabber();
      this.handle();
      this.schedulePhotoContrastSample();
    } });
    afterNextRender(() => {
      const media = this.document.defaultView?.matchMedia('(min-width: 768px)');
      if (media) {
        this.isDesktop.set(media.matches);
        const updateDesktop = (event: MediaQueryListEvent) => this.isDesktop.set(event.matches);
        media.addEventListener('change', updateDesktop);
        this.destroyRef.onDestroy(() => media.removeEventListener('change', updateDesktop));
      }
      if (typeof ResizeObserver !== 'undefined') {
        this.resizeObserver = new ResizeObserver(() => this.measure());
        for (const element of [this.host, this.panelFrame(), this.panelFooter()]) {
          if (element) this.resizeObserver.observe(element.nativeElement);
        }
      }
      this.observeContentHeader();
      this.measure();
      const body = this.panelBody()?.nativeElement;
      if (body) {
        const move = (event: TouchEvent) => this.onBodyTouchMove(event);
        const wheel = (event: WheelEvent) => this.onBodyWheel(event);
        const click = (event: MouseEvent) => {
          if (!this.suppressBodyClick) return;
          event.preventDefault();
          event.stopImmediatePropagation();
          this.suppressBodyClick = false;
        };
        body.addEventListener('touchmove', move, { passive: false });
        body.addEventListener('wheel', wheel, { passive: false });
        body.addEventListener('click', click, true);
        this.destroyRef.onDestroy(() => {
          body.removeEventListener('touchmove', move);
          body.removeEventListener('wheel', wheel);
          body.removeEventListener('click', click, true);
        });
      }
    });
    this.destroyRef.onDestroy(() => {
      this.resizeObserver?.disconnect();
      if (this.photoSampleFrame !== undefined) {
        this.document.defaultView?.cancelAnimationFrame(this.photoSampleFrame);
      }
      clearTimeout(this.wheelTimer);
      this.panelService.toolbarHideProgress.set(0);
      this.panelService.dragging.set(false);
    });

    effect(() => {
      const panelId = this.panelService.panel()?.id ?? null;
      const isOpen = panelId !== null;
      this.hasSelections();
      if (isOpen && !this.wasOpen) this.capturePreviousFocus();
      const shouldRestoreFocus = !isOpen && this.wasOpen;
      this.wasOpen = isOpen;
      this.activePointer = null;
      this.bodyGesture = null;
      this.lastUpwardContentWheelTime = Number.NEGATIVE_INFINITY;
      clearTimeout(this.wheelTimer);
      this.wheelTimer = undefined;
      this.draggingChange.emit(false);
      this.dragHeight.set(null);
      if (panelId !== this.activePanelId) {
        this.activePanelId = panelId;
        this.favoriteContent.set(null);
        this.illustratedContent.set(null);
      }
      afterNextRender(() => {
        this.resetContentScroll();
        this.observeContentHeader();
        this.measure();
        if (isOpen) (this.handle()?.nativeElement ?? this.panelFrame()?.nativeElement)?.focus({ preventScroll: true });
        else if (shouldRestoreFocus) this.restoreFocus();
      }, { injector: this.injector });
    });

    effect(() => {
      if (this.panelService.snap() === 'compact') {
        afterNextRender(() => this.resetContentScroll(), { injector: this.injector });
      }
    });

    effect(() => {
      const progress = this.isDesktop() ? 0 : this.expandedProgress();
      this.expandedProgressChange.emit(progress);
      this.panelService.toolbarHideProgress.set(this.toolbarProgress());
      this.panelService.dragging.set(this.dragHeight() !== null);
    });
  }

  onAttached(attachedRef: unknown): void {
    if (attachedRef && typeof attachedRef === 'object' && 'instance' in attachedRef) {
      this.panelService.panel()?.ref.attachComponentInstance(attachedRef.instance);
      this.favoriteContent.set(isFavoritable(attachedRef.instance) ? attachedRef.instance : null);
      this.illustratedContent.set(isIllustrated(attachedRef.instance) ? attachedRef.instance : null);
      afterNextRender(() => {
        this.observeContentHeader();
        this.measure();
      }, { injector: this.injector });
    }
  }

  // Measure the top edge against a fixed baseline. The bottom edge moves into
  // the toolbar's space independently, so it must not enter pointer deltas.
  private renderedHeight(): number {
    const frame = this.panelFrame()?.nativeElement;
    const rect = frame?.getBoundingClientRect();
    return rect?.height
      ? this.host.nativeElement.getBoundingClientRect().bottom - rect.top
      : this.height() ?? 0;
  }

  onBodyTouchStart(event: TouchEvent): void {
    this.suppressBodyClick = false;
    if (!this.showHandle() || event.touches.length !== 1) {
      this.onBodyGestureCancel();
      return;
    }
    const touch = event.touches[0];
    this.bodyGesture = {
      startX: touch.clientX, startY: touch.clientY,
      scrollTop: this.panelBody()?.nativeElement.scrollTop ?? 0, dragging: false,
    };
  }

  private onBodyTouchMove(event: TouchEvent): void {
    const gesture = this.bodyGesture;
    if (!gesture || event.touches.length !== 1) return;
    const touch = event.touches[0];
    const delta = gesture.startY - touch.clientY;
    if (!gesture.dragging) {
      if (Math.abs(delta) < 6) return;
      if (Math.abs(touch.clientX - gesture.startX) > Math.abs(delta) ||
          (this.panelService.snap() === 'expanded' && (delta > 0 || gesture.scrollTop > 0))) {
        this.bodyGesture = null;
        return;
      }
      if (!event.cancelable) return;
      this.startBodyDrag(gesture.startY, event.timeStamp);
      gesture.dragging = true;
    }
    event.preventDefault();
    this.onHandlePointerMove({ pointerId: -1, clientY: touch.clientY, timeStamp: event.timeStamp });
  }

  onBodyTouchEnd(event: TouchEvent): void {
    if (this.bodyGesture?.dragging) {
      const touch = event.changedTouches[0];
      this.suppressBodyClick = true;
      this.onHandlePointerUp({ pointerId: -1, clientY: touch.clientY, timeStamp: event.timeStamp });
    }
    this.bodyGesture = null;
  }

  onBodyPointerDown(event: PointerEvent): void {
    if (event.pointerType === 'touch' || !this.showHandle() || event.button !== 0 || event.isPrimary === false) return;
    this.suppressBodyClick = false;
    this.bodyGesture = {
      startX: event.clientX, startY: event.clientY,
      scrollTop: this.panelBody()?.nativeElement.scrollTop ?? 0, dragging: false,
    };
  }

  onBodyPointerMove(event: PointerEvent): void {
    if (event.pointerType === 'touch') return;
    const gesture = this.bodyGesture;
    if (!gesture) return;
    const delta = gesture.startY - event.clientY;
    if (!gesture.dragging) {
      if (Math.abs(delta) < 6) return;
      if (Math.abs(event.clientX - gesture.startX) > Math.abs(delta) ||
          (this.panelService.snap() === 'expanded' && (delta > 0 || gesture.scrollTop > 0))) {
        this.bodyGesture = null;
        return;
      }
      this.startBodyDrag(gesture.startY, event.timeStamp, event.pointerId);
      gesture.dragging = true;
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    }
    event.preventDefault();
    this.onHandlePointerMove(event);
  }

  onBodyPointerUp(event: PointerEvent): void {
    if (event.pointerType === 'touch') return;
    if (this.bodyGesture?.dragging) {
      this.suppressBodyClick = true;
      this.onHandlePointerUp(event);
    }
    this.bodyGesture = null;
  }

  onBodyPointerCancel(event: PointerEvent): void {
    if (event.pointerType !== 'touch') this.onBodyGestureCancel();
  }

  onBodyGestureCancel(): void {
    this.bodyGesture = null;
    this.onHandlePointerCancel();
  }

  private startBodyDrag(y: number, time: number, id = -1): void {
    clearTimeout(this.wheelTimer);
    this.wheelTimer = undefined;
    const startHeight = this.renderedHeight();
    this.activePointer = {
      source: 'body', id, startY: y, startHeight, lastY: y, lastTime: time, velocity: 0, moved: false,
    };
    this.draggingChange.emit(true);
    this.dragHeight.set(startHeight);
  }

  private onBodyWheel(event: WheelEvent): void {
    if (!this.showHandle() || this.activePointer || event.ctrlKey || Math.abs(event.deltaX) > Math.abs(event.deltaY) || !event.deltaY) return;
    const body = this.panelBody()?.nativeElement;
    if (!this.wheelTimer && this.panelService.snap() === 'expanded') {
      // Keep upward content scrolling and its momentum at the top native. A
      // downward scroll must not extend the pause before the sheet collapses.
      const scrollingUp = event.deltaY < 0;
      const continuingUpwardScroll = scrollingUp &&
        event.timeStamp - this.lastUpwardContentWheelTime < CONTENT_SCROLL_PAUSE_MS;
      if (event.deltaY > 0 || (body?.scrollTop ?? 0) > 0 || continuingUpwardScroll) {
        this.lastUpwardContentWheelTime = scrollingUp
          ? event.timeStamp
          : Number.NEGATIVE_INFINITY;
        return;
      }
    }
    event.preventDefault();
    const scale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? this.viewportHeight() : 1;
    const anchors = this.anchors();
    this.draggingChange.emit(true);
    this.dragHeight.set(Math.max(anchors.compact, Math.min(anchors.expanded,
      (this.dragHeight() ?? this.renderedHeight()) + event.deltaY * scale)));
    this.wheelDirection = Math.sign(event.deltaY);
    clearTimeout(this.wheelTimer);
    this.wheelTimer = setTimeout(() => {
      const height = this.dragHeight() ?? this.height() ?? 0;
      const nearest = this.nearestSnap(height);
      const current = this.panelService.snap();
      this.panelService.setSnap(nearest === current
        ? SNAP_POINTS[Math.max(0, Math.min(2, SNAP_POINTS.indexOf(current) + this.wheelDirection))]
        : nearest);
      this.wheelTimer = undefined;
      this.dragHeight.set(null);
      this.draggingChange.emit(false);
    }, 160);
  }

  onHandlePointerDown(event: PointerEvent): void {
    if (!this.showHandle()) return;
    if (event.isPrimary === false || (event.pointerType === 'mouse' && event.button !== 0)) return;
    clearTimeout(this.wheelTimer);
    this.wheelTimer = undefined;
    const startHeight = this.renderedHeight();
    this.activePointer = {
      source: 'handle',
      id: event.pointerId,
      startY: event.clientY,
      startHeight,
      lastY: event.clientY,
      lastTime: event.timeStamp,
      velocity: 0,
      moved: false,
    };
    this.draggingChange.emit(true);
    this.suppressHandleClick = false;
    this.dragHeight.set(startHeight);
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  onHandlePointerMove(event: DragSample): void {
    const pointer = this.activePointer;
    if (!pointer || pointer.id !== event.pointerId) return;
    const delta = pointer.startY - event.clientY;
    if (Math.abs(delta) > 4) pointer.moved = true;
    const elapsed = event.timeStamp - pointer.lastTime;
    if (elapsed > 0 && event.clientY !== pointer.lastY) {
      pointer.velocity = (pointer.lastY - event.clientY) / elapsed;
      pointer.lastY = event.clientY;
      pointer.lastTime = event.timeStamp;
    }
    const anchors = this.anchors();
    this.dragHeight.set(Math.max(anchors.compact, Math.min(anchors.expanded, pointer.startHeight + delta)));
  }

  onHandlePointerUp(event: DragSample): void {
    const pointer = this.activePointer;
    if (!pointer || pointer.id !== event.pointerId) return;
    this.onHandlePointerMove(event);
    this.activePointer = null;
    if (pointer.moved) {
      const anchors = this.anchors();
      // Capture releases near an anchor before applying momentum between anchors.
      const velocity = event.timeStamp - pointer.lastTime < 120 ? pointer.velocity : 0;
      const projection = Math.max(-anchors.expanded / 4, Math.min(anchors.expanded / 4, velocity * 140));
      const releasedHeight = this.dragHeight() ?? pointer.startHeight;
      const nearest = this.nearestSnap(releasedHeight);
      const snap = Math.abs(anchors[nearest] - releasedHeight) <= 32
        ? nearest
        : this.nearestSnap(releasedHeight + projection);
      this.panelService.setSnap(snap);
      this.suppressHandleClick = pointer.source === 'handle';
    }
    this.dragHeight.set(null);
    this.draggingChange.emit(false);
  }

  onHandlePointerCancel(): void {
    if (!this.activePointer) return;
    this.activePointer = null;
    this.dragHeight.set(null);
    this.draggingChange.emit(false);
  }

  onHandleClick(event: MouseEvent): void {
    if (this.suppressHandleClick) {
      event.preventDefault();
      this.suppressHandleClick = false;
      return;
    }
    this.panelService.setSnap(SNAP_POINTS[(this.snapIndex() + 1) % SNAP_POINTS.length]);
  }

  onHandleKeydown(event: KeyboardEvent): void {
    const index = this.snapIndex();
    const target: Record<string, MapPanelSnap> = {
      ArrowUp: SNAP_POINTS[Math.min(2, index + 1)],
      ArrowDown: SNAP_POINTS[Math.max(0, index - 1)],
      Home: 'compact',
      End: 'expanded',
    };
    if (event.key in target) {
      event.preventDefault();
      event.stopPropagation();
      this.panelService.setSnap(target[event.key]);
    }
  }

  handleEscape(event: Event): void {
    if (event.defaultPrevented) return;
    event.preventDefault();
    event.stopPropagation();
    if (this.panelService.panel()) this.panelService.close();
    else if (this.hasSelections()) this.clearSelections.emit();
    else this.panelService.setSnap('compact');
  }

  closeContent(): void {
    if (this.panelService.panel()) this.panelService.close();
    else this.clearSelections.emit();
  }

  private observeContentHeader(): void {
    if (this.observedHeader) this.resizeObserver?.unobserve(this.observedHeader);
    this.observedHeader = this.panelTitleBlock()?.nativeElement ??
      this.panelBody()?.nativeElement.querySelector<HTMLElement>('.panel-header') ?? null;
    if (this.observedHeader) this.resizeObserver?.observe(this.observedHeader);
  }

  private nearestSnap(height: number): MapPanelSnap {
    const anchors = this.anchors();
    return SNAP_POINTS.reduce((nearest, candidate) =>
      Math.abs(anchors[candidate] - height) < Math.abs(anchors[nearest] - height)
        ? candidate : nearest,
    );
  }

  private measure(): void {
    this.photoSampleRevision.update((revision) => revision + 1);
    this.viewportHeight.set(this.host.nativeElement.clientHeight);
    const body = this.panelBody()?.nativeElement;
    const handleHeight = this.handle()?.nativeElement.getBoundingClientRect().height ?? 0;
    const footerHeight = this.panelFooter()?.nativeElement.getBoundingClientRect().height ?? 0;
    // The photo is part of the scrollable content; only the sticky title
    // belongs in the compact anchor.
    const titleBlock = this.panelTitleBlock()?.nativeElement;
    const titleRow = this.panelTitleRow()?.nativeElement;
    const titleStyles = titleBlock ? this.document.defaultView?.getComputedStyle(titleBlock) : null;
    let headerHeight = titleRow
      ? titleRow.getBoundingClientRect().height + parseFloat(titleStyles?.paddingBottom || '0')
      : 0;
    if (!this.panelService.panel() && this.hasSelections() && body && this.observedHeader) {
      headerHeight = this.observedHeader.getBoundingClientRect().bottom - body.getBoundingClientRect().top + 8;
    }
    const minimumHeight = this.hasPanelContent() ? 96 : 0;
    this.compactHeight.set(Math.max(minimumHeight, handleHeight + footerHeight + headerHeight));
    this.heightChange.emit(Math.round(this.renderedHeight()));
  }

  private schedulePhotoContrastSample(): void {
    const view = this.document.defaultView;
    if (!view || this.photoSampleFrame !== undefined) return;
    this.photoSampleFrame = view.requestAnimationFrame(() => {
      this.photoSampleFrame = undefined;
      this.updatePhotoContrast();
    });
  }

  private updatePhotoContrast(): void {
    const image = this.headerPhoto()?.nativeElement;
    const grabber = this.grabber()?.nativeElement;
    const handle = this.handle()?.nativeElement;
    const frame = this.panelFrame()?.nativeElement;
    if (!this.handlePhotoVisibility() || !image?.complete || !image.naturalWidth ||
      !grabber || !handle || !frame) {
      this.grabberTone.set(null);
      return;
    }
    if (this.photoContrastContext === undefined) {
      const canvas = this.document.createElement('canvas');
      canvas.width = 16;
      canvas.height = 4;
      this.photoContrastContext = canvas.getContext('2d', { willReadFrequently: true });
    }
    const view = this.document.defaultView;
    this.grabberTone.set(this.photoContrastContext && view
      ? samplePhotoHandleTone(image, grabber.getBoundingClientRect(), this.photoContrastContext,
        view.getComputedStyle(frame).backgroundColor, view.getComputedStyle(handle).backgroundColor,
        this.grabberTone())
      : null);
  }

  onHeaderPhotoLoad(): void {
    this.grabberTone.set(null);
    this.photoSampleRevision.update((revision) => revision + 1);
  }

  onBodyScroll(): void {
    this.bodyScrollTop.set(Math.max(0, this.panelBody()?.nativeElement.scrollTop ?? 0));
  }

  private resetContentScroll(): void {
    this.bodyScrollTop.set(0);
    const body = this.panelBody()?.nativeElement;
    if (body) body.scrollTop = 0;
  }

  private capturePreviousFocus(): void {
    const element = this.document.activeElement;
    this.previousFocus = element && element !== this.document.body && 'focus' in element
      ? element as HTMLElement : null;
  }

  private restoreFocus(): void {
    const target = this.previousFocus?.isConnected
      ? this.previousFocus : this.document.getElementById('ol-map-tab');
    this.previousFocus = null;
    target?.focus({ preventScroll: true });
  }
}
