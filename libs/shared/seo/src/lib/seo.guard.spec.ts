import { APP_BASE_HREF, Location } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, provideRouter, RouterStateSnapshot } from '@angular/router';
import { DOCUMENT } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { DEFAULT_CITY } from '@metro/shared/cities';
import { SeoGuard } from './seo.guard';
import { SeoService } from './seo.service';

describe('city metadata', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [
      provideRouter([]), { provide: APP_BASE_HREF, useValue: '/app/' },
    ] });
    TestBed.inject(DOCUMENT).head.querySelectorAll('link[rel="canonical"]')
      .forEach((link) => link.remove());
  });

  it('preserves the deployment base and replaces the canonical link on child navigation', () => {
    const guard = TestBed.inject(SeoGuard);
    const route = { data: {} } as ActivatedRouteSnapshot;
    guard.canActivateChild(route, { url: '/sp/mapa?lat=1#map' } as RouterStateSnapshot);
    guard.canActivateChild(route, { url: '/sp/sobre' } as RouterStateSnapshot);
    const links = TestBed.inject(DOCUMENT).head.querySelectorAll('link[rel="canonical"]');
    expect(TestBed.inject(Location).prepareExternalUrl('/sp/sobre')).toBe('/app/sp/sobre');
    expect(links.length).toBe(1);
    expect(links[0].getAttribute('href')).toBe('https://metro.yudi.com.br/app/sp/sobre');
  });

  it('uses the selected city title and description without duplicating the site title', () => {
    const seo = TestBed.inject(SeoService);
    const city = { ...DEFAULT_CITY, siteTitle: 'Transporte de outra cidade', description: 'Descrição da cidade' };
    seo.setCity(city).setTitle(city.siteTitle).setDescription('');
    expect(TestBed.inject(Title).getTitle()).toBe(city.siteTitle);
    expect(TestBed.inject(Meta).getTag('name="description"')?.content).toBe(city.description);
  });
});
