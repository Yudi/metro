import {
  Component,
  ChangeDetectionStrategy,
  input,
  HostBinding,
} from '@angular/core';

export type LiteChipVariant =
  | 'default'
  | 'primary'
  | 'success'
  | 'warning'
  | 'error';
export type LiteChipSize = 'sm' | 'md';

@Component({
  selector: 'lite-chip',
  template: `<ng-content></ng-content>`,
  styleUrl: './lite-chip.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LiteChip {
  readonly variant = input<LiteChipVariant>('default');
  readonly size = input<LiteChipSize>('md');
  readonly customBg = input<string>('');
  readonly customColor = input<string>('');

  @HostBinding('class')
  get hostClass(): string {
    return [
      'lite-chip',
      `lite-chip--${this.variant()}`,
      `lite-chip--${this.size()}`,
    ].join(' ');
  }

  @HostBinding('style.background-color')
  get bgColor(): string | null {
    return this.customBg() || null;
  }

  @HostBinding('style.color')
  get textColor(): string | null {
    return this.customColor() || null;
  }
}
