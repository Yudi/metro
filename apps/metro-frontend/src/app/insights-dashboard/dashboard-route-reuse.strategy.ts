import { isPlatformBrowser } from '@angular/common';
import { inject, OnDestroy, PLATFORM_ID, Service } from '@angular/core';
import {
  ActivatedRouteSnapshot,
  BaseRouteReuseStrategy,
  DetachedRouteHandle,
  destroyDetachedRouteHandle,
  Route,
} from '@angular/router';

@Service()
export class DashboardRouteReuseStrategy
  extends BaseRouteReuseStrategy
  implements OnDestroy
{
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private stored: { route: Route; handle: DetachedRouteHandle } | null = null;

  override shouldDetach(route: ActivatedRouteSnapshot): boolean {
    return this.browser && route.routeConfig?.data?.['preserveDashboard'] === true;
  }

  override store(
    route: ActivatedRouteSnapshot,
    handle: DetachedRouteHandle | null,
  ): void {
    if (!this.shouldDetach(route) || !route.routeConfig) {
      return;
    }

    this.stored = handle ? { route: route.routeConfig, handle } : null;
  }

  override shouldAttach(route: ActivatedRouteSnapshot): boolean {
    return this.shouldDetach(route) && this.stored?.route === route.routeConfig;
  }

  override retrieve(route: ActivatedRouteSnapshot): DetachedRouteHandle | null {
    return this.shouldAttach(route) ? this.stored?.handle ?? null : null;
  }

  ngOnDestroy(): void {
    if (this.stored) {
      destroyDetachedRouteHandle(this.stored.handle);
      this.stored = null;
    }
  }
}
