import { NgOptimizedImage } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  input,
} from '@angular/core';

@Component({
  selector: 'app-history-line-identity',
  template: `
    <div class="identity">
      @if (badge() !== null) {
        <span
          class="line-badge"
          aria-hidden="true"
          [style.backgroundColor]="badgeBackgroundColor()"
          [style.color]="badgeTextColor()"
        >
          {{ badge() }}
        </span>
      }
      <strong>{{ name() }}</strong>
    </div>
  `,
  styles: `
    .identity {
      align-items: center;
      display: flex;
      gap: 10px;
    }

    .line-badge {
      align-items: center;
      border-radius: 6px;
      display: inline-flex;
      flex: 0 0 auto;
      font-size: 0.78rem;
      font-weight: 800;
      justify-content: center;
      line-height: 1;
      min-height: 24px;
      min-width: 32px;
      padding: 0 6px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HistoryLineIdentityComponent {
  readonly name = input.required<string>();
  readonly badge = input<string | number | null>(null);
  readonly badgeBackgroundColor = input<string>();
  readonly badgeTextColor = input<string>();
}

@Component({
  selector: 'app-history-agency-identity',
  imports: [NgOptimizedImage],
  template: `
    <div class="identity">
      @if (iconPath(); as path) {
        <img
          class="agency-icon"
          [ngSrc]="path"
          width="28"
          height="28"
          alt=""
        />
      }
      <span>{{ name() }}</span>
    </div>
  `,
  styles: `
    .identity {
      align-items: center;
      display: flex;
      gap: 10px;
    }

    .agency-icon {
      height: 28px;
      object-fit: contain;
      width: 28px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HistoryAgencyIdentityComponent {
  readonly name = input.required<string>();
  readonly iconPath = input<string | null>(null);
}
