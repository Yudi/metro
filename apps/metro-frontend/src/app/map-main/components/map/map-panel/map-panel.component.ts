import { DOCUMENT, NgOptimizedImage } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  ViewContainerRef,
  afterNextRender,
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

const SNAP_POINTS: MapPanelSnap[] = ['compact', 'half', 'expanded'];

interface PanelDrag {
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
  private readonly panelFooter = viewChild<ElementRef<HTMLElement>>('panelFooter');
  private readonly handle = viewChild<ElementRef<HTMLElement>>('handle');
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
  private readonly compactHeight = signal(152);
  readonly dragHeight = signal<number | null>(null);

  readonly anchors = computed<Record<MapPanelSnap, number>>(() => {
    const topGap = this.isDesktop() ? 104 : 80;
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
  private activePointer: PanelDrag | null = null;
  private suppressHandleClick = false;

  constructor() {
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
    });
    this.destroyRef.onDestroy(() => this.resizeObserver?.disconnect());

    effect(() => {
      const isOpen = this.panelService.panel() !== null;
      this.hasSelections();
      if (isOpen && !this.wasOpen) this.capturePreviousFocus();
      const shouldRestoreFocus = !isOpen && this.wasOpen;
      this.wasOpen = isOpen;
      this.activePointer = null;
      this.dragHeight.set(null);
      this.favoriteContent.set(null);
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

    effect(() => this.expandedProgressChange.emit(this.expandedProgress()));
  }

  onAttached(attachedRef: unknown): void {
    if (attachedRef && typeof attachedRef === 'object' && 'instance' in attachedRef) {
      this.panelService.panel()?.ref.attachComponentInstance(attachedRef.instance);
      this.favoriteContent.set(isFavoritable(attachedRef.instance) ? attachedRef.instance : null);
      afterNextRender(() => {
        this.observeContentHeader();
        this.measure();
      }, { injector: this.injector });
    }
  }

  onHandlePointerDown(event: PointerEvent): void {
    if (!this.showHandle()) return;
    if (event.isPrimary === false || (event.pointerType === 'mouse' && event.button !== 0)) return;
    const startHeight = this.panelFrame()?.nativeElement.getBoundingClientRect().height || this.height() || 0;
    this.activePointer = {
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

  onHandlePointerMove(event: PointerEvent): void {
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

  onHandlePointerUp(event: PointerEvent): void {
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
      this.suppressHandleClick = true;
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
    this.viewportHeight.set(this.host.nativeElement.clientHeight);
    const body = this.panelBody()?.nativeElement;
    const handleHeight = this.handle()?.nativeElement.getBoundingClientRect().height ?? 0;
    const footerHeight = this.panelFooter()?.nativeElement.getBoundingClientRect().height ?? 0;
    let headerHeight = this.panelTitleBlock()?.nativeElement.getBoundingClientRect().height ?? 0;
    if (!this.panelService.panel() && this.hasSelections() && body && this.observedHeader) {
      headerHeight = this.observedHeader.getBoundingClientRect().bottom - body.getBoundingClientRect().top + 8;
    }
    const minimumHeight = this.hasPanelContent() ? 96 : 0;
    this.compactHeight.set(Math.max(minimumHeight, handleHeight + footerHeight + headerHeight));
    this.heightChange.emit(Math.round(this.panelFrame()?.nativeElement.getBoundingClientRect().height ?? 0));
  }

  private resetContentScroll(): void {
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
