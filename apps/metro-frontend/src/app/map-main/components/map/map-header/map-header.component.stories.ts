import { FormControl } from '@angular/forms';
import {
  provideRouter,
  withDisabledInitialNavigation,
} from '@angular/router';
import { applicationConfig, Meta, StoryObj } from '@storybook/angular';
import { expect, fn, userEvent, within } from 'storybook/test';
import { MapHeaderComponent } from './map-header.component';

type StoryOutputHandler = (event: void) => void;
type HeaderStoryArgs = Omit<
  MapHeaderComponent,
  | 'searchClick'
  | 'addressSearchClick'
  | 'userLocationToggle'
  | 'layersClick'
  | 'centerClick'
  | 'clearClick'
  | 'fitClick'
> & {
  searchValue: string;
  onSearchClick: StoryOutputHandler;
  onAddressSearchClick: StoryOutputHandler;
  onUserLocationToggle: StoryOutputHandler;
  onLayersClick: StoryOutputHandler;
  onCenterClick: StoryOutputHandler;
  onClearClick: StoryOutputHandler;
  onFitClick: StoryOutputHandler;
};
type Story = StoryObj<HeaderStoryArgs>;

function outputArgs() {
  return {
    onAddressSearchClick: fn(),
    onCenterClick: fn(),
    onClearClick: fn(),
    onFitClick: fn(),
    onLayersClick: fn(),
    onSearchClick: fn(),
    onUserLocationToggle: fn(),
  };
}

const headerTemplate = `
  <app-map-header
    [controls]="controls"
    [hasSelections]="hasSelections"
    [hasFeatures]="hasFeatures"
    [layersOpen]="layersOpen"
    [userLocationVisible]="userLocationVisible"
    [locationPermission]="locationPermission"
    [isRequestingLocation]="isRequestingLocation"
    [isLocationDisabled]="isLocationDisabled"
    [searchControl]="searchControl"
    [searchOpen]="searchOpen"
    [searchError]="searchError"
    (searchClick)="onSearchClick($event)"
    (addressSearchClick)="onAddressSearchClick($event)"
    (userLocationToggle)="onUserLocationToggle($event)"
    (layersClick)="onLayersClick($event)"
    (centerClick)="onCenterClick($event)"
    (clearClick)="onClearClick($event)"
    (fitClick)="onFitClick($event)"
  ></app-map-header>
`;

const meta: Meta<HeaderStoryArgs> = {
  title: 'Bus/Map/MapHeader',
  component: MapHeaderComponent,
  tags: ['autodocs'],
  decorators: [
    applicationConfig({
      providers: [provideRouter([], withDisabledInitialNavigation())],
    }),
  ],
  parameters: {
    layout: 'padded',
  },
  argTypes: {
    onSearchClick: { action: 'Pesquisar' },
    onAddressSearchClick: { action: 'Buscar endereço' },
    onUserLocationToggle: { action: 'Minha localização' },
    onLayersClick: { action: 'Camadas' },
    onCenterClick: { action: 'Centralizar' },
    onClearClick: { action: 'Limpar seleções' },
    onFitClick: { action: 'Enquadrar itens' },
    searchValue: { control: 'text' },
  },
  args: {
    ...outputArgs(),
    controls: 'all',
    hasSelections: false,
    hasFeatures: false,
    layersOpen: false,
    userLocationVisible: false,
    locationPermission: 'prompt',
    isRequestingLocation: false,
    isLocationDisabled: false,
    searchValue: '',
    searchOpen: false,
    searchError: '',
  },
  render: (args) => {
    return {
      props: {
        ...args,
        searchControl: new FormControl(args.searchValue, { nonNullable: true }),
      },
      template: headerTemplate,
    };
  },
};

export default meta;

async function openOptions(canvasElement: HTMLElement) {
  const canvas = within(canvasElement);
  await userEvent.click(canvas.getByRole('button', { name: 'Opções' }));
  return within(
    within(canvasElement.ownerDocument.body).getByRole('menu', {
      name: 'Opções do mapa',
    }),
  );
}

export const Default: Story = {
  args: {
    ...outputArgs(),
    hasSelections: false,
    hasFeatures: true,
    searchValue: '',
    controls: 'all',
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const searchInput = canvas.getByRole('searchbox', {
      name: 'Buscar linhas e paradas',
    });
    const searchButton = canvas.getByRole('button', {
      name: 'Pesquisar linhas e paradas',
    });
    expect(searchInput.getAttribute('aria-haspopup')).toBe('dialog');
    expect(searchInput.getAttribute('aria-expanded')).toBe('false');
    await userEvent.click(searchButton);
    expect(args.onSearchClick).toHaveBeenCalledTimes(1);
    await userEvent.type(searchInput, 'linha');
    expect(args.onSearchClick).toHaveBeenCalledTimes(6);

    const locationButton = canvas.getByRole('button', {
      name: 'Minha localização',
    });
    expect(locationButton.getAttribute('aria-pressed')).toBe('false');
    expect(locationButton.textContent?.trim()).toBe('my_location');
    expect(locationButton.querySelector('mat-icon')?.textContent?.trim()).toBe(
      'my_location',
    );
    await userEvent.click(locationButton);
    expect(args.onUserLocationToggle).toHaveBeenCalledTimes(1);

    for (const name of ['Camadas', 'Opções']) {
      expect(canvas.getByRole('button', { name })).toBeTruthy();
    }

    const menu = await openOptions(canvasElement);
    const addressSearch = menu.getByRole('menuitem', {
      name: 'Buscar endereço',
    });
    for (const removedLabel of [
      'Escolher no mapa',
      'Seleção manual',
      'Paradas próximas',
      'Próximos',
    ]) {
      expect(menu.queryByText(removedLabel)).toBeNull();
    }

    const fitButton = menu.getByRole('menuitem', {
      name: 'Enquadrar itens visíveis',
    }) as HTMLButtonElement;
    expect(fitButton.disabled).toBe(false);
    expect(
      menu.queryByRole('menuitem', { name: 'Limpar todas as seleções' }),
    ).toBeNull();
    await userEvent.click(addressSearch);
    expect(args.onAddressSearchClick).toHaveBeenCalledTimes(1);
  },
};

export const SearchOpen: Story = {
  args: {
    ...outputArgs(),
    searchValue: 'Linha 9',
    searchOpen: true,
    controls: 'primary',
  },
  play: async ({ canvasElement }) => {
    const searchField = canvasElement.querySelector<HTMLElement>('.search-field');
    if (!searchField) throw new Error('Search field not found');
    expect(getComputedStyle(searchField).visibility).toBe('hidden');
    expect(searchField.getBoundingClientRect().width).toBeGreaterThan(0);
  },
};

export const SearchError: Story = {
  args: {
    ...outputArgs(),
    searchError: 'Não foi possível pesquisar. Tente novamente.',
    controls: 'primary',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(
      canvas.getByText('Não foi possível pesquisar. Tente novamente.'),
    ).toBeTruthy();
    expect(
      canvas
        .getByRole('searchbox', { name: 'Buscar linhas e paradas' })
        .getAttribute('aria-invalid'),
    ).toBe('true');
  },
};

export const WithSelections: Story = {
  args: {
    ...outputArgs(),
    hasSelections: true,
    hasFeatures: true,
  },
  play: async ({ canvasElement, args }) => {
    const menu = await openOptions(canvasElement);
    const clearButton = menu.getByRole('menuitem', {
      name: 'Limpar todas as seleções',
    }) as HTMLButtonElement;
    expect(clearButton.disabled).toBe(false);
    await userEvent.click(clearButton);
    expect(args.onClearClick).toHaveBeenCalledTimes(1);
  },
};

export const UserLocationVisible: Story = {
  args: {
    ...outputArgs(),
    userLocationVisible: true,
    locationPermission: 'granted',
    controls: 'primary',
  },
  play: async ({ canvasElement }) => {
    const locationButton = within(canvasElement).getByRole('button', {
      name: 'Minha localização',
    });
    expect(locationButton.getAttribute('aria-pressed')).toBe('true');
    expect(locationButton.querySelector('mat-icon')?.textContent?.trim()).toBe(
      'my_location',
    );
  },
};

export const NoFeatures: Story = {
  args: {
    ...outputArgs(),
    hasSelections: false,
    hasFeatures: false,
  },
  play: async ({ canvasElement }) => {
    const menu = await openOptions(canvasElement);
    const fitButton = menu.getByRole('menuitem', {
      name: 'Enquadrar itens visíveis',
    }) as HTMLButtonElement;
    expect(fitButton.disabled).toBe(true);
  },
};

export const LocationDenied: Story = {
  args: {
    ...outputArgs(),
    locationPermission: 'denied',
    isLocationDisabled: true,
    controls: 'primary',
  },
  play: async ({ canvasElement }) => {
    const locationButton = within(canvasElement).getByRole('button', {
      name: 'Minha localização',
    }) as HTMLButtonElement;
    expect(locationButton.disabled).toBe(true);
    expect(locationButton.getAttribute('aria-description')).toContain(
      'Acesso à localização negado',
    );
  },
};

export const LocationRequesting: Story = {
  args: {
    ...outputArgs(),
    isRequestingLocation: true,
    controls: 'primary',
  },
  play: async ({ canvasElement }) => {
    const locationButton = within(canvasElement).getByRole('button', {
      name: 'Minha localização',
    }) as HTMLButtonElement;
    expect(locationButton.disabled).toBe(true);
    expect(locationButton.getAttribute('aria-busy')).toBe('true');
    expect(locationButton.getAttribute('aria-description')).toBe(
      'Obtendo sua localização.',
    );
  },
};

export const VisibleLocationWhileRequesting: Story = {
  args: {
    ...outputArgs(),
    userLocationVisible: true,
    locationPermission: 'granted',
    isRequestingLocation: true,
    controls: 'primary',
  },
  play: async ({ canvasElement, args }) => {
    const locationButton = within(canvasElement).getByRole('button', {
      name: 'Minha localização',
    }) as HTMLButtonElement;
    expect(locationButton.disabled).toBe(false);
    expect(locationButton.getAttribute('aria-pressed')).toBe('true');
    expect(locationButton.getAttribute('aria-busy')).toBe('true');

    await userEvent.click(locationButton);
    expect(args.onUserLocationToggle).toHaveBeenCalledTimes(1);
  },
};

export const PrimaryControls: Story = {
  args: {
    ...outputArgs(),
    controls: 'primary',
    hasFeatures: true,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(
      canvas.getByRole('searchbox', { name: 'Buscar linhas e paradas' }),
    ).toBeTruthy();
    expect(
      canvas.getByRole('button', { name: 'Pesquisar linhas e paradas' }),
    ).toBeTruthy();
    expect(canvas.getByRole('button', { name: 'Minha localização' })).toBeTruthy();
    expect(canvas.queryByRole('button', { name: 'Camadas' })).toBeNull();
    expect(canvas.queryByRole('button', { name: 'Opções' })).toBeNull();
  },
};

export const SecondaryControls: Story = {
  args: {
    ...outputArgs(),
    controls: 'secondary',
    hasFeatures: true,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.getByRole('button', { name: 'Camadas' })).toBeTruthy();
    expect(canvas.getByRole('button', { name: 'Opções' })).toBeTruthy();
    expect(
      canvas.queryByRole('searchbox', { name: 'Buscar linhas e paradas' }),
    ).toBeNull();
    expect(canvas.queryByRole('button', { name: 'Minha localização' })).toBeNull();

    const menu = await openOptions(canvasElement);
    expect(
      menu.getByRole('menuitem', { name: 'Enquadrar itens visíveis' }),
    ).toBeTruthy();
    expect(menu.getByRole('menuitem', { name: 'Buscar endereço' })).toBeTruthy();
  },
};

export const NarrowViewport: Story = {
  args: {
    ...outputArgs(),
    hasSelections: true,
    hasFeatures: true,
    controls: 'primary',
  },
  play: async ({ canvasElement }) => {
    const header = canvasElement.querySelector<HTMLElement>('app-map-header');
    if (!header) throw new Error('Map header not found');
    header.style.width = '288px';

    const controls = header.querySelector<HTMLElement>('.primary-actions');
    if (!controls) throw new Error('Primary controls not found');
    expect(controls.scrollWidth).toBeLessThanOrEqual(controls.clientWidth);
    expect(
      within(canvasElement).getByRole('searchbox', {
        name: 'Buscar linhas e paradas',
      }),
    ).toBeTruthy();
    expect(
      within(canvasElement).getByRole('button', { name: 'Minha localização' }),
    ).toBeTruthy();
  },
};
