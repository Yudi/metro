import { applicationConfig } from '@storybook/angular';
import {
  provideHttpClient,
  withInterceptorsFromDi,
} from '@angular/common/http';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatIconRegistry } from '@angular/material/icon';
import { inject, provideEnvironmentInitializer } from '@angular/core';
import type { Preview } from '@storybook/angular';
import { setCompodocJson } from '@storybook/addon-docs/angular';

import docJson from './compodoc/documentation.json';
import { API_BASE_URL } from '@metro/shared/api';
import { environment } from '../src/environments/environment';

setCompodocJson(docJson);

const preview: Preview = {
  parameters: {
    actions: { argTypesRegex: '^on[A-Z].*' },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/,
      },
    },
  },
};

export const decorators = [
  applicationConfig({
    providers: [
      provideHttpClient(withInterceptorsFromDi()),
      provideHttpClient(),
      {
        provide: MatDialogRef,
        useValue: {
          // eslint-disable-next-line @typescript-eslint/no-empty-function
          close: () => {},
          // eslint-disable-next-line @typescript-eslint/no-empty-function
          afterClosed: () => ({ subscribe: () => {} }),
        },
      },
      {
        provide: MAT_DIALOG_DATA,
        useValue: {},
      },
      provideEnvironmentInitializer(() => {
        const registry = inject(MatIconRegistry);
        registry.setDefaultFontSetClass('material-symbols-outlined');
      }),
      { provide: API_BASE_URL, useValue: environment.apiUrl },
    ],
  }),
];

export default preview;
