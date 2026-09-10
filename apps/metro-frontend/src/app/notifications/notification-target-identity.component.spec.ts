import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { NotificationTarget } from '@metro/shared/notification-contracts';
import { NotificationTargetIdentityComponent } from './notification-target-identity.component';

describe('NotificationTargetIdentityComponent', () => {
  let fixture: ComponentFixture<NotificationTargetIdentityComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NotificationTargetIdentityComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(NotificationTargetIdentityComponent);
  });

  it('renders rail lines with their number and color name', () => {
    fixture.componentRef.setInput('target', {
      id: 'line-9',
      kind: 'rail_line',
      label: 'Linha 9 - Esmeralda',
      available: true,
      railLineCode: 9,
    } satisfies NotificationTarget);
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('app-history-line-identity')).not.toBeNull();
    expect(element.querySelector('.line-badge')?.textContent?.trim()).toBe('9');
    expect(element.textContent).toContain('Esmeralda');
    expect(
      element.querySelector('.target-identity')?.getAttribute('aria-label'),
    ).toBe('Linha 9 - Esmeralda');
  });

  it('keeps station text while showing its rail line number and name', () => {
    fixture.componentRef.setInput('target', {
      id: 'station-9',
      kind: 'rail_station',
      label: 'Pinheiros · Linha 9 - Esmeralda',
      available: true,
      railLineCode: 9,
    } satisfies NotificationTarget);
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.textContent).toContain('Pinheiros');
    expect(element.querySelector('.line-badge')?.textContent?.trim()).toBe('9');
    expect(element.textContent).toContain('Esmeralda');
  });

  it('renders only the short code for bus routes', () => {
    fixture.componentRef.setInput('target', {
      id: 'route-702p-10',
      kind: 'bus_route',
      label: '702P-10 · Metrô Belém - Vila Industrial',
      available: true,
    } satisfies NotificationTarget);
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('app-history-route-identity')).not.toBeNull();
    expect(element.querySelector('.route-badge')?.textContent?.trim()).toBe(
      '702P-10',
    );
    expect(element.textContent).not.toContain('Vila Industrial');
    expect(
      element.querySelector('.target-identity')?.getAttribute('aria-label'),
    ).toBe('702P-10 · Metrô Belém - Vila Industrial');
  });
});
