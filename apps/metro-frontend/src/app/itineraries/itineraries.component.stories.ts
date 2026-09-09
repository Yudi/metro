import { Meta, StoryObj, moduleMetadata } from '@storybook/angular';
import {
  ActivatedRoute,
  ParamMap,
  convertToParamMap,
  provideRouter,
  withDisabledInitialNavigation,
} from '@angular/router';
import { BehaviorSubject, of } from 'rxjs';
import { TypesenseSearchService } from '../search/typesense-search.service';
import { BusInformationService } from '../map-main/components/bus-information/bus-information.service';
import { ItinerariesComponent } from './itineraries.component';
import { ItinerariesService } from './itineraries.service';
import {
  ARTESP_ITINERARY,
  ARTESP_ROUTE,
  ARTESP_SEARCH_RESULTS,
  NO_NOTICES,
  SPTRANS_ITINERARY,
  SPTRANS_NOTICES,
  SPTRANS_PUBLISHED,
  SPTRANS_ROUTE,
  SPTRANS_SEARCH_RESULTS,
  UNAVAILABLE_PUBLISHED,
  UNAVAILABLE_ITINERARY,
} from './itineraries.component.stories.fixtures';

type StoryState = 'sptrans' | 'artesp' | 'empty' | 'unavailable';

interface ItinerariesStoryArgs {
  state: StoryState;
}

const paramsByState: Record<StoryState, Record<string, string>> = {
  sptrans: { agency: 'sptrans', line: SPTRANS_ROUTE.route_id },
  artesp: {
    agency: 'artesp',
    line: ARTESP_ROUTE.route_id.slice('artesp:'.length),
  },
  empty: {},
  unavailable: { agency: 'sptrans', line: 'unavailable' },
};

function createActivatedRoute(state: StoryState): {
  paramMap: BehaviorSubject<ParamMap>;
  queryParamMap: BehaviorSubject<ParamMap>;
  snapshot: { paramMap: ParamMap; queryParamMap: ParamMap };
} {
  const queryParamMap = new BehaviorSubject(convertToParamMap({}));
  const paramMap = new BehaviorSubject(convertToParamMap(paramsByState[state]));
  return {
    paramMap,
    queryParamMap,
    snapshot: { paramMap: paramMap.value, queryParamMap: queryParamMap.value },
  };
}

function createMockTypesenseSearchService(
  state: StoryState,
): Pick<TypesenseSearchService, 'search'> {
  const results =
    state === 'artesp' ? ARTESP_SEARCH_RESULTS : SPTRANS_SEARCH_RESULTS;

  return {
    search: (query) =>
      of({
        success: true,
        query,
        results: [...results],
        total: results.length,
      }),
  };
}

function createMockItinerariesService(
  state: StoryState,
): Pick<ItinerariesService, 'load' | 'published'> {
  return {
    published: (routeId) =>
      of(
        state === 'sptrans' && routeId === SPTRANS_ROUTE.route_id
          ? SPTRANS_PUBLISHED
          : UNAVAILABLE_PUBLISHED,
      ),
    load: (routeId, serviceDate) => {
      if (state === 'unavailable') {
        return of({ ...UNAVAILABLE_ITINERARY, serviceDate });
      }

      const itinerary =
        state === 'artesp' ? ARTESP_ITINERARY : SPTRANS_ITINERARY;
      return of({
        ...itinerary,
        serviceDate,
        route: itinerary.route
          ? { ...itinerary.route, routeId }
          : itinerary.route,
      });
    },
  };
}

function createMockBusInformationService(
  state: StoryState,
): Pick<BusInformationService, 'notices'> {
  return {
    notices: (routeCodes) =>
      of(
        state === 'sptrans' && routeCodes.includes(SPTRANS_ROUTE.route_id)
          ? SPTRANS_NOTICES
          : NO_NOTICES,
      ),
  };
}

/** Each story gets fresh provider instances and a fresh route-param subject. */
function createProviders(state: StoryState) {
  return [
    provideRouter([], withDisabledInitialNavigation()),
    {
      provide: ActivatedRoute,
      useFactory: () => createActivatedRoute(state),
    },
    {
      provide: TypesenseSearchService,
      useFactory: () => createMockTypesenseSearchService(state),
    },
    {
      provide: ItinerariesService,
      useFactory: () => createMockItinerariesService(state),
    },
    {
      provide: BusInformationService,
      useFactory: () => createMockBusInformationService(state),
    },
  ];
}

const meta: Meta<ItinerariesStoryArgs> = {
  title: 'Bus/Itineraries',
  component: ItinerariesComponent,
  tags: ['autodocs'],
  decorators: [
    moduleMetadata({
      imports: [ItinerariesComponent],
    }),
  ],
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Estados ilustrativos da página de itinerários, com dados de demonstração para SPTrans e Artesp.',
      },
    },
  },
  argTypes: {
    state: {
      control: 'select',
      options: ['sptrans', 'artesp', 'empty', 'unavailable'],
      description: 'Estado de dados exibido pela história.',
    },
  },
  render: (args) => ({
    applicationConfig: {
      providers: createProviders(args.state),
    },
    template:
      '<p role="note">Prévia com dados ilustrativos, sem informações em tempo real.</p><app-itineraries />',
  }),
};

export default meta;
type Story = StoryObj<ItinerariesStoryArgs>;

export const SptransComAviso: Story = {
  args: { state: 'sptrans' },
  play: async ({ canvasElement }) => {
    canvasElement.querySelector<HTMLButtonElement>('.notice-button')?.click();
  },
};

export const ArtespComHorariosExatos: Story = {
  args: { state: 'artesp' },
};

export const EstadoInicial: Story = {
  args: { state: 'empty' },
};

export const Indisponivel: Story = {
  args: { state: 'unavailable' },
};
