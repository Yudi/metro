import {
  ChangeDetectionStrategy,
  Component,
  ViewChild,
  ElementRef,
  AfterViewInit,
  input,
  output,
  inject,
  signal,
  effect,
  DestroyRef,
  NgZone,
  PLATFORM_ID,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { DOCUMENT } from '@angular/common';
import {
  NavigationEnd,
  Router,
  RouterLink,
  RouterLinkActive,
} from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { ToolbarItem } from '../toolbar/toolbar.component';

@Component({
  selector: 'app-bottom-toolbar',
  imports: [
    RouterLink,
    RouterLinkActive,
    MatToolbarModule,
    MatButtonModule,
    MatIconModule,
  ],
  templateUrl: './bottom-toolbar.component.html',
  styleUrls: ['./bottom-toolbar.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BottomToolbarComponent implements AfterViewInit {
  public readonly items = input.required<ToolbarItem[]>();
  readonly navigateClick = output<{
    event: MouseEvent;
    item: ToolbarItem;
  }>();

  @ViewChild('toolbar', { read: ElementRef })
  private toolbarRef?: ElementRef<HTMLElement>;

  private readonly document = inject(DOCUMENT);
  private readonly ngZone = inject(NgZone);
  private readonly destroyRef = inject(DestroyRef);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly router = inject(Router);

  private readonly height = signal(0);
  private readonly currentUrl = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map(() => this.router.url),
    ),
    { initialValue: this.router.url },
  );

  private readonly _syncToCssVar = effect(() => {
    const h = this.height();
    this.document.documentElement.style.setProperty(
      '--app-bottom-toolbar-height',
      `${h}px`,
    );
  });

  ngAfterViewInit(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    const toolbarEl = this.toolbarRef?.nativeElement ?? null;

    const setHeightFromEl = (el: HTMLElement | null) => {
      const height = el ? Math.round(el.getBoundingClientRect().height) : 0;
      this.height.set(height);
    };

    requestAnimationFrame(() => setHeightFromEl(toolbarEl));

    this.ngZone.runOutsideAngular(() => {
      let ro: ResizeObserver | undefined;
      if (typeof ResizeObserver !== 'undefined' && toolbarEl) {
        ro = new ResizeObserver(() => setHeightFromEl(toolbarEl));
        ro.observe(toolbarEl);
      }

      const onWinResize = () => setHeightFromEl(toolbarEl);
      window.addEventListener('resize', onWinResize, { passive: true });

      this.destroyRef.onDestroy(() => {
        ro?.disconnect();
        window.removeEventListener('resize', onWinResize);
      });
    });
  }

  onNavigateClick(event: MouseEvent, item: ToolbarItem): void {
    if (item.route !== '/mapa') {
      return;
    }

    event.preventDefault();
    this.navigateClick.emit({ event, item });
  }

  isMapItemActive(item: ToolbarItem): boolean {
    if (item.route !== '/mapa') {
      return false;
    }

    this.currentUrl();
    return this.router.isActive(this.router.createUrlTree(['/mapa']), {
      paths: 'exact',
      queryParams: 'ignored',
      fragment: 'ignored',
      matrixParams: 'ignored',
    });
  }
}
