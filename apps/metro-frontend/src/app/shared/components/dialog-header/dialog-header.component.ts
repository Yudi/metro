import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-dialog-header',
  imports: [MatIconModule],
  template: `
    <div class="dialog-header" mat-dialog-title>
      <mat-icon class="header-icon">{{ icon() }}</mat-icon>
      <div class="header-text">
        <h2>{{ title() }}</h2>
        @if (description()) {
          <p class="description">{{ description() }}</p>
        }
      </div>
    </div>
  `,
  styleUrl: './dialog-header.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DialogHeaderComponent {
  readonly icon = input.required<string>();
  readonly title = input.required<string>();
  readonly description = input<string>();
}
