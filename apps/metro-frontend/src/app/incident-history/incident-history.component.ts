import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CommonModule, NgOptimizedImage } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { IncidentHistoryService } from '@metro/shared/api';
import {
  getAgencyIconPath,
  getContrastColor,
  getRailLineByCode,
  IncidentHistoryItem,
  IncidentHistoryResponse,
  parseRailLineCode,
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

@Component({
  selector: 'app-incident-history',
  imports: [
    CommonModule,
    FormsModule,
    NgOptimizedImage,
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    MatTooltipModule,
    HistoryDateRangeFieldsComponent,
    HistoryPaginationComponent,
  ],
  templateUrl: './incident-history.component.html',
  styleUrl: './incident-history.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IncidentHistoryComponent {
  private readonly incidentHistoryService = inject(IncidentHistoryService);
  private readonly pageSize = 30;

  readonly startDate = signal(formatDateInput(daysAgo(30)));
  readonly endDate = signal(formatDateInput(new Date()));
  readonly selectedAgency = signal('all');
  readonly selectedLine = signal('all');
  readonly selectedSituation = signal('all');
  readonly incidentsOnly = signal(false);
  readonly loadState = signal<HistoryLoadState>('idle');
  readonly errorMessage = signal<string | null>(null);
  readonly response = signal<IncidentHistoryResponse | null>(null);
  readonly currentPage = signal(1);

  readonly incidents = computed(() => this.response()?.ocorrencias ?? []);

  readonly agencies = computed(() =>
    uniqueHistoryOptions(
      this.incidents().map((incident) => incident.empresa.nome),
    ),
  );

  readonly lines = computed(() =>
    uniqueHistoryOptions(
      this.incidents().map((incident) => incident.linha.nome),
    ),
  );

  readonly situations = computed(() =>
    uniqueHistoryOptions(this.incidents().map((incident) => incident.situacao)),
  );

  readonly filteredIncidents = computed(() => {
    const agency = this.selectedAgency();
    const line = this.selectedLine();
    const situation = this.selectedSituation();
    const incidentsOnly = this.incidentsOnly();

    return this.incidents().filter((incident) => {
      if (agency !== 'all' && incident.empresa.nome !== agency) return false;
      if (line !== 'all' && incident.linha.nome !== line) return false;
      if (situation !== 'all' && incident.situacao !== situation) return false;
      if (incidentsOnly && !incident.classificacao.conta_incidente) {
        return false;
      }

      return true;
    });
  });

  readonly totalPages = computed(() =>
    getHistoryTotalPages(this.filteredIncidents().length, this.pageSize),
  );

  readonly pagedIncidents = computed(() =>
    sliceHistoryPage(
      this.filteredIncidents(),
      this.currentPage(),
      this.totalPages(),
      this.pageSize,
    ),
  );

  readonly summaryText = computed(() => {
    const total = this.response()?.total ?? this.incidents().length;
    const filtered = this.filteredIncidents().length;

    if (total === filtered) {
      return `${total} registros encontrados`;
    }

    return `${filtered} de ${total} registros exibidos`;
  });

  constructor() {
    this.fetchIncidents();
  }

  fetchIncidents(): void {
    this.loadState.set('loading');
    this.errorMessage.set(null);
    this.currentPage.set(1);

    this.incidentHistoryService
      .fetchIncidents({
        dataInicio: this.startDate(),
        dataFim: this.endDate(),
      })
      .subscribe({
        next: (response) => {
          this.response.set(response);
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
    this.selectedAgency.set('all');
    this.selectedLine.set('all');
    this.selectedSituation.set('all');
    this.incidentsOnly.set(false);
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

  onSituationChange(value: string): void {
    this.selectedSituation.set(value);
    this.currentPage.set(1);
  }

  onIncidentsOnlyChange(value: boolean): void {
    this.incidentsOnly.set(value);
    this.currentPage.set(1);
  }

  hasDescription(incident: IncidentHistoryItem): boolean {
    return incident.descricao.trim().length > 0;
  }

  lineBadge(incident: IncidentHistoryItem): {
    code: number;
    backgroundColor: string;
    textColor: string;
  } | null {
    const line = this.getIncidentRailLine(incident);

    if (!line) {
      return null;
    }

    return {
      code: line.code,
      backgroundColor: line.colorHex,
      textColor: getContrastColor(line.colorHex),
    };
  }

  agencyIconPath(incident: IncidentHistoryItem): string | null {
    const line = this.getIncidentRailLine(incident);

    return line ? getAgencyIconPath(line.agency) : null;
  }

  formatDateTime(value: string): string {
    return formatTransitDateTime(value, { assumeTransitOffset: true });
  }

  private resetLocalFilters(): void {
    this.selectedAgency.set('all');
    this.selectedLine.set('all');
    this.selectedSituation.set('all');
    this.incidentsOnly.set(false);
  }

  private getIncidentRailLine(incident: IncidentHistoryItem) {
    const lineCode = parseRailLineCode(
      incident.linha.nome,
      incident.linha.codigo,
    );

    return lineCode === undefined ? undefined : getRailLineByCode(lineCode);
  }

  private describeError(error: unknown): string {
    return describeHistoryError(error, {
      unexpected:
        'Não foi possível carregar o histórico por um erro inesperado na aplicação.',
      backendDown:
        'Não foi possível conectar ao backend. O servidor pode estar desligado, reiniciando ou indisponível na rede.',
      badRequest: (httpError) =>
        this.extractBackendMessage(httpError) ||
        'O backend recusou o intervalo de datas informado.',
      serverError:
        'O backend respondeu, mas não conseguiu consultar o histórico armazenado agora. Tente novamente em alguns instantes.',
      fallback: (status) =>
        `Não foi possível carregar o histórico. O backend respondeu com HTTP ${status}.`,
    });
  }

  private extractBackendMessage(error: HttpErrorResponse): string | null {
    const message = (error.error as { message?: unknown } | null)?.message;

    if (Array.isArray(message)) {
      return message.join(' ');
    }

    return typeof message === 'string' ? message : null;
  }
}
