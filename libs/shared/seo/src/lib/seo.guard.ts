import { Location } from '@angular/common';
import { DEFAULT_CITY, getCity } from '@metro/shared/cities';
import { SeoService } from './seo.service';
import { Service, inject } from '@angular/core';
import {
  ActivatedRouteSnapshot,
  CanActivate,
  CanActivateChild,
  RouterStateSnapshot,
} from '@angular/router';
@Service()
export class SeoGuard implements CanActivate, CanActivateChild {
  private seo = inject(SeoService);
  private readonly location = inject(Location);
  canActivateChild(route: ActivatedRouteSnapshot, state: RouterStateSnapshot): boolean {
    return this.canActivate(route, state);
  }

  public canActivate(
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot,
  ): boolean {
    this.seo
      .setCity(getCity(state.url.split(/[/?#]/)[1] ?? '') ?? DEFAULT_CITY)
      .setTitle(route.data['title'])
      .setDescription(route.data['desc'])
      .setCanonicalUrl({
        rel: 'canonical',
        href: `https://metro.yudi.com.br${this.location.prepareExternalUrl(state.url.split(/[?#]/)[0])}`,
      });
    return true;
  }
}
