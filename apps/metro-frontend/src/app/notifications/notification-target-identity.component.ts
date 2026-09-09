import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import {
  getContrastColor,
  getRailLineByCode,
  normalizeHexColor,
  parseRailLineCode,
} from '@metro/shared/utils';
import type { NotificationTarget } from '@metro/shared/notification-contracts';
import {
  HistoryLineIdentityComponent,
  HistoryRouteIdentityComponent,
} from '../shared/history/history-transit-identity.component';

/**
 * Presents a notification target using the same identities as the transit
 * history surfaces. Long rail and bus names stay available to assistive
 * technology while the compact visual form keeps the target list scannable.
 */
@Component({
  selector: 'app-notification-target-identity',
  imports: [HistoryLineIdentityComponent, HistoryRouteIdentityComponent],
  template: `
    <span
      class="target-identity"
      role="img"
      [attr.aria-label]="target().label"
    >
      @if (target().kind === 'bus_route') {
        <app-history-route-identity
          [name]="routeCode()"
          [backgroundColor]="routeColors().backgroundColor"
          [textColor]="routeColors().textColor"
        />
      } @else if (railLine(); as line) {
        @if (target().kind === 'rail_station') {
          <span class="station-name">{{ stationName() }}</span>
        }
        <app-history-line-identity
          [name]="line.colorName"
          [badge]="line.code"
          [badgeOnly]="true"
          [badgeShape]="target().kind === 'rail_station' ? 'round' : 'rectangle'"
          [badgeBackgroundColor]="line.colorHex"
          [badgeTextColor]="line.textColor"
        />
      } @else {
        <span class="target-label">{{ target().label }}</span>
      }
    </span>
  `,
  styles: `
    .target-identity {
      align-items: center;
      display: inline-flex;
      gap: 8px;
      max-width: 100%;
      min-width: 0;
      vertical-align: middle;
    }

    .station-name,
    .target-label {
      min-width: 0;
      overflow-wrap: anywhere;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotificationTargetIdentityComponent {
  readonly target = input.required<NotificationTarget>();

  readonly railLine = computed(() => {
    const target = this.target();
    if (target.kind !== 'rail_line' && target.kind !== 'rail_station') {
      return null;
    }

    const code =
      target.railLineCode === undefined
        ? parseRailLineCode(target.label)
        : target.railLineCode;
    const line = code === undefined ? undefined : getRailLineByCode(code);
    if (!line) {
      return null;
    }

    return {
      code: line.code,
      colorHex: line.colorHex,
      colorName: line.colorName,
      fullName: line.fullName,
      textColor: getContrastColor(line.colorHex),
    };
  });

  readonly stationName = computed(() => {
    const target = this.target();
    const line = this.railLine();
    if (target.kind !== 'rail_station' || !line) {
      return target.label.trim();
    }

    const suffix = ` · ${line.fullName}`;
    return target.label.endsWith(suffix)
      ? target.label.slice(0, -suffix.length).trim()
      : target.label.trim();
  });

  readonly routeCode = computed(() => {
    const target = this.target();
    if (target.busRouteShortName?.trim()) {
      return target.busRouteShortName.trim();
    }

    const label = target.label.trim();
    const separatorIndex = label.indexOf('·');
    return (separatorIndex === -1 ? label : label.slice(0, separatorIndex)).trim();
  });

  readonly routeColors = computed(() => {
    const target = this.target();
    return {
      backgroundColor: normalizeHexColor(target.busRouteColor, '#5f6368'),
      textColor: normalizeHexColor(target.busRouteTextColor, '#ffffff'),
    };
  });
}
