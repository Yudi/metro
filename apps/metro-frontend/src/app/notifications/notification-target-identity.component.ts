import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
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

const NATURAL_TARGET_LABEL_ORDER = new Intl.Collator('pt-BR', {
  numeric: true,
  sensitivity: 'base',
});

export function getNotificationTargetLineCode(
  target: NotificationTarget,
): number | undefined {
  if (target.kind !== 'rail_line' && target.kind !== 'rail_station') {
    return undefined;
  }

  if (target.railLineCode !== undefined) {
    return target.railLineCode;
  }

  const lineCode = /\blinha\s*0?(\d{1,2})\b/iu.exec(target.label)?.[1];
  return lineCode ? Number(lineCode) : parseRailLineCode(target.label);
}

export function sortNotificationTargets<T extends NotificationTarget>(
  targets: readonly T[],
): T[] {
  return [...targets].sort((left, right) => {
    const leftLineCode = getNotificationTargetLineCode(left);
    const rightLineCode = getNotificationTargetLineCode(right);

    if (leftLineCode !== undefined && rightLineCode !== undefined) {
      return (
        leftLineCode - rightLineCode ||
        NATURAL_TARGET_LABEL_ORDER.compare(left.label, right.label) ||
        left.id.localeCompare(right.id)
      );
    }

    if (leftLineCode !== undefined) {
      return -1;
    }
    if (rightLineCode !== undefined) {
      return 1;
    }

    return 0;
  });
}

/**
 * Presents a notification target using the same identities as the transit
 * history surfaces. Long rail and bus names stay available to assistive
 * technology while the compact visual form keeps the target list scannable.
 */
@Component({
  selector: 'app-notification-target-identity',
  imports: [HistoryLineIdentityComponent, HistoryRouteIdentityComponent],
  template: `
    <span class="target-identity" role="img" [attr.aria-label]="target().label">
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
          [badgeShape]="
            target().kind === 'rail_station' ? 'round' : 'rectangle'
          "
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

    const code = getNotificationTargetLineCode(target);
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
    return (
      separatorIndex === -1 ? label : label.slice(0, separatorIndex)
    ).trim();
  });

  readonly routeColors = computed(() => {
    const target = this.target();
    return {
      backgroundColor: normalizeHexColor(target.busRouteColor, '#5f6368'),
      textColor: normalizeHexColor(target.busRouteTextColor, '#ffffff'),
    };
  });
}
