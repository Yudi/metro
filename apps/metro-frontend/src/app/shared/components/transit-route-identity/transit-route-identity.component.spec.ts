import { TestBed } from '@angular/core/testing';
import { BUS_TERMINAL_DETAIL_FIXTURE } from '@metro/shared/bus-terminal-contracts';
import { TransitRouteIdentityComponent } from './transit-route-identity.component';

describe('TransitRouteIdentityComponent', () => {
  it('keeps a reused route code distinguishable by provider and preserves line colors', () => {
    const fixture = TestBed.createComponent(TransitRouteIdentityComponent);
    for (const route of BUS_TERMINAL_DETAIL_FIXTURE.routes) {
      fixture.componentRef.setInput('code', route.shortName);
      fixture.componentRef.setInput('sourceAgency', route.sourceAgency);
      fixture.componentRef.setInput('color', route.color);
      fixture.componentRef.setInput('textColor', route.textColor);
      fixture.detectChanges();
      expect(fixture.nativeElement.getAttribute('aria-label')).toContain(route.shortName);
      expect(fixture.nativeElement.querySelector('app-transit-agency-logo').getAttribute('aria-label').toLowerCase())
        .toBe(route.sourceAgency);
      expect(fixture.componentInstance.background()?.toUpperCase()).toBe(`#${route.color}`);
      expect(fixture.nativeElement.querySelector('.route-badge').textContent.trim()).toBe(route.shortName);
    }
  });

  it('uses the default badge surface for invalid feed colors and gives unknown providers an accessible icon', () => {
    const fixture = TestBed.createComponent(TransitRouteIdentityComponent);
    fixture.componentRef.setInput('code', '123');
    fixture.componentRef.setInput('sourceAgency', 'other');
    fixture.componentRef.setInput('color', 'invalid');
    fixture.detectChanges();
    expect(fixture.componentInstance.background()).toBeNull();
    expect(fixture.nativeElement.getAttribute('aria-label')).toBe('OTHER, linha 123');
    expect(fixture.nativeElement.querySelector('mat-icon')).not.toBeNull();
  });
});
