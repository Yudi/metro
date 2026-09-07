import type { Meta, StoryObj } from '@storybook/angular';
import {
  ROUTE_ARTESP_001,
  ROUTE_ARTESP_WITHOUT_FARE,
} from '@metro/storybook-mocks';
import type { TypesenseRoute } from '../../../../services/typesense-search.service';
import {
  SearchResultCardComponent,
  type SearchResult,
} from './search-result-card.component';

function toSearchResult(route: {
  id: string;
  routeId: string;
  shortName: string;
  longName: string;
  routeType: number;
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
    agency_id: route.sourceAgency ?? '',
    route_short_name: route.shortName,
    route_long_name: route.longName,
    route_type: route.routeType,
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
