import type { Meta, StoryObj } from '@storybook/angular';
import { LiteBusStopDetail } from './lite-bus-stop-detail';
import {
  LiteBusRoute,
  LiteRouteRailConnection,
  LiteSearchStop,
} from '../../../services/lite-search.service';
import { LiteStopArrivalUpdate } from '../../../services/lite-realtime.service';

const routes: LiteBusRoute[] = [
  {
    id: 'route-477a',
    routeId: '477A-10',
    shortName: '477A-10',
    longName: 'Sacoma - Terminal Pinheiros',
    routeType: 3,
    color: '2563eb',
    textColor: 'ffffff',
  },
  {
    id: 'route-875a',
    routeId: '875A-10',
    shortName: '875A-10',
    longName: 'Aeroporto - Perdizes',
    routeType: 3,
    color: '16a34a',
    textColor: 'ffffff',
  },
];

const stop: LiteSearchStop = {
  id: 'stop-701441',
  kind: 'busStop',
  stopId: '701441',
  name: 'Parada Cardeal Arcoverde',
  isSubway: false,
  lineCodes: [],
  latitude: -23.5678,
  longitude: -46.6934,
  routes,
};

const arrivals: LiteStopArrivalUpdate = {
  stopCode: stop.stopId,
  hr: '14:32',
  cacheTimestamp: Date.now(),
  p: {
    cp: 701441,
    np: stop.name,
    py: stop.latitude,
    px: stop.longitude,
    l: [
      {
        c: '477A-10',
        cl: 477,
        sl: 1,
        lt0: 'Terminal Pinheiros',
        lt1: 'Sacoma',
        qv: 2,
        vs: [
          {
            p: 42131,
            a: true,
            ta: new Date().toISOString(),
            py: -23.56,
            px: -46.68,
            t: '14:36',
          },
          {
            p: 42182,
            a: false,
            ta: new Date().toISOString(),
            py: -23.55,
            px: -46.67,
            t: '14:44',
          },
        ],
      },
    ],
  },
};

const railConnections: LiteRouteRailConnection[] = [
  {
    routeId: '477A-10',
    routeShortName: '477A-10',
    routeLongName: 'Sacoma - Terminal Pinheiros',
    directions: [
      {
        directionId: 0,
        headsign: 'Terminal Pinheiros',
        stations: [
          {
            id: 'pinheiros-l4',
            name: 'Pinheiros',
            agencies: ['ViaQuatro'],
            lines: ['Linha 4 - Amarela', 'Linha 9 - Esmeralda'],
            distanceMeters: 70,
            nearStopId: '701441',
            nearStopName: 'Parada Cardeal Arcoverde',
            stopSequence: 4,
          },
        ],
      },
    ],
  },
];

const meta: Meta<LiteBusStopDetail> = {
  title: 'Lite/Search/Bus stop detail',
  component: LiteBusStopDetail,
  tags: ['autodocs'],
  argTypes: {
    connected: { control: 'boolean' },
    railConnectionsLoading: { control: 'boolean' },
    railConnectionsError: { control: 'boolean' },
  },
  args: {
    stop,
    arrivals,
    connected: true,
    railConnections,
    railConnectionsLoading: false,
    railConnectionsError: false,
  },
};

export default meta;
type Story = StoryObj<LiteBusStopDetail>;

export const WithArrivals: Story = {};

export const Loading: Story = {
  args: {
    arrivals: undefined,
    connected: false,
    railConnectionsLoading: true,
  },
};

export const NoArrivals: Story = {
  args: {
    arrivals: {
      ...arrivals,
      p: {
        ...arrivals.p,
        l: [],
      },
    },
  },
};
