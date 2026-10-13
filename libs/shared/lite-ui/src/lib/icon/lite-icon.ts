import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type LiteIconName =
  | 'bus'
  | 'train'
  | 'station'
  | 'heart'
  | 'refresh'
  | 'arrow-left'
  | 'arrow-right';

@Component({
  selector: 'lite-icon',
  template: `
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.75"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      @switch (name()) {
        @case ('bus') {
          <path d="M5 18V5.5A2.5 2.5 0 0 1 7.5 3h9A2.5 2.5 0 0 1 19 5.5V18" />
          <path d="M5 7h14M5 13h14M7 18v2m10-2v2" />
          <circle cx="8" cy="16" r="1" />
          <circle cx="16" cy="16" r="1" />
        }
        @case ('train') {
          <rect x="5" y="3" width="14" height="15" rx="2.5" />
          <path d="M5 11h14M9 7h.01M15 7h.01M8 21l2-3m6 3-2-3" />
        }
        @case ('station') {
          <path d="M3 21h18M5 21V9l7-5 7 5v12" />
          <path d="M9 21v-6h6v6M9 10h.01M15 10h.01" />
        }
        @case ('heart') {
          <path d="M20.8 8.6c0 5.3-8.8 10.1-8.8 10.1S3.2 13.9 3.2 8.6A4.1 4.1 0 0 1 11 6.8l1 1.1 1-1.1a4.1 4.1 0 0 1 7.8 1.8Z" />
        }
        @case ('refresh') {
          <path d="M20 7v5h-5M4 17v-5h5" />
          <path d="M5.6 9A7 7 0 0 1 17.3 6L20 12M4 12l2.7 6A7 7 0 0 0 18.4 15" />
        }
        @case ('arrow-left') {
          <path d="M19 12H5m7 7-7-7 7-7" />
        }
        @case ('arrow-right') {
          <path d="M5 12h14m-7-7 7 7-7 7" />
        }
      }
    </svg>
  `,
  styleUrl: './lite-icon.scss',
  host: {
    'aria-hidden': 'true',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LiteIcon {
  readonly name = input.required<LiteIconName>();
}
