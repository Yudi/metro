import {
  Component,
  ChangeDetectionStrategy,
  input,
  HostBinding,
} from '@angular/core';

@Component({
  selector: 'lite-spinner',
  template: `<span class="lite-spinner-circle"></span>`,
  styleUrl: './lite-spinner.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LiteSpinner {
  readonly size = input<'sm' | 'md' | 'lg'>('md');
  readonly color = input<string>('');

  @HostBinding('class')
  get hostClass(): string {
    return `lite-spinner lite-spinner--${this.size()}`;
  }

  @HostBinding('style.--spinner-color')
  get spinnerColor(): string | null {
    return this.color() || null;
  }
}
