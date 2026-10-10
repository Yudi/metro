import { Component, inject, input, OnInit, signal } from '@angular/core';
import { provideRouter, withDisabledInitialNavigation } from '@angular/router';
import { Meta, StoryObj, moduleMetadata } from '@storybook/angular';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { FavoritesService } from '@metro/shared/api';
import {
  createEmptyFavorites,
  encodeBusDirectionFavorite,
} from '@metro/shared/utils';
import { of } from 'rxjs';
import { BusInformationService } from '../map-main/components/bus-information/bus-information.service';
import {
  BusRouteGraphQL,
  GeographyGraphQLService,
} from '../map-main/geography/geography-graphql.service';
import { BusItineraryService } from './bus-itinerary.service';
import { BusItineraryDialogComponent } from './bus-itinerary-dialog.component';
import {
  ARTESP_ITINERARY,
  ARTESP_ROUTE,
  NO_NOTICES,
  SPTRANS_ITINERARY,
  SPTRANS_NOTICES,
  SPTRANS_PUBLISHED,
  SPTRANS_ROUTE,
  UNAVAILABLE_ITINERARY,
  UNAVAILABLE_PUBLISHED,
} from './bus-itinerary.fixtures';

type StoryState = 'sptrans' | 'artesp' | 'unavailable';

interface BusItineraryStoryArgs {
  state: StoryState;
}

@Component({
  selector: 'app-bus-itinerary-story-host',
  imports: [MatButtonModule, MatDialogModule],
  template: `
    <p role="note">
      Prévia com dados ilustrativos, sem informações em tempo real.
    </p>
    <button mat-stroked-button type="button" (click)="open()">
      Abrir itinerário
    </button>
  `,
})
class BusItineraryStoryHostComponent implements OnInit {
  readonly state = input.required<StoryState>();

  private readonly dialog = inject(MatDialog);

  ngOnInit(): void {
    this.open();
  }

  open(): void {
    const state = this.state();
    const routeId =
      state === 'artesp'
        ? ARTESP_ROUTE.route_id
        : state === 'unavailable'
          ? 'unavailable:route'
          : SPTRANS_ROUTE.route_id;
    const favoriteCode =
      state === 'sptrans'
        ? createDirectionRows(state)[0]?.favoriteCode
        : undefined;
    this.dialog.open(BusItineraryDialogComponent, {
      data: { routeId, favoriteCode },
      maxWidth: '900px',
      width: '96vw',
    });
  }
}

function createDirectionRows(state: StoryState): BusRouteGraphQL[] {
  if (state === 'unavailable') {
    return [];
  }

  const source = state === 'artesp' ? ARTESP_ROUTE : SPTRANS_ROUTE;
  const terminals = source.route_long_name.split(/\s+[–-]\s+/);
  const first = terminals[0] ?? source.route_long_name;
  const second = terminals[1] ?? source.route_long_name;
  return [0, 1].map((directionId) => {
    const originLatitude = directionId === 0 ? -23.55 : -23.56;
    const originLongitude = directionId === 0 ? -46.63 : -46.62;
    const destinationLatitude = directionId === 0 ? -23.56 : -23.55;
    const destinationLongitude = directionId === 0 ? -46.62 : -46.63;
    const favoriteCode = encodeBusDirectionFavorite({
      sourceAgency: source.sourceAgency?.toLowerCase() ?? 'sptrans',
      shortName: source.route_short_name,
      originLatitude,
      originLongitude,
      viaLatitude: (originLatitude + destinationLatitude) / 2,
      viaLongitude: (originLongitude + destinationLongitude) / 2,
      destinationLatitude,
      destinationLongitude,
    });
    if (!favoriteCode) {
      throw new Error('Story direction key was invalid');
    }
    return {
      id: `${source.route_id}:${directionId}`,
      routeId: source.route_id,
      shortName: source.route_short_name,
      longName: source.route_long_name,
      favoriteCode,
      destination: directionId === 0 ? second : first,
      directionId,
      color: source.route_color,
      textColor: source.route_text_color,
      sourceAgency: source.sourceAgency?.toLowerCase(),
      fares: source.fares ?? [],
    };
  });
}

function createFavoritesService(state: StoryState) {
  const favorites = createEmptyFavorites();
  const directions = createDirectionRows(state);
  if (state === 'sptrans' && directions[0]?.favoriteCode) {
    favorites.busRoute = [directions[0].favoriteCode];
  }
  const favoriteState = signal(favorites);

  return {
    favorites: favoriteState.asReadonly(),
    addFavorite: (code: string, type: keyof typeof favorites) => {
      favoriteState.update((current) => ({
        ...current,
        [type]: [...current[type], code],
      }));
    },
    removeFavorite: (code: string, type: keyof typeof favorites) => {
      favoriteState.update((current) => ({
        ...current,
        [type]: current[type].filter((favorite) => favorite !== code),
      }));
    },
  };
}

function createProviders(state: StoryState) {
  return [
    provideRouter([], withDisabledInitialNavigation()),
    {
      provide: BusItineraryService,
      useValue: {
        published: (routeId: string) =>
          of(
            state === 'sptrans' && routeId === SPTRANS_ROUTE.route_id
              ? SPTRANS_PUBLISHED
              : UNAVAILABLE_PUBLISHED,
          ),
        load: (routeId: string, serviceDate: string) => {
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
      } satisfies Pick<BusItineraryService, 'load' | 'published'>,
    },
    {
      provide: BusInformationService,
      useValue: {
        notices: (routeCodes: string[]) =>
          of(
            state === 'sptrans' && routeCodes.includes(SPTRANS_ROUTE.route_id)
              ? SPTRANS_NOTICES
              : NO_NOTICES,
          ),
      } satisfies Pick<BusInformationService, 'notices'>,
    },
    {
      provide: GeographyGraphQLService,
      useValue: {
        getBusRouteDirections: () => of(createDirectionRows(state)),
      } satisfies Pick<GeographyGraphQLService, 'getBusRouteDirections'>,
    },
    {
      provide: FavoritesService,
      useValue: createFavoritesService(state),
    },
  ];
}

const meta: Meta<BusItineraryStoryArgs> = {
  title: 'Bus/Itinerary dialog',
  component: BusItineraryStoryHostComponent,
  tags: ['autodocs'],
  decorators: [
    moduleMetadata({
      imports: [BusItineraryStoryHostComponent, BusItineraryDialogComponent],
    }),
  ],
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Itinerário aberto como diálogo a partir da busca principal. Os dados são ilustrativos e não representam informações em tempo real.',
      },
    },
  },
  argTypes: {
    state: {
      control: 'select',
      options: ['sptrans', 'artesp', 'unavailable'],
      description: 'Fonte e estado de dados exibido no diálogo.',
    },
  },
  render: (args) => ({
    applicationConfig: { providers: createProviders(args.state) },
    template: '<app-bus-itinerary-story-host [state]="state" />',
  }),
};

export default meta;
type Story = StoryObj<BusItineraryStoryArgs>;

export const SptransComAvisos: Story = {
  args: { state: 'sptrans' },
};

export const ArtespComHorariosExatos: Story = {
  args: { state: 'artesp' },
};

export const Indisponivel: Story = {
  args: { state: 'unavailable' },
};
