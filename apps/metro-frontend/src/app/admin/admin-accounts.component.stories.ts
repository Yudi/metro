import { applicationConfig, Meta, StoryObj } from '@storybook/angular';
import { signal } from '@angular/core';
import { of, throwError, NEVER } from 'rxjs';
import type { AdminAccount } from '@metro/shared/admin-contracts';
import {
  ADMIN_ACCOUNT_FIXTURE,
  REGULAR_ACCOUNT_FIXTURE,
} from '@metro/shared/admin-contracts';
import { firebaseUser } from '@metro/shared/firebase';
import { AdminApiService } from './admin-api.service';
import { AdminAccountsComponent } from './admin-accounts.component';

const meta: Meta<AdminAccountsComponent> = {
  title: 'Administração/Administradores',
  component: AdminAccountsComponent,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
  beforeEach: () => {
    const previousUser = firebaseUser();
    firebaseUser.set({ uid: ADMIN_ACCOUNT_FIXTURE.uid } as never);
    return () => firebaseUser.set(previousUser);
  },
};

export default meta;
type Story = StoryObj<AdminAccountsComponent>;

function apiFor(listAdmins: () => ReturnType<AdminApiService['listAdmins']>) {
  return applicationConfig({
    providers: [
      {
        provide: AdminApiService,
        useValue: {
          listAdmins,
          addAdmin: (email: string) =>
            of({
              uid: 'new-editor',
              email,
              displayName: null,
              bootstrap: false,
            } satisfies AdminAccount),
          deleteAdmin: () => of(true),
          sessionRevision: signal(0),
        },
      },
    ],
  });
}

function renderAsAdministrator() {
  return () => ({ props: {} });
}

export const ContasCadastradas: Story = {
  decorators: [
    apiFor(() => of([ADMIN_ACCOUNT_FIXTURE, REGULAR_ACCOUNT_FIXTURE])),
  ],
  render: renderAsAdministrator(),
};

export const NenhumaConta: Story = {
  decorators: [apiFor(() => of([]))],
  render: renderAsAdministrator(),
};

export const FalhaAoCarregar: Story = {
  decorators: [apiFor(() => throwError(() => new Error('Falha de rede')))],
  render: renderAsAdministrator(),
};

export const Carregando: Story = {
  decorators: [apiFor(() => NEVER)],
  render: renderAsAdministrator(),
};
