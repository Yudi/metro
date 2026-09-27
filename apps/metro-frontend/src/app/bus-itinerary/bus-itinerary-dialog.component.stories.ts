import { Component, inject, input } from '@angular/core';
import { provideRouter, withDisabledInitialNavigation } from '@angular/router';
import { Meta, StoryObj, moduleMetadata } from '@storybook/angular';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { of } from 'rxjs';
import { BusInformationService } from '../map-main/components/bus-information/bus-information.service';
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
class BusItineraryStoryHostComponent {
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
    this.dialog.open(BusItineraryDialogComponent, {
      data: { routeId },
      maxWidth: '900px',
      width: '96vw',
    });
  }
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
