export interface DepartureIntervalSummary {
  startTime: string;
  endTime: string;
  minimumMinutes: number;
  maximumMinutes: number;
}

const WINDOW_SECONDS = 3 * 60 * 60;

/** Summarize actual consecutive departures; never extrapolate a service window. */
export function summarizeDepartureIntervals(
  departures: readonly string[],
): DepartureIntervalSummary[] {
  const seconds = [
    ...new Set(
      departures
        .map(parseTime)
        .filter((value): value is number => value !== null),
    ),
  ].sort((left, right) => left - right);
  const groups = new Map<number, DepartureIntervalSummary>();
  for (let index = 1; index < seconds.length; index++) {
    const from = seconds[index - 1];
    const to = seconds[index];
    const minutes = (to - from) / 60;
    const window = Math.floor(from / WINDOW_SECONDS);
    const previous = groups.get(window);
    if (previous) {
      previous.endTime = formatTime(to);
      previous.minimumMinutes = Math.min(previous.minimumMinutes, minutes);
      previous.maximumMinutes = Math.max(previous.maximumMinutes, minutes);
    } else {
      groups.set(window, {
        startTime: formatTime(from),
        endTime: formatTime(to),
        minimumMinutes: minutes,
        maximumMinutes: minutes,
      });
    }
  }
  const summaries: DepartureIntervalSummary[] = [];
  for (const group of groups.values()) {
    const previous = summaries[summaries.length - 1];
    if (
      previous &&
      previous.endTime === group.startTime &&
      previous.minimumMinutes === group.minimumMinutes &&
      previous.maximumMinutes === group.maximumMinutes
    ) {
      previous.endTime = group.endTime;
    } else {
      summaries.push({ ...group });
    }
  }
  return summaries;
}

function parseTime(value: string): number | null {
  const match = /^(\d{1,2}):([0-5]\d)(?::([0-5]\d))?$/.exec(value);
  return match
    ? Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3] ?? 0)
    : null;
}

function formatTime(seconds: number): string {
  return `${String(Math.floor(seconds / 3600)).padStart(2, '0')}:${String(Math.floor((seconds % 3600) / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}
