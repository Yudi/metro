import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { applicationConfig, Meta, StoryObj } from '@storybook/angular';
import {
  authReady,
  firebaseIdToken,
  firebaseUser,
} from '@metro/shared/firebase';
import { ADMIN_ACCOUNT_FIXTURE } from '@metro/shared/admin-contracts';
import { AdminApiService } from './admin-api.service';
import { AdminOverviewComponent } from './admin-overview.component';
import { AdminShellComponent } from './admin-shell.component';

const meta: Meta<AdminShellComponent> = {
  title: 'Administração/Navegação',
  component: AdminShellComponent,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
  beforeEach: () => {
    const previous = {
      ready: authReady(),
      user: firebaseUser(),
      token: firebaseIdToken(),
    };
    authReady.set(true);
    firebaseUser.set({ uid: ADMIN_ACCOUNT_FIXTURE.uid } as never);
    firebaseIdToken.set('header.eyJhZG1pbiI6dHJ1ZX0.signature');
    return () => {
      authReady.set(previous.ready);
      firebaseUser.set(previous.user);
      firebaseIdToken.set(previous.token);
    };
  },
  decorators: [
    applicationConfig({
      providers: [
        provideRouter([{ path: '', component: AdminOverviewComponent }]),
        {
          provide: AdminApiService,
          useValue: { sessionRevision: signal(0), clearSessionData: () => undefined },
        },
      ],
    }),
  ],
};

export default meta;
type Story = StoryObj<AdminShellComponent>;

export const MenuAdministrativo: Story = {
  render: () => ({ props: {} }),
};
