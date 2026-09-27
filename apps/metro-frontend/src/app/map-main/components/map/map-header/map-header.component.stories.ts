import { provideRouter } from '@angular/router';
import {
  applicationConfig,
  Meta,
  StoryObj,
} from '@storybook/angular';
import { userEvent, within } from 'storybook/test';
import { MapHeaderComponent } from './map-header.component';

const meta: Meta<MapHeaderComponent> = {
  title: 'Bus/Map/MapHeader',
  component: MapHeaderComponent,
  tags: ['autodocs'],
  decorators: [
    applicationConfig({
      providers: [provideRouter([])],
    }),
  ],
  parameters: {
    layout: 'padded',
  },
};

export default meta;

type Story = StoryObj<MapHeaderComponent>;

async function openOptions(canvasElement: HTMLElement) {
  const canvas = within(canvasElement);
  await userEvent.click(canvas.getByRole('button', { name: /^Opções(?:;|$)/ }));
  return within(
    within(canvasElement.ownerDocument.body).getByRole('menu', {
      name: 'Opções do mapa',
    }),
  );
}

export const Default: Story = {
  args: {
    displayMode: 'selected',
    hasSelections: false,
    hasFeatures: true,
    controls: 'all',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    for (const name of [
      'Pesquisar no mapa',
      'Perto de mim',
      'Camadas',
      'Opções',
    ]) {
      if (!canvas.getByRole('button', { name })) {
        throw new Error(`${name} control not found`);
      }
    }

    const menu = await openOptions(canvasElement);
    const fitButton = menu.getByRole('menuitem', {
      name: 'Enquadrar itens visíveis',
    }) as HTMLButtonElement;
    if (fitButton.disabled) throw new Error('Fit action should be enabled');
    if (menu.queryByRole('menuitem', { name: 'Limpar todas as seleções' })) {
      throw new Error('Clear action should not appear without selections');
    }
  },
};

export const WithSelections: Story = {
  args: {
    displayMode: 'selected',
    hasSelections: true,
    hasFeatures: true,
  },
  play: async ({ canvasElement }) => {
    const menu = await openOptions(canvasElement);
    const clearButton = menu.getByRole('menuitem', {
      name: 'Limpar todas as seleções',
    }) as HTMLButtonElement;
    if (clearButton.disabled) throw new Error('Clear action should be enabled');
    await userEvent.click(clearButton);
  },
};

export const NearbyMode: Story = {
  args: {
    displayMode: 'nearby',
    hasSelections: false,
    hasFeatures: true,
    locationPermission: 'granted',
    controls: 'all',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const optionsButton = canvas.getByRole('button', {
      name: 'Opções; modo Próximos ativo',
    });
    if (!optionsButton.textContent?.includes('Próximos')) {
      throw new Error('Nearby mode should be visible on the options button');
    }
    const nearbyButton = canvas.getByRole('button', { name: 'Perto de mim' });
    if (nearbyButton.getAttribute('aria-pressed') !== 'true') {
      throw new Error('Nearby action should expose its active state');
    }

    const menu = await openOptions(canvasElement);
    const nearbyOption = menu.getByRole('menuitemradio', {
      name: 'Paradas próximas',
    });
    if (nearbyOption.getAttribute('aria-checked') !== 'true') {
      throw new Error('Nearby mode should be marked active');
    }
  },
};

export const NoFeatures: Story = {
  args: {
    displayMode: 'selected',
    hasSelections: false,
    hasFeatures: false,
  },
  play: async ({ canvasElement }) => {
    const menu = await openOptions(canvasElement);
    const fitButton = menu.getByRole('menuitem', {
      name: 'Enquadrar itens visíveis',
    }) as HTMLButtonElement;
    if (!fitButton.disabled) {
      throw new Error('Fit action should be disabled without map features');
    }
  },
};

export const LocationDenied: Story = {
  args: {
    displayMode: 'selected',
    hasFeatures: true,
    locationPermission: 'denied',
    isLocationDisabled: true,
    controls: 'primary',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const locationButton = canvas.getByRole('button', {
      name: 'Perto de mim',
    }) as HTMLButtonElement;
    if (!locationButton.disabled) {
      throw new Error('Location action should be disabled after denial');
    }
    if (
      !locationButton
        .getAttribute('aria-description')
        ?.includes('Acesso à localização negado')
    ) {
      throw new Error('Location action should explain the denied permission');
    }
  },
};

export const LocationRequesting: Story = {
  args: {
    displayMode: 'selected',
    hasFeatures: true,
    locationPermission: 'prompt',
    isRequestingLocation: true,
    controls: 'primary',
  },
  play: async ({ canvasElement }) => {
    const locationButton = within(canvasElement).getByRole('button', {
      name: 'Perto de mim',
    }) as HTMLButtonElement;
    if (!locationButton.disabled) {
      throw new Error('Location action should be disabled while requesting');
    }
    if (locationButton.getAttribute('aria-busy') !== 'true') {
      throw new Error('Location action should expose its loading state');
    }
    if (
      locationButton.getAttribute('aria-description') !==
      'Obtendo sua localização.'
    ) {
      throw new Error('Location action should describe its loading state');
    }
  },
};

export const PrimaryControls: Story = {
  args: {
    controls: 'primary',
    displayMode: 'selected',
    hasFeatures: true,
    locationPermission: 'granted',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    for (const name of ['Pesquisar no mapa', 'Perto de mim']) {
      if (!canvas.getByRole('button', { name })) {
        throw new Error(`${name} control not found in the primary group`);
      }
    }
    if (canvas.queryByRole('button', { name: 'Camadas' })) {
      throw new Error('Layers should not appear in the primary group');
    }
    if (canvas.queryByRole('button', { name: 'Opções' })) {
      throw new Error('Options should not appear in the primary group');
    }
  },
};

export const SecondaryControls: Story = {
  args: {
    controls: 'secondary',
    displayMode: 'selected',
    hasFeatures: true,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    if (!canvas.getByRole('button', { name: 'Camadas' })) {
      throw new Error('Layers control not found in the secondary group');
    }
    if (!canvas.getByRole('button', { name: 'Opções' })) {
      throw new Error('Options control not found in the secondary group');
    }
    if (canvas.queryByRole('button', { name: 'Pesquisar no mapa' })) {
      throw new Error('Search should not appear in the secondary group');
    }
    if (canvas.queryByRole('button', { name: 'Perto de mim' })) {
      throw new Error('Nearby should not appear in the secondary group');
    }

    const menu = await openOptions(canvasElement);
    if (!menu.getByRole('menuitem', { name: 'Enquadrar itens visíveis' })) {
      throw new Error('Options menu should remain available in secondary mode');
    }
  },
};

export const NarrowViewport: Story = {
  args: {
    displayMode: 'selected',
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
    if (controls.scrollWidth > controls.clientWidth) {
      throw new Error('Primary controls should fit a 288px content width');
    }
    for (const name of ['Pesquisar no mapa', 'Perto de mim']) {
      if (!within(canvasElement).getByRole('button', { name })) {
        throw new Error(`${name} control not found at narrow width`);
      }
    }
  },
};
