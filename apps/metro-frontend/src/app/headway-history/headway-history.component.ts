import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RailGraphqlService } from '@metro/shared/api';
import {
  AGENCIES_DATA,
  HistoricalHeadwaySnapshot,
  getRailLineById,
} from '@metro/shared/utils';
import {
  HistoryLoadState,
  daysAgo,
  describeHistoryError,
  formatDateInput,
  formatTransitDateTime,
  getHistoryTotalPages,
  nextHistoryPage,
  previousHistoryPage,
  sliceHistoryPage,
  uniqueHistoryOptions,
} from '../shared/history-view.utils';
import { HistoryPaginationComponent } from '../shared/history-pagination.component';
import { HistoryDateRangeFieldsComponent } from '../shared/history-date-range-fields.component';

interface HeadwayHistoryRow {
  snapshot: HistoricalHeadwaySnapshot;
  lineName: string;
  agencyName: string;
  stationName: string;
}

@Component({
  selector: 'app-headway-history',
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    MatTooltipModule,
    HistoryDateRangeFieldsComponent,
    HistoryPaginationComponent,
  ],
  templateUrl: './headway-history.component.html',
  styleUrl: './headway-history.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HeadwayHistoryComponent {
  private readonly railGraphqlService = inject(RailGraphqlService);
  private readonly pageSize = 30;
  private readonly historyFetchLimit = 500;

  readonly startDate = signal(formatDateInput(daysAgo(7)));
  readonly endDate = signal(formatDateInput(new Date()));
  readonly selectedAgency = signal('all');
  readonly selectedLine = signal('all');
  readonly selectedStation = signal('all');
  readonly selectedDirection = signal('all');
  readonly loadState = signal<HistoryLoadState>('idle');
  readonly errorMessage = signal<string | null>(null);
  readonly snapshots = signal<HistoricalHeadwaySnapshot[]>([]);
  readonly currentPage = signal(1);

  readonly rows = computed<HeadwayHistoryRow[]>(() =>
    this.snapshots().map((snapshot) => this.toRow(snapshot)),
  );

  readonly agencies = computed(() =>
    uniqueHistoryOptions(this.rows().map((row) => row.agencyName)),
  );

  readonly lines = computed(() =>
    uniqueHistoryOptions(this.rows().map((row) => row.lineName)),
  );

  readonly stations = computed(() =>
    uniqueHistoryOptions(this.rows().map((row) => row.stationName)),
  );

  readonly directions = computed(() =>
    uniqueHistoryOptions(this.rows().map((row) => row.snapshot.direction)),
  );

  readonly filteredRows = computed(() => {
    const agency = this.selectedAgency();
    const line = this.selectedLine();
    const station = this.selectedStation();
    const direction = this.selectedDirection();

    return this.rows().filter((row) => {
      if (agency !== 'all' && row.agencyName !== agency) return false;
      if (line !== 'all' && row.lineName !== line) return false;
      if (station !== 'all' && row.stationName !== station) {
        return false;
      }
      if (direction !== 'all' && row.snapshot.direction !== direction) {
        return false;
      }

      return true;
    });
  });

  readonly totalPages = computed(() =>
    getHistoryTotalPages(this.filteredRows().length, this.pageSize),
  );

  readonly pagedRows = computed(() =>
    sliceHistoryPage(
      this.filteredRows(),
      this.currentPage(),
      this.totalPages(),
      this.pageSize,
    ),
  );

  readonly summaryText = computed(() => {
    const returned = this.rows().length;
    const filtered = this.filteredRows().length;

    if (returned === filtered) {
      return `${returned} registros retornados`;
    }

    return `${filtered} de ${returned} registros retornados exibidos`;
  });

  constructor() {
    this.fetchHeadwayHistory();
  }

  fetchHeadwayHistory(): void {
    this.loadState.set('loading');
    this.errorMessage.set(null);
    this.currentPage.set(1);

    this.railGraphqlService
      .fetchHistoricalHeadwaySnapshots({
        filter: {
          from: this.toIsoDateTime(this.startDate(), 'start'),
          to: this.toIsoDateTime(this.endDate(), 'end'),
        },
        limit: this.historyFetchLimit,
        offset: 0,
      })
      .subscribe({
        next: (snapshots) => {
          this.snapshots.set(snapshots);
          this.loadState.set('loaded');
          this.resetLocalFilters();
        },
        error: (error: unknown) => {
          this.loadState.set('error');
          this.errorMessage.set(this.describeError(error));
        },
      });
  }

  clearFilters(): void {
    this.resetLocalFilters();
    this.currentPage.set(1);
  }

  previousPage(): void {
    this.currentPage.update((page) => previousHistoryPage(page));
  }

  nextPage(): void {
    this.currentPage.update((page) => nextHistoryPage(page, this.totalPages()));
  }

  onStartDateChange(value: string): void {
    this.startDate.set(value);
  }

  onEndDateChange(value: string): void {
    this.endDate.set(value);
  }

  onAgencyChange(value: string): void {
    this.selectedAgency.set(value);
    this.currentPage.set(1);
  }

  onLineChange(value: string): void {
    this.selectedLine.set(value);
    this.currentPage.set(1);
  }

  onStationChange(value: string): void {
    this.selectedStation.set(value);
    this.currentPage.set(1);
  }

  onDirectionChange(value: string): void {
    this.selectedDirection.set(value);
    this.currentPage.set(1);
  }

  formatDateTime(value: string): string {
    return formatTransitDateTime(value);
  }

  formatAverageSeconds(value: number | null | undefined): string {
    if (value === null || value === undefined) {
      return 'Indisponível';
    }

    const roundedSeconds = Math.round(value);
    const minutes = Math.floor(roundedSeconds / 60);
    const seconds = roundedSeconds % 60;

    if (minutes === 0) {
      return `${seconds}s`;
    }

    return seconds === 0 ? `${minutes} min` : `${minutes} min ${seconds}s`;
  }

  formatNullable(value: unknown): string {
    if (value === null || value === undefined || value === '') {
      return 'Não coletado';
    }

    return String(value);
  }

  formatJson(value: unknown): string {
    if (value === null || value === undefined) {
      return 'null';
    }

    return JSON.stringify(value, null, 2);
  }

  hasJson(value: unknown): boolean {
    return value !== null && value !== undefined;
  }

  private toRow(snapshot: HistoricalHeadwaySnapshot): HeadwayHistoryRow {
    const line = getRailLineById(snapshot.lineCode);
    const agencyName = line
      ? AGENCIES_DATA[line.agency].shortName
      : 'Não identificada';

    return {
      snapshot,
      lineName: line?.fullName ?? snapshot.lineCode,
      agencyName,
      stationName: this.formatStationName(snapshot),
    };
  }

  private formatStationName(snapshot: HistoricalHeadwaySnapshot): string {
    return snapshot.stationName?.trim() || 'Não identificada';
  }

  private resetLocalFilters(): void {
    this.selectedAgency.set('all');
    this.selectedLine.set('all');
    this.selectedStation.set('all');
    this.selectedDirection.set('all');
  }

  private describeError(error: unknown): string {
    return describeHistoryError(error, {
      unexpected:
        'Não foi possível carregar o histórico por um erro inesperado na aplicação.',
      backendDown:
        'Não foi possível conectar ao backend. O servidor pode estar desligado, reiniciando ou indisponível na rede.',
      serverError:
        'O backend respondeu, mas não conseguiu consultar o histórico de intervalos agora. Tente novamente em alguns instantes.',
      fallback: (status) =>
        `Não foi possível carregar o histórico de intervalos. O backend respondeu com HTTP ${status}.`,
    });
  }

  private toIsoDateTime(value: string, edge: 'start' | 'end'): string {
    const time = edge === 'start' ? '00:00:00.000' : '23:59:59.999';
    const date = new Date(`${value}T${time}${this.transitOffset()}`);

    return date.toISOString();
  }

  private transitOffset(): string {
    return '-03:00';
  }
}
