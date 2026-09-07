import { ChangeDetectionStrategy, Component, input, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import type { RouteNoticeView } from './bus-notice-view';

/** Already-parsed notices for one arrival route. This component never fetches data. */
@Component({
  selector: 'app-bus-information',
  imports: [DatePipe, MatButtonModule, MatIconModule],
  templateUrl: './bus-information.component.html',
  styleUrl: './bus-information.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BusInformationComponent {
  readonly notices = input<RouteNoticeView[]>([]);
  readonly routeCode = input.required<string>();
  readonly stale = input(false);
  readonly lastUpdated = input<string | null>(null);
  readonly expanded = signal<string | null>(null);
  toggle(id: string): void { this.expanded.update((current) => current === id ? null : id); }
}
