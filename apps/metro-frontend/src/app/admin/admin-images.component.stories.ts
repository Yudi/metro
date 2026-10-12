import { applicationConfig, Meta, StoryObj } from '@storybook/angular';
import { signal } from '@angular/core';
import { userEvent, within } from 'storybook/test';
import { provideRouter } from '@angular/router';
import { API_BASE_URL } from '@metro/shared/api';
import { ADMIN_IMAGE_PREVIEW_URL } from './admin-image-preview';
import {
  COPYRIGHT_FIXTURE,
  IMAGE_ENTRY_FIXTURE,
  MEDIA_STOP_FIXTURE,
  MEDIA_STATION_FIXTURE,
  MEDIA_TERMINAL_FIXTURE,
} from '@metro/shared/admin-contracts';
import { NEVER, of, throwError } from 'rxjs';
import { AdminApiService } from './admin-api.service';
import { AdminImagesComponent } from './admin-images.component';

const meta: Meta<AdminImagesComponent> = {
  title: 'Administração/Imagens',
  component: AdminImagesComponent,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
};

export default meta;
type Story = StoryObj<AdminImagesComponent>;

function apiFor(
  options: {
    searchError?: boolean;
    searchLoading?: boolean;
    emptySearch?: boolean;
    emptyImages?: boolean;
    trainFallback?: boolean;
  } = {},
) {
  return applicationConfig({
    providers: [
      provideRouter([]),
      { provide: API_BASE_URL, useValue: '/api' },
      {
        provide: ADMIN_IMAGE_PREVIEW_URL,
        useValue: 'https://placehold.co/640x360?text=Estacao+Luz',
      },
      {
        provide: AdminApiService,
        useValue: {
          searchMediaResources: () =>
            options.searchLoading
              ? NEVER
              : options.searchError
                ? throwError(() => new Error('Falha de rede'))
                : of(
                    options.emptySearch
                      ? []
                      : [
                          MEDIA_STATION_FIXTURE,
                          MEDIA_STOP_FIXTURE,
                          MEDIA_TERMINAL_FIXTURE,
                        ],
                  ),
          listImages: (identity: string) =>
            options.emptyImages || identity !== MEDIA_STATION_FIXTURE.identity
              ? of([])
              : of([
                  options.trainFallback
                    ? {
                        ...IMAGE_ENTRY_FIXTURE,
                        isDefault: false,
                        lineIds: [],
                        service: 'train' as const,
                      }
                    : IMAGE_ENTRY_FIXTURE,
                ]),
          listCopyrights: () => of([COPYRIGHT_FIXTURE]),
          uploadImage: () => of(IMAGE_ENTRY_FIXTURE),
          updateImage: () => of(IMAGE_ENTRY_FIXTURE),
          deleteImage: () => of(true),
          sessionRevision: signal(0),
        },
      },
    ],
  });
}

async function chooseStation(canvasElement: HTMLElement): Promise<void> {
  const canvas = within(canvasElement);
  await userEvent.click(await canvas.findByRole('button', { name: /Luz/ }));
  await canvas.findByText(IMAGE_ENTRY_FIXTURE.title);
}

export const BuscaDeLocais: Story = {
  decorators: [apiFor()],
};

export const Buscando: Story = {
  decorators: [apiFor({ searchLoading: true })],
};

export const NenhumLocalEncontrado: Story = {
  decorators: [apiFor({ emptySearch: true })],
};

export const EstacaoComImagem: Story = {
  decorators: [apiFor()],
  play: async ({ canvasElement }) => chooseStation(canvasElement),
};

export const EditarFallbackDeTrem: Story = {
  decorators: [apiFor({ trainFallback: true })],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('button', { name: /Luz/ }));
    await canvas.findByText(IMAGE_ENTRY_FIXTURE.title);
    await userEvent.click(
      await canvas.findByRole('button', { name: /Editar/ }),
    );
    const fallback = await canvas.findByRole('checkbox', {
      name: /Imagem de trens urbanos (não-metrô)/,
    });
    if (fallback.getAttribute('aria-checked') !== 'true') {
      throw new Error(
        'The train fallback should remain selected when editing.',
      );
    }
  },
};

export const LocalSemImagens: Story = {
  decorators: [apiFor({ emptyImages: true })],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('button', { name: /Luz/ }));
    await canvas.findByText('Sem imagens');
  },
};

export const FormatosDeUpload: Story = {
  decorators: [apiFor()],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('button', { name: /Luz/ }));
    await userEvent.click(
      await canvas.findByRole('button', { name: 'Nova imagem' }),
    );
    await canvas.findByLabelText('Arquivo da imagem (até 10 MiB)');
    await canvas.findByText(
      /Formatos aceitos: JPEG, PNG, WebP, AVIF, HEIC e HEIF/,
    );
  },
};

export const FalhaNaBusca: Story = {
  decorators: [apiFor({ searchError: true })],
};

export const TerminalESelecaoPadrao: Story = {
  decorators: [apiFor({ emptyImages: true })],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByRole('button', { name: /Terminal Central/ }),
    );
    await userEvent.click(
      await canvas.findByRole('button', { name: /Enviar imagem/ }),
    );
    await canvas.findByText(/Usada quando não houver imagem específica/);
  },
};
