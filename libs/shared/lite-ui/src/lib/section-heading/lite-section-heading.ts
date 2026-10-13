import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { LiteIcon, type LiteIconName } from '../icon/lite-icon';

@Component({
  selector: 'lite-section-heading',
  imports: [LiteIcon],
  template: `
    <lite-icon [name]="icon()" />
    <h3>{{ title() }}</h3>
    @if (detail()) {
      <small>{{ detail() }}</small>
    }
  `,
  styleUrl: './lite-section-heading.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LiteSectionHeading {
  readonly title = input.required<string>();
  readonly icon = input.required<LiteIconName>();
  readonly detail = input('');
}
