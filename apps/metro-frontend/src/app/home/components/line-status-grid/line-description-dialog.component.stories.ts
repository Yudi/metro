import { Router } from '@angular/router';
import { Meta, StoryObj, applicationConfig } from '@storybook/angular';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { FavoritesService } from '@metro/shared/api';
import {
  AEROMOVEL_GRU_OPERATION,
  EXPRESSO_AEROPORTO_SCHEDULE,
  EXPRESSO_LINHA_10_SCHEDULE,
} from '@metro/shared/utils';

import {
  LineDescriptionDialogComponent,
  LineDescriptionDialogData,
} from './line-description-dialog.component';

const EXPRESSO_LINHA_10_SOURCE_URL =
  'https://www.cptm.sp.gov.br/dx/api/dam/v1/collections/05321fd9-3791-4689-a8ac-9e2adde39c4b/items/996297d1-45bf-4a2c-adb2-23cf38c61c9a/renditions/9bb7e05d-a547-40da-9b30-181dc8154c8d?binary=true';

function formatWholeHour(time: string): string {
  const [hour = time] = time.split(':');
  return hour === '00' ? '00h' : `${Number.parseInt(hour, 10)}h`;
}

const dialogRef = {
  close: (result?: unknown) => console.log('[story] dialog closed', result),
  afterClosed: () => ({ subscribe: () => undefined }),
};

const favoritesService = {
  isFavorite: () => false,
  addFavorite: (code: string) => console.log('[story] favorite added', code),
  removeFavorite: (code: string) =>
    console.log('[story] favorite removed', code),
};

function storyProviders(data: LineDescriptionDialogData) {
  return [
    applicationConfig({
      providers: [
        { provide: MAT_DIALOG_DATA, useValue: data },
        { provide: MatDialogRef, useValue: dialogRef },
        { provide: FavoritesService, useValue: favoritesService },
        {
          provide: Router,
          useValue: {
            navigate: (commands: unknown[], extras?: unknown) => {
              console.log('[story] navigate', commands, extras);
              return Promise.resolve(true);
            },
          },
        },
      ],
    }),
  ];
}

const meta: Meta<LineDescriptionDialogComponent> = {
  title: 'Home/LineDescriptionDialog',
  component: LineDescriptionDialogComponent,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<LineDescriptionDialogComponent>;

export const ExpressoLinha10: Story = {
  decorators: storyProviders({
    title: '10X - Expresso Linha 10',
    description: 'Dias úteis, nos picos da manhã e da tarde.',
    scheduleSections: [
      {
        title: 'Santo André → Tamanduateí',
        description:
          'Ida com parada em São Caetano; retorno de Tamanduateí para Santo André.',
        times: EXPRESSO_LINHA_10_SCHEDULE.departures.santoAndre,
      },
      {
        title: 'Tamanduateí → Santo André',
        description:
          'Ida com parada em São Caetano; retorno de Santo André para Tamanduateí.',
        times: EXPRESSO_LINHA_10_SCHEDULE.departures.tamanduatei,
      },
    ],
    note: 'Horários programados sujeitos às condições operacionais.',
    link: {
      label: 'Fonte: CPTM',
      url: EXPRESSO_LINHA_10_SOURCE_URL,
    },
    specialLineCode: '10X',
  }),
};

export const ExpressoAeroporto: Story = {
  decorators: storyProviders({
    title: 'EA - Expresso Aeroporto',
    description: `De segunda a sábado, partidas a cada ${EXPRESSO_AEROPORTO_SCHEDULE.weekdayIntervalMinutes} minutos, das 5h às 00h. Aos domingos, a cada ${EXPRESSO_AEROPORTO_SCHEDULE.sundayIntervalMinutes} minutos no mesmo período.`,
    details: [
      'As partidas seguem o horário programado e podem variar conforme condições operacionais.',
    ],
    link: {
      label: 'Ver página da CPTM',
      url: 'https://www.cptm.sp.gov.br/cptm/sua-viagem/transferencias-e-intervalos',
    },
    specialLineCode: 'EA',
  }),
};

export const AeromovelGru: Story = {
  decorators: storyProviders({
    title: 'GRU - Aeromóvel GRU',
    details: [
      `Todos os dias, das ${formatWholeHour(AEROMOVEL_GRU_OPERATION.openFrom)} às ${formatWholeHour(AEROMOVEL_GRU_OPERATION.openUntil)}, com intervalo teórico de 6 minutos.`,
      'Você também pode optar por translado por ônibus das 04h às 00h.',
    ],
    link: {
      label: 'Traslado interno GRU',
      url: 'https://www.gru.com.br/pt/passageiro/como-chegar-sair/traslado-interno/',
    },
  }),
};

export const ExpressoLinha10ComAlteracao: Story = {
  decorators: storyProviders({
    title: '10X - Expresso Linha 10',
    description: 'Dias úteis, nos picos da manhã e da tarde.',
    scheduleSections: [
      {
        title: 'Santo André → Tamanduateí',
        description:
          'Ida com parada em São Caetano; retorno de Tamanduateí para Santo André.',
        times: EXPRESSO_LINHA_10_SCHEDULE.departures.santoAndre,
      },
      {
        title: 'Tamanduateí → Santo André',
        description:
          'Ida com parada em São Caetano; retorno de Santo André para Tamanduateí.',
        times: EXPRESSO_LINHA_10_SCHEDULE.departures.tamanduatei,
      },
    ],
    issues: [
      {
        code: 10,
        line: 'Linha 10 - Turquesa',
        description: 'Operação parcial no trecho expresso.',
      },
    ],
    note: 'Horários programados sujeitos às condições operacionais.',
    link: {
      label: 'Fonte: CPTM',
      url: EXPRESSO_LINHA_10_SOURCE_URL,
    },
    specialLineCode: '10X',
  }),
};
