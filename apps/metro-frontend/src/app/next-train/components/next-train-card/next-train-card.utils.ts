import type { NextTrainArrival } from '../../next-train.types';
import type { TrainDirectionView } from './next-train-card.types';

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
