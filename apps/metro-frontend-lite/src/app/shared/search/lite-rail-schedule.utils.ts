import { formatScheduledRailTime } from '@metro/shared/utils';
import type {
  RailScheduledDeparture,
  RailScheduledService,
} from '@metro/shared/utils';

export function formatLiteScheduledServiceTime(
  service: RailScheduledService,
  now = new Date(),
): string {
  return formatScheduledRailTime(
    service.nextArrivalAt ?? service.nextDepartureAt,
    undefined,
    now,
  );
}

export function formatLiteScheduledDepartureTime(
  departure: RailScheduledDeparture,
  now = new Date(),
): string {
  return formatScheduledRailTime(
    departure.arrivalAt ?? departure.departureAt,
    undefined,
    now,
  );
}

export function getLiteScheduledServiceLocation(
  service: RailScheduledService,
): string {
  if (service.nextArrivalAt) {
    return service.arrivalEstimated === false
      ? 'Saída programada'
      : 'Estimativa pela programação';
  }

  return service.originStationName
    ? `Saída programada de ${service.originStationName}`
    : 'Saída programada';
}

export function getLiteScheduledDepartureTooltip(
  departure: RailScheduledDeparture,
): string {
  return departure.arrivalAt
    ? 'Estimativa pela programação. Sem dados em tempo real'
    : 'Saída programada. Sem dados em tempo real';
}
