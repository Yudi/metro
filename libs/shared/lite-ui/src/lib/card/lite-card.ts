import {
  Component,
  ChangeDetectionStrategy,
  input,
  output,
  HostBinding,
  HostListener,
} from '@angular/core';

export type LiteCardVariant = 'default' | 'elevated' | 'outlined';

@Component({
  selector: 'lite-card',
  template: `<ng-content></ng-content>`,
  styleUrl: './lite-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LiteCard {
  readonly variant = input<LiteCardVariant>('default');
  readonly clickable = input(false);
  readonly selected = input(false);
  readonly disabled = input(false);
  readonly cardClick = output<MouseEvent>();

  @HostBinding('class')
  get hostClass(): string {
    return [
      'lite-card',
      `lite-card--${this.variant()}`,
      this.clickable() ? 'lite-card--clickable' : '',
      this.selected() ? 'lite-card--selected' : '',
      this.disabled() ? 'lite-card--disabled' : '',
    ]
      .filter(Boolean)
      .join(' ');
  }

  @HostBinding('attr.tabindex')
  get tabIndex(): number | null {
    return this.clickable() && !this.disabled() ? 0 : null;
  }

  @HostBinding('attr.role')
  get role(): string | null {
    return this.clickable() ? 'button' : null;
  }

  @HostListener('click', ['$event'])
  onClick(event: MouseEvent): void {
    if (this.clickable() && !this.disabled()) {
      this.cardClick.emit(event);
    }
  }

  @HostListener('keydown.enter', ['$event'])
  @HostListener('keydown.space', ['$event'])
  onKeydown(event: Event): void {
    if (this.clickable() && !this.disabled()) {
      event.preventDefault();
      this.cardClick.emit(event as MouseEvent);
    }
  }
}
