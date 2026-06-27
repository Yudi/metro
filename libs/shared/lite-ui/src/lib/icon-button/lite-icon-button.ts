import {
  Component,
  ChangeDetectionStrategy,
  input,
  HostBinding,
} from '@angular/core';

@Component({
  selector: 'lite-icon-button',
  template: `<ng-content></ng-content>`,
  styleUrl: './lite-icon-button.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LiteIconButton {
  readonly variant = input<'default' | 'primary' | 'ghost'>('default');
  readonly size = input<'sm' | 'md' | 'lg'>('md');
  readonly disabled = input(false);
  readonly ariaLabel = input<string>('');

  @HostBinding('class')
  get hostClass(): string {
    return [
      'lite-icon-button',
      `lite-icon-button--${this.variant()}`,
      `lite-icon-button--${this.size()}`,
      this.disabled() ? 'lite-icon-button--disabled' : '',
    ]
      .filter(Boolean)
      .join(' ');
  }

  @HostBinding('attr.disabled')
  get isDisabled(): boolean | null {
    return this.disabled() ? true : null;
  }

  @HostBinding('attr.aria-label')
  get label(): string {
    return this.ariaLabel();
  }

  @HostBinding('attr.type')
  get buttonType(): string {
    return 'button';
  }
}
