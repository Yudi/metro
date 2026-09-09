import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

@Component({
  selector: 'app-scheduled-departures',
  template: `
    @for (group of departureGroups(); track group.label) {
      <div class="departure-group" [class.alternate-hour]="group.alternate">
        <ul
          class="departures"
          [attr.aria-label]="ariaLabel() + formatTime()(group.label)"
        >
          @for (departure of group.times; track departure) {
            <li>{{ formatTime()(departure) }}</li>
          }
        </ul>
      </div>
    }
  `,
  styles: `
    :host {
      display: block;
    }

    .departure-group {
      padding-block: 0.5rem;
    }

    .departures {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      margin: 0;
      padding: 0;
      list-style: none;
      font-variant-numeric: tabular-nums;
    }

    .departures li {
      padding: 0.375rem 0.625rem;
      border-radius: 6px;
      background: var(--mat-sys-primary-container);
      color: var(--mat-sys-on-primary-container);
    }

    .alternate-hour .departures li {
      background: var(--mat-sys-secondary-container);
      color: var(--mat-sys-on-secondary-container);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScheduledDeparturesComponent {
  readonly times = input.required<readonly string[]>();
  readonly ariaLabel = input('Partidas na faixa de ');
  readonly formatTime = input<(time: string) => string>((time) => time);

  readonly departureGroups = computed(() => {
    const groups = new Map<string, string[]>();

    for (const departure of this.times()) {
      const hour = departure.split(':')[0];
      groups.set(hour, [...(groups.get(hour) ?? []), departure]);
    }

    return [...groups.entries()].map(([hour, times], index) => ({
      label: `${hour}:00`,
      times,
      alternate: index % 2 === 1,
    }));
  });
}
