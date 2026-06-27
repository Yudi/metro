import {
  ChangeDetectionStrategy,
  Component,
  computed,
  signal,
  inject,
  PLATFORM_ID,
} from '@angular/core';
import {
  Router,
  NavigationEnd,
  ActivatedRoute,
  UrlTree,
  RouterModule,
} from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';

import { MatToolbarModule } from '@angular/material/toolbar';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatListModule } from '@angular/material/list';
import { BottomToolbarComponent } from '../bottom-toolbar/bottom-toolbar.component';
import { footerLinks } from '../footer/footer.component';
import { filter, map } from 'rxjs';
import { isPlatformBrowser } from '@angular/common';
import { MapViewStateStorageService } from '../../../map-main/services/map-view-state-storage.service';

@Component({
  selector: 'app-material-toolbar',
  imports: [
    RouterModule,
    MatToolbarModule,
    MatIconModule,
    MatButtonModule,
    MatMenuModule,
    MatSidenavModule,
    MatListModule,
    BottomToolbarComponent,
  ],
  templateUrl: './toolbar.component.html',
  styleUrls: ['./toolbar.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ToolbarComponent {
  readonly footerLinks = footerLinks;
  private readonly safeBackPaths = new Set([
    '/',
    '/proxima-chegada',
    '/proximo-trem',
    '/painel',
    '/mapa',
    '/historico/ocorrencias',
    '/historico/intervalos',
    '/sobre',
    '/menu',
    '/favoritos',
  ]);

  readonly items: ToolbarItem[] = [
    {
      label: 'Estado das linhas',
      shortLabel: 'Estado',
      route: '',
      icon: 'railway_alert',
    },
    {
      label: 'Próxima chegada',
      shortLabel: 'Próx. chegada',
      route: '/proxima-chegada',
      icon: 'schedule',
    },
    {
      label: 'Painel',
      shortLabel: 'Painel',
      route: '/painel',
      icon: 'dashboard',
    },
    {
      label: 'Mapa',
      shortLabel: 'Mapa',
      icon: 'map',
      route: '/mapa',
    },
    {
      label: 'Menu',
      shortLabel: 'Menu',
      icon: 'menu',
      route: '/menu',
    },
  ];

  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly mapViewStateStorage = inject(MapViewStateStorageService);

  private readonly _opened = signal(false);

  readonly opened = this._opened.asReadonly();

  private readonly queryParamMap = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });

  readonly backRoute = computed(() => {
    const route = this.queryParamMap().get('back');

    if (!route) {
      return null;
    }

    return this.getSafeBackRoute(route);
  });

  readonly noXPadding = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map(() => this.getRouteData<boolean>('noXPadding') ?? false),
    ),
    {
      initialValue: this.getRouteData<boolean>('noXPadding') ?? false,
    },
  );

  toggleSidenav() {
    this._opened.update((v) => !v);
  }

  closeSidenav() {
    this._opened.set(false);
  }

  navigateBack() {
    const route = this.backRoute();

    if (!route) {
      return;
    }

    this.router.navigateByUrl(route);
  }

  async navigateToItem(event: MouseEvent, item: ToolbarItem): Promise<void> {
    if (item.route !== '/mapa') {
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();
    this.closeSidenav();

    const isOnMap = this.router.isActive(this.router.createUrlTree(['/mapa']), {
      paths: 'exact',
      queryParams: 'ignored',
      fragment: 'ignored',
      matrixParams: 'ignored',
    });

    if (isOnMap) {
      this.mapViewStateStorage.requestDefaultState();
      await this.router.navigate(['/mapa'], {
        queryParams: this.mapViewStateStorage.getDefaultQueryParams(),
      });
      return;
    }

    await this.router.navigate(['/mapa'], {
      queryParams: (await this.mapViewStateStorage.hasLastState())
        ? this.mapViewStateStorage.getRestoreQueryParams()
        : this.mapViewStateStorage.getDefaultQueryParams(),
    });
  }

  private getRouteData<T>(key: string): T | null {
    if (!isPlatformBrowser(this.platformId)) {
      return null;
    }

    let route = this.router.routerState.root;

    while (route.firstChild) {
      route = route.firstChild;
    }

    return route.snapshot?.data?.[key] ?? null;
  }

  private getSafeBackRoute(route: string): string | null {
    if (!this.isInternalAngularUrl(route)) {
      return null;
    }

    let urlTree: UrlTree;

    try {
      urlTree = this.router.parseUrl(route);
    } catch {
      return null;
    }

    if (!this.hasOnlyPrimaryOutlet(urlTree)) {
      return null;
    }

    if (!this.isWhitelistedBackPath(urlTree)) {
      return null;
    }

    return this.router.serializeUrl(urlTree);
  }

  private isInternalAngularUrl(route: string): boolean {
    const trimmedRoute = route.trim();

    if (!trimmedRoute) {
      return false;
    }

    if (!trimmedRoute.startsWith('/')) {
      return false;
    }

    // Reject protocol-relative URLs, for example: //example.com/path
    if (trimmedRoute.startsWith('//')) {
      return false;
    }

    // Reject absolute URLs, for example: https://example.com/path
    if (/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(trimmedRoute)) {
      return false;
    }

    return true;
  }

  private hasOnlyPrimaryOutlet(urlTree: UrlTree): boolean {
    return Object.keys(urlTree.root.children).every(
      (outlet) => outlet === 'primary',
    );
  }

  private isWhitelistedBackPath(urlTree: UrlTree): boolean {
    const primaryRoute = urlTree.root.children['primary'];
    const path = primaryRoute
      ? `/${primaryRoute.segments.map((segment) => segment.path).join('/')}`
      : '/';

    return this.safeBackPaths.has(path);
  }
}

export interface ToolbarItem {
  label: string;
  shortLabel: string;
  route: string;
  icon: string;
  queryParams?: Record<string, unknown>;
}
