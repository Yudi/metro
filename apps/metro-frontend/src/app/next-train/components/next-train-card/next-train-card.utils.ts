import type { NextTrainArrival } from '../../next-train.types';
import type {
  ScheduledDepartureForDisplay,
  TrainDirectionView,
} from './next-train-card.types';
import {
  formatScheduledRailTime,
  hardNormalizeString,
} from '@metro/shared/utils';
import type { RailScheduledService } from '@metro/shared/utils';

export type ScheduledServiceForDisplay = RailScheduledService;

export interface ScheduledDirection {
  readonly terminal: string;
  readonly destinationNames: ReadonlySet<string>;
  readonly nextService: ScheduledServiceForDisplay;
  readonly intervalLabel: string | undefined;
  readonly followingDepartures: readonly ScheduledDepartureForDisplay[];
}

export function compareArrivalTimes(
  first: NextTrainArrival,
  second: NextTrainArrival,
): number {
  const firstMinutes = getMinutesUntilArrival(first.arrivalTime);
  const secondMinutes = getMinutesUntilArrival(second.arrivalTime);
  if (firstMinutes === null || secondMinutes === null) {
    return first.arrivalTime.localeCompare(second.arrivalTime);
  }
  return firstMinutes - secondMinutes;
}

function getMinutesUntilArrival(arrivalTime: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(arrivalTime);
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;

  const now = new Date();
  const arrival = new Date(now);
  arrival.setHours(hours, minutes, 0, 0);
  if (arrival.getTime() < now.getTime()) {
    arrival.setDate(arrival.getDate() + 1);
  }
  return Math.round((arrival.getTime() - now.getTime()) / 60000);
}

export function sortDirections(
  directions: readonly TrainDirectionView[],
  terminals: readonly string[],
): TrainDirectionView[] {
  return [...directions].sort((first, second) => {
    const firstIndex = terminals.indexOf(first.terminal);
    const secondIndex = terminals.indexOf(second.terminal);
    return firstIndex - secondIndex;
  });
}

export function getScheduledServiceInstant(
  service: ScheduledServiceForDisplay,
): number | null {
  const value = service.nextArrivalAt ?? service.nextDepartureAt;
  if (!value) {
    return null;
  }

  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function groupScheduledServices(
  services: readonly RailScheduledService[],
  resolveDirection: (service: ScheduledServiceForDisplay) => string,
): ScheduledDirection[] {
  const grouped = new Map<
    string,
    { terminal: string; services: ScheduledServiceForDisplay[] }
  >();

  for (const service of services) {
    if (
      !service.destinationName?.trim() ||
      !service.originStationName?.trim() ||
      getScheduledServiceInstant(service) === null
    ) {
      continue;
    }

    const terminal = resolveDirection(service);
    if (!terminal) {
      continue;
    }

    const key = hardNormalizeString(terminal);
    const existing = grouped.get(key);
    if (existing) {
      existing.services.push(service);
    } else {
      grouped.set(key, { terminal, services: [service] });
    }
  }

  return [...grouped.values()].map(
    ({ terminal, services: groupedServices }) => {
      const sortedServices = [...groupedServices].sort(
        (first, second) =>
          (getScheduledServiceInstant(first) ?? Number.POSITIVE_INFINITY) -
          (getScheduledServiceInstant(second) ?? Number.POSITIVE_INFINITY),
      );
      const nextService = sortedServices[0];
      const intervalLabel = nextService.intervalLabel?.trim() || undefined;

      return {
        terminal,
        destinationNames: new Set(
          groupedServices.map((service) => service.destinationName),
        ),
        nextService,
        intervalLabel,
        followingDepartures: nextService.followingDepartures ?? [],
      };
    },
  );
}

export function formatScheduledServiceTime(
  service: RailScheduledService,
  timeZone: string,
  now = new Date(),
): string {
  return formatScheduledRailTime(
    service.nextArrivalAt ?? service.nextDepartureAt,
    timeZone,
    now,
  );
}

export function getScheduledServiceLocation(
  service: ScheduledServiceForDisplay,
): string {
  if (service.nextArrivalAt) {
    return service.arrivalEstimated === false
      ? 'Saída programada'
      : 'Estimativa pela programação';
  }

  const originName = service.originStationName?.trim();
  return originName ? `Saída programada de ${originName}` : 'Saída programada';
}

export function formatScheduledDepartureTime(
  departure: ScheduledDepartureForDisplay,
  timeZone: string,
  now = new Date(),
): string {
  return formatScheduledRailTime(
    departure.arrivalAt ?? departure.departureAt,
    timeZone,
    now,
  );
}

export function getScheduledDepartureLocation(
  departure: ScheduledDepartureForDisplay,
): string {
  return departure.arrivalAt
    ? 'Estimativa pela programação'
    : 'Saída programada';
}
