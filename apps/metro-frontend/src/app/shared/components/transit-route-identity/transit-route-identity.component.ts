import { NgOptimizedImage } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { AGENCIES_DATA, getAgencyIconPath, getContrastColor, TransitAgency } from '@metro/shared/utils';

function resolveAgency(value: string): TransitAgency | undefined {
  return Object.values(TransitAgency).find((agency) => agency === value.toLowerCase());
}

@Component({
  selector: 'app-transit-agency-logo',
  imports: [NgOptimizedImage, MatIconModule],
  template: `
    @if (logo(); as path) {
      <img class="agency-logo" [ngSrc]="path" width="24" height="24" alt="" />
    } @else {
      <mat-icon aria-hidden="true">directions_bus</mat-icon>
    }
  `,
  styleUrl: './transit-route-identity.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { role: 'img', '[attr.aria-label]': 'name()' },
})
export class TransitAgencyLogoComponent {
  readonly sourceAgency = input.required<string>();
  private readonly agency = computed(() => resolveAgency(this.sourceAgency()));
  readonly name = computed(() => {
    const agency = this.agency();
    return agency ? AGENCIES_DATA[agency].shortName : this.sourceAgency().toUpperCase();
  });
  readonly logo = computed(() => {
    const agency = this.agency();
    return agency ? getAgencyIconPath(agency) : null;
  });
}

/** A provider and route code keep their identity even when providers reuse a code. */
@Component({
  selector: 'app-transit-route-identity',
  imports: [TransitAgencyLogoComponent],
  template: `
    <app-transit-agency-logo [sourceAgency]="sourceAgency()" aria-hidden="true" />
    <span class="route-badge" aria-hidden="true"
      [style.backgroundColor]="background()" [style.color]="foreground()">{{ code() }}</span>
  `,
  styleUrl: './transit-route-identity.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { role: 'img', '[attr.aria-label]': 'label()' },
})
export class TransitRouteIdentityComponent {
  readonly code = input.required<string>();
  readonly sourceAgency = input.required<string>();
  readonly description = input<string>();
  readonly color = input<string>();
  readonly textColor = input<string>();
  readonly background = computed(() => this.validColor(this.color()));
  readonly foreground = computed(() => {
    const background = this.background();
    return background ? this.validColor(this.textColor()) ?? getContrastColor(background) : null;
  });
  private readonly agency = computed(() => resolveAgency(this.sourceAgency()));
  readonly label = computed(() => {
    if (this.description()) return this.description();
    const agency = this.agency();
    const name = agency ? AGENCIES_DATA[agency].shortName : this.sourceAgency().toUpperCase();
    return `${name}, linha ${this.code()}`;
  });

  private validColor(value: string | undefined): string | null {
    const hex = value?.trim().replace(/^#/, '');
    return hex && /^[0-9a-f]{6}$/i.test(hex) ? `#${hex}` : null;
  }
}
