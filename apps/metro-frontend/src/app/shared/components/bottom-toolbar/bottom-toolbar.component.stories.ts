import { provideRouter } from '@angular/router';
import {
  Meta,
  StoryObj,
  applicationConfig,
  componentWrapperDecorator,
} from '@storybook/angular';
import { BottomToolbarComponent } from './bottom-toolbar.component';
import { ToolbarItem } from '../toolbar/toolbar.component';

type ItemPreset = 'principal' | 'mapa' | 'compacto';
type StoryArgs = BottomToolbarComponent & {
  itemPreset: ItemPreset;
  showQueryParams: boolean;
};

const baseItems: ToolbarItem[] = [
  {
    label: 'Estado das linhas',
    shortLabel: 'Estado',
    route: '',
    icon: 'railway_alert',
  },
  {
    label: 'Próxima chegada',
    shortLabel: 'Chegadas',
    route: '/proxima-chegada',
    icon: 'schedule',
  },
  {
    label: 'Painel',
    shortLabel: 'Painel',
    route: '/painel',
    icon: 'dashboard',
  },
  {
    label: 'Histórico de ocorrências',
    shortLabel: 'Histórico',
    route: '/historico/ocorrencias',
    icon: 'history',
  },
  {
    label: 'Menu',
    shortLabel: 'Menu',
    route: '/menu',
    icon: 'menu',
  },
];

const mapItem: ToolbarItem = {
  label: 'Mapa metropolitano',
  shortLabel: 'Mapa',
  route: '/mapa',
  icon: 'map',
  queryParams: {
    subwayStations: '1',
    subwayRoutes: '1',
    bike: '0',
    lat: '-23.55052',
    lon: '-46.633308',
    z: '11',
  },
};

function createItems(preset: ItemPreset, showQueryParams: boolean): ToolbarItem[] {
  const itemsByPreset: Record<ItemPreset, ToolbarItem[]> = {
    principal: baseItems,
    mapa: [baseItems[0], baseItems[1], mapItem, baseItems[2], baseItems[4]],
    compacto: [baseItems[0], mapItem, baseItems[4]],
  };

  return itemsByPreset[preset].map((item) => ({
    ...item,
    queryParams: showQueryParams ? item.queryParams : undefined,
  }));
}

const meta: Meta<StoryArgs> = {
  title: 'Shared/Navigation/Bottom toolbar',
  component: BottomToolbarComponent,
  tags: ['autodocs'],
  decorators: [
    applicationConfig({
      providers: [
        provideRouter([
          { path: '', component: BottomToolbarComponent },
          { path: '**', component: BottomToolbarComponent },
        ]),
      ],
    }),
    componentWrapperDecorator(
      (story) => `<div style="min-height: 160px">${story}</div>`,
    ),
  ],
  argTypes: {
    itemPreset: {
      control: 'select',
      options: ['principal', 'mapa', 'compacto'],
      description: 'Conjunto de atalhos exibidos na barra inferior.',
    },
    showQueryParams: {
      control: 'boolean',
      description: 'Mantém parâmetros de mapa nos links que os utilizam.',
    },
  },
  args: {
    itemPreset: 'principal',
    showQueryParams: true,
  },
  render: ({ itemPreset, showQueryParams }) => ({
    props: {
      items: createItems(itemPreset, showQueryParams),
    },
    template: '<app-bottom-toolbar [items]="items" />',
  }),
};

export default meta;
type Story = StoryObj<StoryArgs>;

export const Principal: Story = {};

export const ComMapa: Story = {
  args: {
    itemPreset: 'mapa',
  },
};

export const Compacta: Story = {
  args: {
    itemPreset: 'compacto',
    showQueryParams: false,
  },
};
