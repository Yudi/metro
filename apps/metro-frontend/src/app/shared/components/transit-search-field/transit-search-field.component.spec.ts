import { TestBed } from '@angular/core/testing';
import { TransitSearchFieldComponent } from './transit-search-field.component';

describe('TransitSearchFieldComponent', () => {
  it('activates the search when its input is clicked or Enter is pressed', () => {
    const fixture = TestBed.createComponent(TransitSearchFieldComponent);
    const activated = jest.fn();
    fixture.componentInstance.activated.subscribe(activated);
    fixture.detectChanges();

    const input = fixture.nativeElement.querySelector(
      'input',
    ) as HTMLInputElement;
    input.click();
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
    );
    expect(activated).toHaveBeenCalledTimes(2);
  });

  it('keeps clearing available during a pending search and returns focus to the input', () => {
    const fixture = TestBed.createComponent(TransitSearchFieldComponent);
    fixture.componentRef.setInput('query', 'Paulista');
    fixture.componentRef.setInput('clearable', true);
    fixture.componentRef.setInput('loading', true);
    const cleared = jest.fn();
    fixture.componentInstance.cleared.subscribe(cleared);
    fixture.detectChanges();

    const button = fixture.nativeElement.querySelector(
      'button[aria-label="Limpar busca"]',
    ) as HTMLButtonElement;
    expect(button).not.toBeNull();
    expect(fixture.nativeElement.querySelector('mat-spinner')).not.toBeNull();
    button.click();
    expect(cleared).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(
      fixture.nativeElement.querySelector('input'),
    );
  });
});
