import type { Meta, StoryObj } from '@storybook/angular';
import {
  ROUTE_ARTESP_001,
  ROUTE_ARTESP_WITHOUT_FARE,
} from '@metro/storybook-mocks';
import type { TypesenseRoute } from '../../../../search/typesense-search.service';
import {
  SearchResultCardComponent,
  type SearchResult,
} from './search-result-card.component';

function toSearchResult(route: {
  id: string;
  routeId: string;
  shortName: string;
  longName: string;
  color: string;
  textColor: string;
  sourceAgency?: string;
  sourceId?: string;
  supportsRealtime?: boolean;
  fares?: Array<{ price: number; currency: string }>;
}): SearchResult {
  const routeData: TypesenseRoute = {
    id: route.id,
    route_id: route.routeId,
    route_short_name: route.shortName,
    route_long_name: route.longName,
    route_color: route.color,
    route_text_color: route.textColor,
    source: 'gtfs',
    sourceAgency: route.sourceAgency,
    sourceId: route.sourceId,
    supportsRealtime: route.supportsRealtime,
    fares: route.fares,
  };

  return {
    id: route.routeId,
    name: route.shortName,
    type: 'route',
    routeData,
    source: 'gtfs',
  };
}

const meta: Meta<SearchResultCardComponent> = {
  title: 'Bus/SearchResultCard',
  component: SearchResultCardComponent,
  tags: ['autodocs'],
};

export default meta;

type Story = StoryObj<SearchResultCardComponent>;

export const ArtespWithFare: Story = {
  args: {
    result: toSearchResult(ROUTE_ARTESP_001),
  },
};

export const ArtespWithoutFare: Story = {
  args: {
    result: toSearchResult(ROUTE_ARTESP_WITHOUT_FARE),
  },
};

export const UnknownAgency: Story = {
  args: {
    result: toSearchResult({
      ...ROUTE_ARTESP_001,
      id: 'regional:unknown',
      routeId: 'regional:unknown',
      sourceAgency: 'Regional Intermunicipal',
      sourceId: 'unknown',
    }),
  },
};

/** Synthetic opposite-direction cards share a line code but retain separate identities. */
export const SeparateDestinations: Story = {
  render: () => {
    const outbound = toSearchResult(ROUTE_ARTESP_001);
    const inbound = toSearchResult(ROUTE_ARTESP_001);
    if (!outbound.routeData || !inbound.routeData) {
      throw new Error('Direction fixtures must include route data');
    }
    outbound.id = 'direction-outbound';
    inbound.id = 'direction-inbound';
    outbound.routeData = { ...outbound.routeData, favoriteCode: outbound.id, destination: 'Terminal Central', directionId: 0 };
    inbound.routeData = { ...inbound.routeData, favoriteCode: inbound.id, destination: 'Terminal Bairro', directionId: 1 };
    return {
      props: { outbound, inbound },
      template: `<app-search-result-card [result]="outbound" /><app-search-result-card [result]="inbound" />`,
    };
  },
  play: async ({ canvasElement }) => {
    const titles = [...canvasElement.querySelectorAll('.result-title')];
    if (titles.length !== 2 || titles.some((title) => title.textContent?.trim() !== ROUTE_ARTESP_001.longName)) {
      throw new Error('Both directions must retain the full line name');
    }
    const directions = [...canvasElement.querySelectorAll('.result-direction')]
      .map((direction) => direction.textContent?.trim());
    if (!directions.includes('Sentido Terminal Central') || !directions.includes('Sentido Terminal Bairro')) {
      throw new Error('Destinations must appear separately below the line names');
    }
  },
};
