import {
  Component,
  ChangeDetectionStrategy,
  input,
  output,
  HostBinding,
  HostListener,
} from '@angular/core';

export type LiteButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost';
export type LiteButtonSize = 'sm' | 'md' | 'lg';

@Component({
  selector: 'lite-button',
  template: `
    <span class="lite-button-content">
      @if (loading()) {
        <span class="lite-button-spinner"></span>
      }
      <ng-content></ng-content>
    </span>
  `,
  styleUrl: './lite-button.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LiteButton {
  readonly variant = input<LiteButtonVariant>('primary');
  readonly size = input<LiteButtonSize>('md');
  readonly disabled = input(false);
  readonly loading = input(false);
  readonly fullWidth = input(false);
  readonly type = input<'button' | 'submit' | 'reset'>('button');
  readonly buttonClick = output<MouseEvent>();

  @HostBinding('class')
  get hostClass(): string {
    return [
      'lite-button',
      `lite-button--${this.variant()}`,
      `lite-button--${this.size()}`,
      this.fullWidth() ? 'lite-button--full-width' : '',
      this.disabled() || this.loading() ? 'lite-button--disabled' : '',
    ]
      .filter(Boolean)
      .join(' ');
  }

  @HostBinding('attr.disabled')
  get isDisabled(): boolean | null {
    return this.disabled() || this.loading() ? true : null;
  }

  @HostBinding('attr.type')
  get buttonType(): string {
    return this.type();
  }

  @HostListener('click', ['$event'])
  onClick(event: MouseEvent): void {
    if (!this.disabled() && !this.loading()) {
      this.buttonClick.emit(event);
    }
  }
}
