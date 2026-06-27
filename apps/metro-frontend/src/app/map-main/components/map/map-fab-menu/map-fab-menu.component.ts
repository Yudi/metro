import {
  Component,
  input,
  output,
  signal,
  ChangeDetectionStrategy,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';

@Component({
  selector: 'app-map-fab-menu',
  imports: [MatIconModule, MatButtonModule, MatTooltipModule],
  templateUrl: './map-fab-menu.component.html',
  styleUrl: './map-fab-menu.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MapFabMenuComponent {
  readonly hasSelections = input<boolean>(false);
  readonly hasFeatures = input<boolean>(false);
  readonly isRequestingLocation = input<boolean>(false);
  readonly isLocationDisabled = input<boolean>(false);

  readonly searchClick = output<void>();
  readonly exploreClick = output<void>();
  readonly layersClick = output<void>();
  readonly centerClick = output<void>();
  readonly centerOnUserClick = output<void>();
  readonly clearClick = output<void>();

  readonly isOpen = signal(false);
  readonly isMenuMounted = signal(false);

  // Internal: supports interruptible mount → paint → show scheduling.
  private _showPending = false;
  private _rafId: number | null = null;

  private scheduleShow(): void {
    this.isMenuMounted.set(true);
    this._showPending = true;

    const doShow = () => {
      this._rafId = null;
      if (!this._showPending) return; // canceled while waiting
      this._showPending = false;
      this.isOpen.set(true);
    };

    if (typeof requestAnimationFrame === 'function') {
      this._rafId = requestAnimationFrame(doShow);
    } else {
      // microtask fallback (guarded by _showPending)
      Promise.resolve().then(doShow);
    }
  }

  private cancelScheduledShow(): void {
    this._showPending = false;
    if (this._rafId != null) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
  }

  toggle(): void {
    // If currently open -> close immediately (interrupt any pending show)
    if (this.isOpen()) {
      this.cancelScheduledShow();
      this.isOpen.set(false);
      return;
    }

    // If a show is pending (we've mounted but haven't painted yet), treat
    // a toggle as a cancel (native-like behavior when rapidly tapping).
    if (this._showPending) {
      this.cancelScheduledShow();
      this.isMenuMounted.set(false);
      return;
    }

    // If mounted but not open (closing in-progress), reopen immediately
    // which interrupts the closing animation.
    if (this.isMenuMounted() && !this.isOpen()) {
      this.isOpen.set(true);
      return;
    }

    // Otherwise start mount → paint → open sequence.
    this.scheduleShow();
  }

  close(): void {
    this.cancelScheduledShow();
    this.isOpen.set(false);
  }

  onMenuTransitionEnd(event: TransitionEvent): void {
    // only act once when the opacity transition finishes
    if (event.propertyName !== 'opacity') return;
    // don't unmount if a show was scheduled while the transition was running
    if (!this.isOpen() && !this._showPending) {
      this.isMenuMounted.set(false);
    }
  }

  handleSearch(): void {
    this.searchClick.emit();
  }

  handleExplore(): void {
    this.exploreClick.emit();
    this.close();
  }

  handleLayers(): void {
    this.layersClick.emit();
    this.close();
  }

  handleCenter(): void {
    this.centerClick.emit();
    this.close();
  }

  handleCenterOnUser(): void {
    this.centerOnUserClick.emit();
    this.close();
  }

  handleClear(): void {
    this.clearClick.emit();
    this.close();
  }
}
