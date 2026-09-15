import { signal } from '@angular/core';
import { applicationConfig, Meta, StoryObj } from '@storybook/angular';
import { FavoritesService } from '@metro/shared/api';
import { AnonymousFavoritesImportDialogComponent } from './anonymous-favorites-import-dialog.component';

const meta: Meta<AnonymousFavoritesImportDialogComponent> = {
  title: 'Favorites/AnonymousImportDialog',
  component: AnonymousFavoritesImportDialogComponent,
  tags: ['autodocs'],
  decorators: [
    applicationConfig({
      providers: [
        {
          provide: FavoritesService,
          useValue: {
            anonymousFavoritesImportCount: signal(2),
            importAnonymousFavorites: async () => undefined,
            discardAnonymousFavorites: async () => undefined,
          },
        },
      ],
    }),
  ],
};
export default meta;
type Story = StoryObj<AnonymousFavoritesImportDialogComponent>;

export const Default: Story = {};
export const SingleFavorite: Story = {
  render: () => ({ props: { count: signal(1) } }),
};
export const Saving: Story = {
  render: () => ({ props: { pending: signal(true) } }),
};
export const StorageError: Story = {
  render: () => ({
    props: {
      error: signal('Não foi possível salvar sua escolha. Tente novamente.'),
    },
  }),
};
