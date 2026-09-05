import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { LiteButton } from './lite-button';

@Component({
  imports: [LiteButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <lite-button [disabled]="disabled()" [loading]="loading()" [type]="type()">
      Buscar
    </lite-button>
  `,
})
class ButtonHost {
  readonly disabled = signal(false);
  readonly loading = signal(false);
  readonly type = signal<'button' | 'submit' | 'reset'>('button');
}

describe('LiteButton', () => {
  function setup() {
    const fixture = TestBed.createComponent(ButtonHost);
    fixture.detectChanges();
    const component = fixture.debugElement.query(By.directive(LiteButton));
    const button = component.nativeElement.querySelector('button') as HTMLButtonElement;
    return { fixture, component, button };
  }

  it('renders a native button with its projected label and emits once per click', () => {
    const { component, button } = setup();
    expect(button).not.toBeNull();
    expect(button.textContent?.trim()).toBe('Buscar');
    expect(button.type).toBe('button');
    const clicked = jest.fn();
    (component.componentInstance as LiteButton).buttonClick.subscribe(clicked);
    button.click();
    expect(clicked).toHaveBeenCalledTimes(1);
  });

  it.each(['disabled', 'loading'] as const)('blocks native activation while %s', (input) => {
    const { fixture, component, button } = setup();
    const clicked = jest.fn();
    (component.componentInstance as LiteButton).buttonClick.subscribe(clicked);
    fixture.componentInstance[input].set(true);
    fixture.detectChanges();
    expect(button.disabled).toBe(true);
    button.click();
    expect(clicked).not.toHaveBeenCalled();
    if (input === 'loading') {
      expect(button.getAttribute('aria-busy')).toBe('true');
    }
    fixture.componentInstance[input].set(false);
    fixture.detectChanges();
    expect(button.disabled).toBe(false);
    expect(button.hasAttribute('aria-busy')).toBe(false);
    button.click();
    expect(clicked).toHaveBeenCalledTimes(1);
  });

  it.each(['submit', 'reset'] as const)('forwards the %s type to the native control', (type) => {
    const { fixture, button } = setup();
    fixture.componentInstance.type.set(type);
    fixture.detectChanges();
    expect(button.type).toBe(type);
  });
});
