import { SeoService } from './seo.service';
import { Injectable } from '@angular/core';
import {
  ActivatedRouteSnapshot,
  CanActivate,
  RouterStateSnapshot,
} from '@angular/router';
@Injectable({
  providedIn: 'root',
})
export class SeoGuard implements CanActivate {
  public constructor(private seo: SeoService) {}
  public canActivate(
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot,
  ): boolean {
    this.seo
      .setTitle(route.data['title'])
      .setDescription(route.data['desc'])
      .setCanonicalUrl({
        rel: 'canonical',
        href: `https://metro.yudi.com.br'${state.url}`,
      });
    return true;
  }
}
