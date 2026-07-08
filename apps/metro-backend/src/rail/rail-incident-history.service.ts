import { BadRequestException, Injectable } from '@nestjs/common';
import {
  AGENCIES_DATA,
  IncidentHistoryItem,
  IncidentHistoryResponse,
  TransitAgency,
  getRailLineByCode,
} from '@metro/shared/utils';
import {
  HistoricalIncidentEvent,
  Prisma,
  historical_incident_event_type,
} from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const MAX_DATE_RANGE_DAYS = 365;
const MAX_HISTORY_ROWS = 1_000;

type HistoricalIncidentRecord = HistoricalIncidentEvent;

@Injectable()
export class RailIncidentHistoryService {
  constructor(private readonly prisma: PrismaService) {}

  async fetchIncidents(
    dataInicio: string,
    dataFim: string,
  ): Promise<IncidentHistoryResponse> {
    const { start, end } = this.assertDateRange(dataInicio, dataFim);
    const where: Prisma.HistoricalIncidentEventWhereInput = {
      observedAt: {
        gte: start,
        lte: end,
      },
    };

    const [events, total] = await Promise.all([
      this.prisma.historicalIncidentEvent.findMany({
        where,
        orderBy: { observedAt: 'desc' },
        take: MAX_HISTORY_ROWS,
      }),
      this.prisma.historicalIncidentEvent.count({ where }),
    ]);

    return {
      meta: {
        versao: '1.0.0',
        timestamp: new Date().toISOString(),
        filtros_aplicados: {
          data_inicio: dataInicio,
          data_fim: dataFim,
          empresa: null,
          linha: null,
          classificacao: null,
        },
        source: '',
      },
      ocorrencias: events.map((event) => this.toIncidentHistoryItem(event)),
      total,
      limit: MAX_HISTORY_ROWS,
    };
  }

  private toIncidentHistoryItem(
    event: HistoricalIncidentRecord,
  ): IncidentHistoryItem {
    const lineCode = event.lineCode ?? 'SYSTEM';
    const lineName = event.lineName ?? this.getSystemLineName(event.eventType);
    const description = [event.description, event.detail]
      .filter((value): value is string => Boolean(value))
      .join('\n\n');

    return {
      id: this.stableNumericId(event.id),
      externalId: event.id,
      data_hora: event.observedAt.toISOString(),
      linha: {
        id: lineCode,
        nome: lineName,
        codigo: event.lineNumber?.toString() ?? lineCode,
      },
      empresa: {
        id: this.getAgencyId(event),
        nome: this.getAgencyLabel(event),
        key: this.getRailStatusAgency(event),
        badge: this.getAgencyBadge(event),
      },
      situacao: event.statusLabel ?? event.title,
      descricao: description || event.title,
      classificacao: {
        tipo: event.eventType,
        label: this.getClassificationLabel(event),
        conta_incidente: this.countsAsIncident(event),
      },
    };
  }

  private assertDateRange(
    dataInicio: string,
    dataFim: string,
  ): { start: Date; end: Date } {
    const start = this.parseDate(dataInicio, 'dataInicio', 'start');
    const end = this.parseDate(dataFim, 'dataFim', 'end');

    if (start > end) {
      throw new BadRequestException(
        'A data inicial precisa ser anterior ou igual à data final.',
      );
    }

    const days = (end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000) + 1;

    if (days > MAX_DATE_RANGE_DAYS) {
      throw new BadRequestException(
        `O intervalo máximo permitido é de ${MAX_DATE_RANGE_DAYS} dias.`,
      );
    }

    return { start, end };
  }

  private parseDate(
    value: string,
    fieldName: string,
    boundary: 'start' | 'end',
  ): Date {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new BadRequestException(
        `${fieldName} precisa usar o formato YYYY-MM-DD.`,
      );
    }

    const suffix =
      boundary === 'start' ? 'T00:00:00.000-03:00' : 'T23:59:59.999-03:00';
    const parsedDate = new Date(`${value}${suffix}`);

    if (Number.isNaN(parsedDate.getTime())) {
      throw new BadRequestException(`${fieldName} é uma data inválida.`);
    }

    return parsedDate;
  }

  private getSystemLineName(eventType: historical_incident_event_type): string {
    if (
      eventType === historical_incident_event_type.BACKEND_ONLINE ||
      eventType === historical_incident_event_type.BACKEND_OFFLINE ||
      eventType === historical_incident_event_type.BACKEND_OFFLINE_DETECTED
    ) {
      return 'Backend';
    }

    return 'Sistema';
  }

  private getAgencyId(event: HistoricalIncidentRecord): number {
    const agency = this.getRailStatusAgency(event);

    if (agency) {
      return this.stableNumericId(agency);
    }

    return this.stableNumericId(event.source);
  }

  private getAgencyLabel(event: HistoricalIncidentRecord): string {
    const agency = this.getRailStatusAgency(event);

    if (agency) {
      return AGENCIES_DATA[agency].shortName;
    }

    if (event.provider) {
      return this.toTitleLabel(event.provider);
    }

    switch (event.source) {
      case 'rail_status':
        return 'Monitoramento das linhas';
      case 'backend_lifecycle':
        return 'Backend';
      case 'headway_tracking':
        return 'Monitoramento de intervalos';
      default:
        return this.toTitleLabel(event.source);
    }
  }

  private getAgencyBadge(event: HistoricalIncidentRecord): string | undefined {
    const agency = this.getRailStatusAgency(event);

    if (agency) {
      return agency.toUpperCase();
    }

    switch (event.source) {
      case 'rail_status':
        return 'LINHAS';
      case 'backend_lifecycle':
        return 'SISTEMA';
      default:
        return undefined;
    }
  }

  private getClassificationLabel(event: HistoricalIncidentRecord): string {
    switch (event.eventType) {
      case historical_incident_event_type.RAIL_STATUS_INCIDENT:
        return this.isNonIncidentRailStatus(event.statusCode)
          ? 'Status operacional'
          : 'Incidente';
      case historical_incident_event_type.RAIL_STATUS_RECOVERED:
        return this.isRecoveryEvent(event)
          ? 'Normalização'
          : 'Status operacional';
      case historical_incident_event_type.BACKEND_ONLINE:
        return 'Backend online';
      case historical_incident_event_type.BACKEND_OFFLINE:
        return 'Backend offline';
      case historical_incident_event_type.BACKEND_OFFLINE_DETECTED:
        return 'Indisponibilidade detectada';
      case historical_incident_event_type.RETRIEVAL_ISSUE:
        return 'Falha de coleta';
    }
  }

  private countsAsIncident(event: HistoricalIncidentRecord): boolean {
    switch (event.eventType) {
      case historical_incident_event_type.RAIL_STATUS_INCIDENT:
        return !this.isNonIncidentRailStatus(event.statusCode);
      case historical_incident_event_type.BACKEND_OFFLINE:
      case historical_incident_event_type.BACKEND_OFFLINE_DETECTED:
      case historical_incident_event_type.RETRIEVAL_ISSUE:
        return true;
      case historical_incident_event_type.RAIL_STATUS_RECOVERED:
      case historical_incident_event_type.BACKEND_ONLINE:
        return false;
    }
  }

  private getRailStatusAgency(
    event: HistoricalIncidentRecord,
  ): TransitAgency | undefined {
    if (event.source !== 'rail_status') {
      return undefined;
    }

    const recordedAgency = this.toTransitAgency(event.agency);
    if (recordedAgency) {
      return recordedAgency;
    }

    const lineNumber = event.lineNumber ?? this.parseLineNumber(event.lineCode);

    if (lineNumber === undefined) {
      return undefined;
    }

    return getRailLineByCode(lineNumber)?.agency;
  }

  private toTransitAgency(value: string | null): TransitAgency | undefined {
    if (!value) {
      return undefined;
    }

    return Object.values(TransitAgency).includes(value as TransitAgency)
      ? (value as TransitAgency)
      : undefined;
  }

  private parseLineNumber(value: string | null): number | undefined {
    if (!value) {
      return undefined;
    }

    const match = value.match(/L(\d+)/i);
    if (!match) {
      return undefined;
    }

    return Number.parseInt(match[1], 10);
  }

  private isRecoveryEvent(event: HistoricalIncidentRecord): boolean {
    return event.startedAt !== null || event.endedAt !== null;
  }

  private isNonIncidentRailStatus(statusCode: string | null): boolean {
    return (
      statusCode === 'OperacaoNormal' ||
      statusCode === 'OperacaoTransitoria' ||
      statusCode === 'OperacaoEspecial' ||
      statusCode === 'OperacaoDiferenciada' ||
      statusCode === 'OperacaoEncerrada'
    );
  }

  private toTitleLabel(value: string): string {
    return value
      .split(/[_-]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  private stableNumericId(value: string): number {
    let hash = 0;

    for (let index = 0; index < value.length; index += 1) {
      hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
    }

    return hash;
  }
}
