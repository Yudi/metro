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
  {
    id: 'route-847p',
    routeId: '847P-10',
    shortName: '847P-10',
    longName: 'Term. Pirituba - Vl. Olímpia',
    routeType: 3,
    color: '006341',
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
      {
        c: '847P-10',
        cl: 33191,
        sl: 2,
        lt0: 'VL. OLÍMPIA',
        lt1: 'TERM. PIRITUBA',
        qv: 1,
        vs: [
          {
            p: 11879,
            a: true,
            ta: new Date().toISOString(),
            py: -23.5542,
            px: -46.6913,
            t: '14:40',
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
  {
    routeId: '847P-10',
    routeShortName: '847P-10',
    routeLongName: 'Term. Pirituba - Vl. Olímpia',
    directions: [
      {
        directionId: 0,
        headsign: 'Vl. Olímpia',
        stations: [],
      },
      {
        directionId: 1,
        headsign: 'Term. Pirituba',
        stations: [
          {
            id: 'vila-madalena-l2',
            name: 'Vila Madalena',
            agencies: ['Metrô'],
            lines: ['Verde'],
            distanceMeters: 131,
            nearStopId: '6311025',
            nearStopName: 'R. Cristovão de Burgos, 54',
            stopSequence: 26,
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
        cp: 701441,
        np: stop.name,
        py: stop.latitude,
        px: stop.longitude,
        l: [],
      },
    },
  },
};

export const NoPredictionPayload: Story = {
  args: {
    arrivals: {
      ...arrivals,
      p: null,
    },
  },
};
