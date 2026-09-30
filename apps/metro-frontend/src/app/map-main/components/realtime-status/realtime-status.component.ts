import {
  Component,
  inject,
  computed,
  effect,
  signal,
  OnDestroy,
  ChangeDetectionStrategy,
} from '@angular/core';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RealtimeWebsocketService } from '../../realtime/realtime-websocket.service';
import { MapRealtimeStatusService } from '../../realtime/map-realtime-status.service';
import { BreathingAnimationService } from '../../../shared/services/breathing-animation.service';

/**
 * Realtime status indicator chip with:
 * - Circular default state that expands on hover
 * - Optional progress border for a predictable refresh schedule
 * - Breathing animation indicating live status
 * - Disconnected state showing its label; waiting state as three dots
 */
@Component({
  selector: 'app-realtime-status',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatTooltipModule],
  template: `
    <div
      class="realtime-chip"
      [class.connected]="status.state() === 'connected'"
      [class.partial]="status.state() === 'partial'"
      [class.idle]="status.state() === 'idle'"
      [class.expanded]="
        status.state() !== 'idle' &&
        (isExpanded() || status.state() !== 'connected')
      "
      [class.offline]="status.state() === 'offline'"
      [matTooltip]="tooltipText()"
      matTooltipClass="map-realtime-tooltip"
      matTooltipPosition="below"
      (mouseenter)="onMouseEnter()"
      (mouseleave)="onMouseLeave()"
      (click)="onTap()"
      (keydown.enter)="onTap()"
      (keydown.space)="onTap(); $event.preventDefault()"
      [attr.tabindex]="status.state() === 'idle' ? -1 : 0"
      [attr.role]="status.state() === 'idle' ? 'status' : 'button'"
      [attr.aria-label]="tooltipText()"
      [style.--progress]="progressPercent()"
    >
      <!-- Background border (static) -->
      <div class="border-bg"></div>

      <!-- Progress border (only when connected) -->
      @if (showProgress && status.state() === 'connected') {
        <div class="border-progress"></div>
      }

      <!-- Breathing indicator for active connections -->
      @if (status.state() === 'idle') {
        <span class="connecting-dots" aria-hidden="true">
          <span [style.--brightness]="waitingBrightness()[0]"></span>
          <span [style.--brightness]="waitingBrightness()[1]"></span>
          <span [style.--brightness]="waitingBrightness()[2]"></span>
        </span>
      } @else if (
        status.state() === 'connected' || status.state() === 'partial'
      ) {
        <div
          class="breathing-dot"
          [style.--brightness]="breathingBrightness()"
        ></div>
      } @else {
        <div class="offline-dot"></div>
      }

      <span class="status-text">{{ statusText() }}</span>
    </div>
  `,
  styles: [
    `
      :host {
        display: inline-block;
      }

      .realtime-chip {
        --chip-size: 32px;
        --border-width: 2px;
        --color-primary: #4caf50;
        --color-secondary: #81c784;
        --color-error: #ba1a1a;
        --color-warning: #8b5e00;
        --color-idle: #5f6368;
        --progress: 0;

        position: relative;
        display: flex;
        align-items: center;
        justify-content: flex-start;
        height: var(--chip-size);
        min-width: var(--chip-size);
        width: max-content;
        max-width: var(--chip-size);
        padding-right: 12px;
        overflow: hidden;
        border-radius: calc(var(--chip-size) / 2);
        background: transparent;
        box-sizing: border-box;
        cursor: pointer;
        user-select: none;
        transition:
          max-width 0.3s cubic-bezier(0.4, 0, 0.2, 1),
          background 0.3s ease;

        &.expanded {
          max-width: 260px;
          background: var(--color-error);

          &.connected {
            background: var(--color-primary);
          }
          &.partial {
            background: var(--color-warning);
          }
        }

        &.offline {
          min-width: var(--chip-size);
        }

        &.idle {
          cursor: default;
        }
      }

      @supports (interpolate-size: allow-keywords) {
        .realtime-chip {
          interpolate-size: allow-keywords;
          width: var(--chip-size);
          max-width: none;
          transition:
            width 0.3s cubic-bezier(0.4, 0, 0.2, 1),
            background 0.3s ease;
        }

        .realtime-chip.expanded {
          width: max-content;
        }
      }

      /* Background border - always visible */
      .border-bg {
        position: absolute;
        inset: 0;
        border-radius: inherit;
        /* border: var(--border-width) solid var(--color-error); */
        pointer-events: none;
        transition: border-color 0.3s ease;
      }

      .connected .border-bg {
        border-color: var(--color-secondary);
      }

      /* Hide border when expanded */
      .expanded .border-bg {
        opacity: 0;
      }

      /* Progress border overlay */
      .border-progress {
        position: absolute;
        inset: 0;
        border-radius: inherit;
        pointer-events: none;
        transition: opacity 0.3s ease;

        /* Create progress effect with clip-path */
        &::before {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: inherit;
          border: var(--border-width) solid var(--color-primary);
          clip-path: polygon(
            50% 50%,
            50% 0%,
            calc(50% + 50% * sin(var(--progress) * 3.14159 * 2))
              calc(50% - 50% * cos(var(--progress) * 3.14159 * 2)),
            50% 50%
          );
        }

        /* Use conic-gradient mask for smooth progress */
        &::after {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: inherit;
          border: var(--border-width) solid var(--color-primary);
          mask: conic-gradient(
            from 0deg at 50% 50%,
            #000 calc(var(--progress) * 360deg),
            transparent calc(var(--progress) * 360deg)
          );
          -webkit-mask: conic-gradient(
            from 0deg at 50% 50%,
            #000 calc(var(--progress) * 360deg),
            transparent calc(var(--progress) * 360deg)
          );
        }
      }

      /* Hide the ::before, only use ::after which works better */
      .border-progress::before {
        display: none;
      }

      /* Hide progress border when expanded */
      .expanded .border-progress {
        opacity: 0;
      }

      /* Breathing dot - fixed position in the left circle area */
      .breathing-dot {
        --brightness: 50;

        position: absolute;
        left: calc((var(--chip-size) - 12px) / 2);
        top: 50%;
        transform: translateY(-50%);
        width: 12px;
        height: 12px;
        border-radius: 50%;
        background: color-mix(
          in srgb,
          var(--color-secondary) calc(var(--brightness) * 1%),
          transparent
        );
        flex-shrink: 0;
        transition: background 0.3s ease;
        z-index: 2;
      }

      .expanded .breathing-dot {
        background: color-mix(
          in srgb,
          white calc(var(--brightness) * 1%),
          transparent
        );
      }

      .partial .breathing-dot {
        background: var(--color-warning);
      }

      .expanded.partial .breathing-dot {
        background: white;
      }

      /* Offline static dot */
      .offline-dot {
        position: absolute;
        left: calc((var(--chip-size) - 12px) / 2);
        top: 50%;
        transform: translateY(-50%);
        width: 12px;
        height: 12px;
        border-radius: 50%;
        background: var(--color-error);
        flex-shrink: 0;
        transition: background 0.3s ease;
        z-index: 2;
      }

      .connecting-dots {
        position: absolute;
        left: 50%;
        top: 50%;
        display: flex;
        gap: 3px;
        transform: translate(-50%, -50%);

        span {
          --brightness: 15;
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background: color-mix(
            in srgb,
            var(--color-idle) calc(var(--brightness) * 1%),
            transparent
          );
        }
      }

      .expanded .offline-dot {
        background: white;
      }

      .status-text {
        margin-left: var(--chip-size);
        font-size: 11px;
        font-weight: 500;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        color: var(--color-error);
        white-space: nowrap;
        opacity: 0;
        transition:
          opacity 0.2s ease 0.1s,
          color 0.3s ease;
        z-index: 2;
      }

      .connected .status-text {
        color: var(--color-secondary);
      }

      .partial .status-text {
        color: var(--color-warning);
      }

      .idle .status-text {
        color: var(--color-idle);
      }

      .expanded .status-text {
        opacity: 1;
        color: white;
      }
    `,
  ],
})
export class RealtimeStatusComponent implements OnDestroy {
  readonly realtimeService = inject(RealtimeWebsocketService);
  readonly status = inject(MapRealtimeStatusService);
  private readonly breathingService = inject(BreathingAnimationService);
  private readonly waitingStartedAt = Date.now();

  // Updates are pushed when each server feed changes. There is no shared
  // client refresh deadline to show, but retain the progress implementation.
  readonly showProgress = false;

  /** Track hover state for expansion (desktop) */
  private readonly isHovered = signal(false);

  /** Track tap toggle state for expansion (mobile) */
  private readonly isTapped = signal(false);

  /** Combined expansion state */
  readonly isExpanded = computed(() => this.isHovered() || this.isTapped());

  /** Animation frame ID for cleanup */
  private animationFrameId: number | null = null;

  /** Current timestamp for reactive updates (updated via requestAnimationFrame) */
  private readonly currentTime = signal(Date.now());

  constructor() {
    effect((onCleanup) => {
      const state = this.status.state();
      if (state !== 'offline') {
        onCleanup(this.breathingService.subscribe());
      }
    });
    if (this.showProgress) {
      this.startAnimationLoop();
    }
  }

  ngOnDestroy(): void {
    this.stopAnimationLoop();
  }

  /** Handle mouse enter (desktop) */
  onMouseEnter(): void {
    this.isHovered.set(true);
  }

  /** Handle mouse leave (desktop) */
  onMouseLeave(): void {
    this.isHovered.set(false);
  }

  /** Handle tap/click (mobile toggle) */
  onTap(): void {
    if (this.status.state() === 'idle') return;
    this.isTapped.update((v) => !v);
  }

  /** Status text label */
  readonly statusText = computed(
    () =>
      ({
        idle: '',
        connected: 'Tempo real',
        partial: 'Conexão parcial',
        offline: 'Offline',
      })[this.status.state()],
  );

  /** Tooltip with detailed information */
  readonly tooltipText = this.status.tooltip;

  /**
   * Calculate progress as a value between 0 and 1 for CSS.
   */
  readonly progressPercent = computed(() => {
    const lastUpdate = this.realtimeService.lastUpdateTimestamp();
    const now = this.currentTime();

    if (!lastUpdate || this.status.state() !== 'connected') {
      return 0;
    }

    const elapsed = now - lastUpdate;
    const pollInterval = this.realtimeService.POLL_INTERVAL_MS;

    return Math.min(elapsed / pollInterval, 1);
  });

  /**
   * Calculate breathing brightness using shared Gaussian curve animation.
   * Returns static 50% brightness when offline.
   */
  readonly breathingBrightness = computed(() => {
    if (this.status.state() === 'offline' || this.status.state() === 'idle') {
      return 50; // Static brightness when offline
    }
    return this.breathingService.breathingBrightness();
  });

  readonly waitingBrightness = computed(() => {
    const elapsed = this.breathingService.currentTime() - this.waitingStartedAt;
    const period = this.breathingService.periodMs;
    return [0, 1, 2].map((index) =>
      this.breathingService.brightnessAt(
        elapsed + period / 2 - (index * period) / 3,
      ),
    );
  });

  /**
   * Start the animation loop for smooth updates
   */
  private startAnimationLoop(): void {
    const animate = () => {
      this.currentTime.set(Date.now());
      this.animationFrameId = requestAnimationFrame(animate);
    };
    this.animationFrameId = requestAnimationFrame(animate);
  }

  /**
   * Stop the animation loop
   */
  private stopAnimationLoop(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }
}
