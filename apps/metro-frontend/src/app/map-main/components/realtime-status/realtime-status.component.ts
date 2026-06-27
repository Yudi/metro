import {
  Component,
  inject,
  computed,
  signal,
  OnDestroy,
  ChangeDetectionStrategy,
} from '@angular/core';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RealtimeWebsocketService } from '../../services/realtime-websocket.service';
import { BreathingAnimationService } from '../../../shared/services/breathing-animation.service';

/**
 * Realtime status indicator chip with:
 * - Circular default state that expands on hover
 * - Progress border showing time until next refresh
 * - Breathing animation indicating live status
 * - Offline state always showing full text
 */
@Component({
  selector: 'app-realtime-status',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatTooltipModule],
  template: `
    <div
      class="realtime-chip"
      [class.connected]="realtimeService.connected()"
      [class.expanded]="isExpanded() || !realtimeService.connected()"
      [class.offline]="!realtimeService.connected()"
      [matTooltip]="tooltipText()"
      matTooltipPosition="below"
      (mouseenter)="onMouseEnter()"
      (mouseleave)="onMouseLeave()"
      (click)="onTap()"
      (keydown.enter)="onTap()"
      (keydown.space)="onTap(); $event.preventDefault()"
      tabindex="0"
      role="button"
      [attr.aria-label]="tooltipText()"
      [style.--progress]="progressPercent()"
    >
      <!-- Background border (static) -->
      <div class="border-bg"></div>

      <!-- Progress border (only when connected) -->
      @if (realtimeService.connected()) {
        <div class="border-progress"></div>
      }

      <!-- Breathing indicator (fixed position, only when connected) -->
      @if (realtimeService.connected()) {
        <div
          class="breathing-dot"
          [style.--brightness]="breathingBrightness()"
        ></div>
      } @else {
        <div class="offline-dot"></div>
      }

      <!-- Text label (visible when expanded or offline) -->
      <span class="status-text">
        {{ statusText() }}
      </span>
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
        --progress: 0;

        position: relative;
        display: flex;
        align-items: center;
        justify-content: flex-start;
        height: var(--chip-size);
        width: var(--chip-size);
        border-radius: calc(var(--chip-size) / 2);
        background: transparent;
        box-sizing: border-box;
        cursor: pointer;
        user-select: none;
        transition:
          width 0.3s cubic-bezier(0.4, 0, 0.2, 1),
          background 0.3s ease;

        &.expanded {
          width: 120px;
          background: var(--color-error);

          &.connected {
            background: var(--color-primary);
          }
        }

        &.offline {
          width: 100px;
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

      /* Offline static dot */
      .offline-dot {
        position: absolute;
        left: calc((var(--chip-size) - 8px) / 2);
        top: 50%;
        transform: translateY(-50%);
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--color-error);
        flex-shrink: 0;
        transition: background 0.3s ease;
        z-index: 2;
      }

      .expanded .offline-dot {
        background: white;
      }

      .status-text {
        position: absolute;
        left: var(--chip-size);
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

      .expanded .status-text {
        opacity: 1;
        color: white;
      }
    `,
  ],
})
export class RealtimeStatusComponent implements OnDestroy {
  readonly realtimeService = inject(RealtimeWebsocketService);
  private readonly breathingService = inject(BreathingAnimationService);

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

  /** Unsubscribe function for breathing animation */
  private readonly unsubscribeBreathing: () => void;

  constructor() {
    this.unsubscribeBreathing = this.breathingService.subscribe();
    this.startAnimationLoop();
  }

  ngOnDestroy(): void {
    this.unsubscribeBreathing();
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
    this.isTapped.update((v) => !v);
  }

  /** Status text label */
  readonly statusText = computed(() =>
    this.realtimeService.connected() ? 'Tempo Real' : 'Offline',
  );

  /** Tooltip with detailed information */
  readonly tooltipText = computed(() => {
    if (this.realtimeService.connected()) {
      const vehicleCount = this.realtimeService.vehiclePositions().size;
      const stopCount = this.realtimeService.stopArrivals().size;
      return `Conectado ao serviço de tempo real\n${vehicleCount} rotas rastreadas\n${stopCount} paradas monitoradas`;
    }
    return 'Desconectado do serviço de tempo real';
  });

  /**
   * Calculate progress as a value between 0 and 1 for CSS.
   */
  readonly progressPercent = computed(() => {
    const lastUpdate = this.realtimeService.lastUpdateTimestamp();
    const now = this.currentTime();

    if (!lastUpdate || !this.realtimeService.connected()) {
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
    if (!this.realtimeService.connected()) {
      return 50; // Static brightness when offline
    }
    return this.breathingService.breathingBrightness();
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
