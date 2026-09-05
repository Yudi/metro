import {
  Component,
  ChangeDetectionStrategy,
  computed,
  input,
  output,
} from '@angular/core';

export type LiteButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost';
export type LiteButtonSize = 'sm' | 'md' | 'lg';

@Component({
  selector: 'lite-button',
  template: `
    <button
      [class]="buttonClass()"
      [type]="type()"
      [disabled]="isDisabled()"
      [attr.aria-busy]="loading() ? 'true' : null"
      (click)="onClick($event)"
    >
      <span class="lite-button-content">
        @if (loading()) {
          <span class="lite-button-spinner" aria-hidden="true"></span>
        }
        <ng-content></ng-content>
      </span>
    </button>
  `,
  styleUrl: './lite-button.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.lite-button--full-width]': 'fullWidth()',
  },
})
export class LiteButton {
  readonly variant = input<LiteButtonVariant>('primary');
  readonly size = input<LiteButtonSize>('md');
  readonly disabled = input(false);
  readonly loading = input(false);
  readonly fullWidth = input(false);
  readonly type = input<'button' | 'submit' | 'reset'>('button');
  readonly buttonClick = output<MouseEvent>();

  readonly isDisabled = computed(() => this.disabled() || this.loading());
  readonly buttonClass = computed(() =>
    [
      'lite-button',
      `lite-button--${this.variant()}`,
      `lite-button--${this.size()}`,
      this.fullWidth() ? 'lite-button--full-width' : '',
      this.isDisabled() ? 'lite-button--disabled' : '',
    ]
      .filter(Boolean)
      .join(' '),
  );

  onClick(event: MouseEvent): void {
    if (!this.isDisabled()) {
      this.buttonClick.emit(event);
    }
  }
}
