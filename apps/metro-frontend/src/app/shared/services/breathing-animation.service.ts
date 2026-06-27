import { Injectable, signal, computed, OnDestroy } from '@angular/core';

/**
 * Shared service providing a breathing animation effect.
 * Uses a Gaussian function for smooth, organic pulsing.
 * Shares a single animation frame loop across all consumers.
 */
@Injectable({
  providedIn: 'root',
})
export class BreathingAnimationService implements OnDestroy {
  private animationFrameId: number | null = null;
  private subscriberCount = 0;

  /** Current timestamp for animation calculations */
  readonly currentTime = signal(Date.now());

  /**
   * Calculate breathing brightness using Gaussian curve.
   * Based on the Arduino breathing light pattern.
   *
   * Formula: brightness = 100 * e^(-((x - beta) / gamma)^2 / 2)
   *
   * Where:
   * - x cycles from 0 to 1 over the breathing period
   * - gamma = 0.14 (width of peak, more = wider)
   * - beta = 0.5 (center of the Gaussian, symmetric)
   *
   * This creates a smooth pulse that peaks in the middle
   * and fades to near-zero at the edges.
   *
   * Attribution: https://github.com/makerportal/arduino-breathing-led
   */
  readonly breathingBrightness = computed(() => {
    const now = this.currentTime();
    const breathingPeriod = 5000; // 5 second cycle

    // Gaussian parameters
    const gamma = 0.14; // Width of peak (smaller = sharper peak, more darkness)
    const beta = 0.5; // Center of gaussian (0.5 = symmetric)

    // x cycles from 0 to 1 over the breathing period
    const x = (now % breathingPeriod) / breathingPeriod;

    // Gaussian formula: e^(-((x - beta) / gamma)^2 / 2)
    const exponent = -Math.pow((x - beta) / gamma, 2) / 2;
    const gaussianValue = Math.exp(exponent);

    // Scale to 0-100 range, with minimum brightness of 15%
    const minBrightness = 15;
    const maxBrightness = 100;
    const brightness =
      minBrightness + gaussianValue * (maxBrightness - minBrightness);

    return Math.round(brightness);
  });

  /**
   * Breathing opacity value (0-1) for direct use in styles
   */
  readonly breathingOpacity = computed(() => {
    return this.breathingBrightness() / 100;
  });

  ngOnDestroy(): void {
    this.stopAnimationLoop();
  }

  /**
   * Subscribe to the animation loop.
   * Call this when a component needs the breathing animation.
   * Returns an unsubscribe function.
   */
  subscribe(): () => void {
    this.subscriberCount++;

    if (this.subscriberCount === 1) {
      this.startAnimationLoop();
    }

    return () => {
      this.subscriberCount--;

      if (this.subscriberCount === 0) {
        this.stopAnimationLoop();
      }
    };
  }

  private startAnimationLoop(): void {
    if (this.animationFrameId !== null) {
      return;
    }

    const animate = () => {
      this.currentTime.set(Date.now());
      this.animationFrameId = requestAnimationFrame(animate);
    };
    this.animationFrameId = requestAnimationFrame(animate);
  }

  private stopAnimationLoop(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }
}
