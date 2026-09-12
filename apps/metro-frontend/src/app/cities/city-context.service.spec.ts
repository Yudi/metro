import { TestBed } from '@angular/core/testing';
import { NavigationEnd, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { CityContextService } from './city-context.service';

describe('city route context', () => {
  it('provides the default city for isolated components without a router', () => {
    TestBed.configureTestingModule({});
    const context = TestBed.inject(CityContextService);
    expect(context.id()).toBe('sp');
    expect(context.path('/mapa')).toBe('/sp/mapa');
  });

  it('resolves the city on initial activation and on navigation', () => {
    const events = new Subject<NavigationEnd>();
    TestBed.configureTestingModule({ providers: [{ provide: Router, useValue: {
      url: '/', events,
      getCurrentNavigation: () => ({ extractedUrl: { toString: () => '/sp/mapa' } }),
    } }] });
    const context = TestBed.inject(CityContextService);
    expect(context.id()).toBe('sp');
    events.next(new NavigationEnd(1, '/sp/mapa', '/sp/mapa'));
    expect(context.path('itinerarios/example/1')).toBe('/sp/itinerarios/example/1');
    expect(context.center()).toEqual([-46.6339471, -23.5503953]);
  });
});
