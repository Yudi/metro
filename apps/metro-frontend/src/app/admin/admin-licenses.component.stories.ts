import { applicationConfig, Meta, StoryObj } from '@storybook/angular';
import { signal } from '@angular/core';
import { NEVER, of, throwError } from 'rxjs';
import { COPYRIGHT_FIXTURE } from '@metro/shared/admin-contracts';
import { AdminApiService } from './admin-api.service';
import { AdminLicensesComponent } from './admin-licenses.component';

const meta: Meta<AdminLicensesComponent> = {
  title: 'Administração/Licenças',
  component: AdminLicensesComponent,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
};

export default meta;
type Story = StoryObj<AdminLicensesComponent>;

function apiFor(listCopyrights: () => ReturnType<AdminApiService['listCopyrights']>) {
  return applicationConfig({
    providers: [
      {
        provide: AdminApiService,
        useValue: {
          listCopyrights,
          createCopyright: (input: { license: string; licenseUrl?: string }) =>
            of({ id: 'created-license', ...input }),
          updateCopyright: (id: string, input: { license: string; licenseUrl?: string }) =>
            of({ id, ...input }),
          deleteCopyright: () => of(true),
          sessionRevision: signal(0),
        },
      },
    ],
  });
}

export const LicencasCadastradas: Story = {
  decorators: [apiFor(() => of([COPYRIGHT_FIXTURE]))],
};

export const NenhumaLicenca: Story = {
  decorators: [apiFor(() => of([]))],
};

export const FalhaAoCarregar: Story = {
  decorators: [apiFor(() => throwError(() => new Error('Falha de rede')))],
};

export const Carregando: Story = {
  decorators: [apiFor(() => NEVER)],
};
