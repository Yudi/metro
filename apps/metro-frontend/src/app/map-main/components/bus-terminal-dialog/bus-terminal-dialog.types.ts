import type {
  BusTerminalDetail,
  BusTerminalSummary,
  BusTerminalStop,
} from '@metro/shared/bus-terminal-contracts';

export const ALL_TERMINAL_PLATFORMS = 'all';
export const UNKNOWN_TERMINAL_PLATFORM = '__unknown__';

export interface BusTerminalViewState {
  query: string;
  platformCode: string;
  scrollTop: number;
  expandedPlatformKeys?: string[];
}

export interface BusTerminalDialogData extends BusTerminalViewState {
  terminalId: string;
  summary?: BusTerminalSummary;
  fitOnLoad: boolean;
  showMapActions?: boolean;
  selectedRouteIds?: () => Set<string>;
  onDetailsLoaded?: (detail: BusTerminalDetail) => void;
  onSelectStop?: (
    stop: BusTerminalStop,
    viewState: BusTerminalViewState,
  ) => void;
  onSelectRoute?: (routeId: string) => void;
  onShowStopOnMap?: (
    stop: BusTerminalStop,
    viewState?: BusTerminalViewState,
  ) => void;
  onShowTerminalOnMap?: () => void;
}

export interface BusTerminalReturnData {
  terminalId: string;
  summary?: BusTerminalSummary;
  viewState: BusTerminalViewState;
}

export function normalizeTerminalSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLocaleLowerCase('pt-BR');
}
