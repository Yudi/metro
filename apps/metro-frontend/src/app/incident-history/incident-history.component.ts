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
  DEFAULT_TRANSIT_TIME_ZONE,
  getAgencyIconPath,
  getContrastColor,
  getRailLineByCode,
  IncidentHistoryItem,
  IncidentHistoryResponse,
  parseRailLineCode,
} from '@metro/shared/utils';

type LoadState = 'idle' | 'loading' | 'loaded' | 'error';

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
  ],
  templateUrl: './incident-history.component.html',
  styleUrl: './incident-history.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IncidentHistoryComponent {
  private readonly incidentHistoryService = inject(IncidentHistoryService);
  private readonly pageSize = 30;

  readonly startDate = signal(this.formatDateInput(this.daysAgo(30)));
  readonly endDate = signal(this.formatDateInput(new Date()));
  readonly selectedAgency = signal('all');
  readonly selectedLine = signal('all');
  readonly selectedSituation = signal('all');
  readonly incidentsOnly = signal(false);
  readonly loadState = signal<LoadState>('idle');
  readonly errorMessage = signal<string | null>(null);
  readonly response = signal<IncidentHistoryResponse | null>(null);
  readonly currentPage = signal(1);

  readonly incidents = computed(() => this.response()?.ocorrencias ?? []);

  readonly agencies = computed(() =>
    this.uniqueOptions(
      this.incidents().map((incident) => incident.empresa.nome),
    ),
  );

  readonly lines = computed(() =>
    this.uniqueOptions(this.incidents().map((incident) => incident.linha.nome)),
  );

  readonly situations = computed(() =>
    this.uniqueOptions(this.incidents().map((incident) => incident.situacao)),
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
    Math.max(1, Math.ceil(this.filteredIncidents().length / this.pageSize)),
  );

  readonly pagedIncidents = computed(() => {
    const safePage = Math.min(this.currentPage(), this.totalPages());
    const start = (safePage - 1) * this.pageSize;

    return this.filteredIncidents().slice(start, start + this.pageSize);
  });

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
    this.currentPage.update((page) => Math.max(1, page - 1));
  }

  nextPage(): void {
    this.currentPage.update((page) => Math.min(this.totalPages(), page + 1));
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
    const normalizedValue = value.includes('Z')
      ? value
      : `${value.replace(/\.\d+$/, '')}-03:00`;
    const date = new Date(normalizedValue);

    if (Number.isNaN(date.getTime())) {
      return value;
    }

    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: DEFAULT_TRANSIT_TIME_ZONE,
    }).format(date);
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

  private uniqueOptions(values: string[]): string[] {
    return Array.from(new Set(values.filter(Boolean))).sort((a, b) =>
      a.localeCompare(b, 'pt-BR'),
    );
  }

  private describeError(error: unknown): string {
    if (!(error instanceof HttpErrorResponse)) {
      return 'Não foi possível carregar o histórico por um erro inesperado na aplicação.';
    }

    if (error.status === 0) {
      return 'Não foi possível conectar ao backend. O servidor pode estar desligado, reiniciando ou indisponível na rede.';
    }

    if (error.status === 400) {
      const backendMessage = this.extractBackendMessage(error);
      return (
        backendMessage || 'O backend recusou o intervalo de datas informado.'
      );
    }

    if (error.status >= 500) {
      return 'O backend respondeu, mas não conseguiu consultar o histórico armazenado agora. Tente novamente em alguns instantes.';
    }

    return `Não foi possível carregar o histórico. O backend respondeu com HTTP ${error.status}.`;
  }

  private extractBackendMessage(error: HttpErrorResponse): string | null {
    const message = (error.error as { message?: unknown } | null)?.message;

    if (Array.isArray(message)) {
      return message.join(' ');
    }

    return typeof message === 'string' ? message : null;
  }

  private daysAgo(days: number): Date {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return date;
  }

  private formatDateInput(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
