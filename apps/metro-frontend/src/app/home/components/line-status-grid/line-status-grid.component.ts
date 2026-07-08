import { Component, computed, inject, input, Signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { merge, Subject, timer } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import {
  LineDescriptionDialogComponent,
  LineDescriptionDialogData,
  LineScheduleSection,
} from './line-description-dialog.component';
import { ApiService } from '@metro/shared/api';
import {
  AEROMOVEL_GRU_OPERATION,
  EXPRESSO_AEROPORTO_SCHEDULE,
  EXPRESSO_LINHA_10_SCHEDULE,
  RailLineStatus,
  RailLinesStatusResponse,
  SpecialRailInfoCardStatus,
  SpecialRailLineStatus,
  SPECIAL_RAIL_LINE_CODES,
  hasDashboardStatusIssue,
  isStatusClickable,
} from '@metro/shared/utils';
import { DatePipe } from '@angular/common';

const CPTM_TRANSFER_INTERVALS_URL =
  'https://www.cptm.sp.gov.br/cptm/sua-viagem/transferencias-e-intervalos';

const EXPRESSO_LINHA_10_SOURCE_URL =
  'https://www.cptm.sp.gov.br/dx/api/dam/v1/collections/05321fd9-3791-4689-a8ac-9e2adde39c4b/items/996297d1-45bf-4a2c-adb2-23cf38c61c9a/renditions/9bb7e05d-a547-40da-9b30-181dc8154c8d?binary=true';

function formatWholeHour(time: string): string {
  const [hour = time] = time.split(':');
  return hour === '00' ? '00h' : `${Number.parseInt(hour, 10)}h`;
}

const AEROMOVEL_GRU_DIALOG_INFO = {
  scheduleText: `Todos os dias, das ${formatWholeHour(AEROMOVEL_GRU_OPERATION.openFrom)} às ${formatWholeHour(AEROMOVEL_GRU_OPERATION.openUntil)}, com intervalo teórico de 6 minutos.`,
  shuttleMessage:
    'Você também pode optar por translado por ônibus das 04h às 00h.',
  shuttleUrl:
    'https://www.gru.com.br/pt/passageiro/como-chegar-sair/traslado-interno/',
} as const;

const SPECIAL_INFO_CARD_DETAILS: Record<string, string[]> = {
  'transfer-cptm-metro': [
    'A transferência entre CPTM e Metrô nas estações Tatuapé e Corinthians-Itaquera é gratuita nos dias e horários abaixo.',
    '2ª a 6ª feira: das 10h às 17h, e das 20h até o término da operação comercial.',
    'Sábados, domingos e feriados: liberado durante toda a operação comercial.',
  ],
};

const EXPRESSO_LINHA_10_SCHEDULE_SECTIONS: LineScheduleSection[] = [
  {
    title: 'Santo André → Tamanduateí',
    description:
      'Ida com parada em São Caetano; retorno de Tamanduateí para Santo André.',
    times: EXPRESSO_LINHA_10_SCHEDULE.departures.santoAndre,
  },
  {
    title: 'Tamanduateí → Santo André',
    description:
      'Ida com parada em São Caetano; retorno de Santo André para Tamanduateí.',
    times: EXPRESSO_LINHA_10_SCHEDULE.departures.tamanduatei,
  },
];

const SPECIAL_LINE_DIALOG_INFO: Record<
  string,
  {
    description: string;
    details?: readonly string[];
    scheduleSections?: readonly LineScheduleSection[];
    note?: string;
    linkLabel: string;
    url: string;
  }
> = {
  [SPECIAL_RAIL_LINE_CODES.EXPRESSO_AEROPORTO]: {
    description: `De segunda a sábado, partidas a cada ${EXPRESSO_AEROPORTO_SCHEDULE.weekdayIntervalMinutes} minutos, das 5h às 00h. Aos domingos, a cada ${EXPRESSO_AEROPORTO_SCHEDULE.sundayIntervalMinutes} minutos no mesmo período.`,
    details: [
      'As partidas seguem o horário programado e podem variar conforme condições operacionais.',
    ],
    linkLabel: 'Ver página da CPTM',
    url: CPTM_TRANSFER_INTERVALS_URL,
  },
  [SPECIAL_RAIL_LINE_CODES.EXPRESSO_LINHA_10]: {
    description: 'Dias úteis, nos picos da manhã e da tarde.',
    scheduleSections: EXPRESSO_LINHA_10_SCHEDULE_SECTIONS,
    note: 'Horários programados sujeitos às condições operacionais.',
    linkLabel: 'Fonte: CPTM',
    url: EXPRESSO_LINHA_10_SOURCE_URL,
  },
} as const;

@Component({
  selector: 'app-line-status-grid',
  imports: [MatDialogModule, MatIconModule, DatePipe],
  templateUrl: './line-status-grid.component.html',
  styleUrl: './line-status-grid.component.scss',
})
export class LineStatusGridComponent {
  private readonly apiService = inject(ApiService);
  private readonly dialog = inject(MatDialog);
  private readonly nbsp = '\u00A0';

  readonly lineCodes = input<readonly number[] | null>(null);
  readonly specialLineCodes = input<readonly string[] | null>(null);
  readonly issueLineCodes = input<readonly number[]>([]);
  readonly headerText = input('Estado das linhas');
  readonly showHeader = input(true);
  readonly showSpecialServices = input(true);
  readonly emptyText = input('Nenhuma linha para exibir.');

  private readonly initialStatus: RailLinesStatusResponse = {
    lines: [],
    specialLines: [],
    specialInfoCards: [],
    lastUpdated: new Date(0),
    success: null,
    errorMessage: null,
  };

  private readonly refreshSubject = new Subject<void>();

  lineStatusSignal: Signal<RailLinesStatusResponse> = toSignal(
    merge(timer(0, 300_000), this.refreshSubject).pipe(
      switchMap(() => this.apiService.getRailStatus()),
    ),
    {
      initialValue: this.initialStatus,
    },
  );

  readonly regularLines = computed(() => {
    const codes = this.lineCodes();
    const issueLineCodesSet = new Set(this.issueLineCodes());
    const lines = this.lineStatusSignal().lines;

    if (codes === null) {
      return lines;
    }

    const codesSet = new Set(codes);
    return lines.filter(
      (line) =>
        codesSet.has(line.code) ||
        (issueLineCodesSet.has(line.code) && this.hasDashboardIssue(line)),
    );
  });

  readonly visibleSpecialLines = computed(() =>
    (this.lineStatusSignal().specialLines ?? []).filter((line) =>
      this.shouldShowSpecialLine(line),
    ),
  );

  formatLineName(line: string): string {
    return line.charAt(0).toUpperCase() + line.slice(1).toLowerCase();
  }

  formatSpecialLineName(line: SpecialRailLineStatus): string {
    if (line.code !== SPECIAL_RAIL_LINE_CODES.EXPRESSO_LINHA_10) {
      return line.line;
    }

    return line.line.replace('Linha 10', `Linha${this.nbsp}10`);
  }

  formatDepartureLabel(label: string): string {
    if (label === 'Santo André') {
      return `Santo${this.nbsp}André`;
    }

    return label;
  }

  isExpressoLinha10(line: SpecialRailLineStatus): boolean {
    return line.code === SPECIAL_RAIL_LINE_CODES.EXPRESSO_LINHA_10;
  }

  isLineClickable(line: RailLineStatus): boolean {
    return isStatusClickable(line.statusCode);
  }

  isSpecialLineClickable(line: SpecialRailLineStatus): boolean {
    if (line.code in SPECIAL_LINE_DIALOG_INFO) {
      return true;
    }

    if (line.code === SPECIAL_RAIL_LINE_CODES.AEROMOVEL_GRU) {
      return true;
    }

    return line.issues.length > 0;
  }

  shouldShowSpecialIssues(line: SpecialRailLineStatus): boolean {
    return line.issues.length > 0;
  }

  shouldShowSpecialSchedule(line: SpecialRailLineStatus): boolean {
    return (
      !this.shouldShowSpecialIssues(line) && line.nextDepartures.length > 0
    );
  }

  getScheduleTitle(line: SpecialRailLineStatus): string {
    if (line.code === '10X') {
      return 'Parte de:';
    }

    return line.nextDepartures.length > 1
      ? 'Próximas partidas:'
      : 'Próxima partida:';
  }

  statusLabelFormat(statusLabel: string): string {
    switch (statusLabel) {
      case 'Operação Normal':
        return 'Normal';
      case 'Operação Encerrada':
        return 'Encerrada';
      default:
        return statusLabel;
    }
  }

  lineClick(line: RailLineStatus): void {
    if (!this.isLineClickable(line)) {
      return;
    }

    this.dialog.open(LineDescriptionDialogComponent, {
      data: {
        title: `${line.code} - ${line.colorName}`,
        description: line.description ?? 'Sem detalhes adicionais no momento.',
        detail: line.detail,
      } satisfies LineDescriptionDialogData,
    });
  }

  specialLineClick(line: SpecialRailLineStatus): void {
    if (!this.isSpecialLineClickable(line)) {
      return;
    }

    if (line.code === SPECIAL_RAIL_LINE_CODES.AEROMOVEL_GRU) {
      this.dialog.open(LineDescriptionDialogComponent, {
        data: {
          title: `${line.code} - ${line.line}`,
          details: [
            AEROMOVEL_GRU_DIALOG_INFO.scheduleText,
            AEROMOVEL_GRU_DIALOG_INFO.shuttleMessage,
          ],
          link: {
            label: 'Saiba mais',
            url: AEROMOVEL_GRU_DIALOG_INFO.shuttleUrl,
          },
        } satisfies LineDescriptionDialogData,
      });
      return;
    }

    const dialogInfo =
      SPECIAL_LINE_DIALOG_INFO[
        line.code as keyof typeof SPECIAL_LINE_DIALOG_INFO
      ];
    if (dialogInfo) {
      this.dialog.open(LineDescriptionDialogComponent, {
        data: {
          title: `${line.code} - ${line.line}`,
          description: dialogInfo.description,
          details: [...(dialogInfo.details ?? [])],
          scheduleSections: dialogInfo.scheduleSections,
          note: dialogInfo.note,
          issues: line.issues,
          link: { label: dialogInfo.linkLabel, url: dialogInfo.url },
          specialLineCode: line.code,
        } satisfies LineDescriptionDialogData,
      });
      return;
    }

    this.dialog.open(LineDescriptionDialogComponent, {
      data: {
        title: `${line.code} - ${line.line}`,
        issues: line.issues,
      } satisfies LineDescriptionDialogData,
    });
  }

  shouldShowSpecialLine(line: SpecialRailLineStatus): boolean {
    const codes = this.specialLineCodes();
    return codes === null || codes.includes(line.code);
  }

  isSpecialInfoCardClickable(card: SpecialRailInfoCardStatus): boolean {
    return this.getSpecialInfoCardDetails(card.id).length > 0;
  }

  specialInfoCardClick(card: SpecialRailInfoCardStatus): void {
    if (!this.isSpecialInfoCardClickable(card)) {
      return;
    }

    this.dialog.open(LineDescriptionDialogComponent, {
      data: {
        title: card.title,
        details: this.getSpecialInfoCardDetails(card.id),
      } satisfies LineDescriptionDialogData,
    });
  }

  private getSpecialInfoCardDetails(cardId: string): string[] {
    return SPECIAL_INFO_CARD_DETAILS[cardId] ?? [];
  }

  private hasDashboardIssue(line: RailLineStatus): boolean {
    return hasDashboardStatusIssue(line.statusCode);
  }

  retryFetch(): void {
    this.refreshSubject.next();
  }
}
