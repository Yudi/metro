import type { CityContextService } from '../cities/city-context.service';

export interface MenuDestination {
  label: string;
  icon: string;
  route?: string;
  url?: string;
  queryParams?: Record<string, string>;
  keywords?: string;
}

/** Edit menu links here; the omnibox searches the same destinations. */
export function menuDestinations(
  city: ReturnType<CityContextService['city']>,
): Record<string, MenuDestination[]> {
  return {
    Mapa: [
      {
        label: 'Metrô e trem',
        icon: 'train',
        route: '/mapa',
        queryParams: {
          subwayStations: '1',
          subwayRoutes: '1',
          bike: '0',
          lat: String(city.map.center.latitude),
          lon: String(city.map.center.longitude),
          z: String(city.map.zoom),
        },
      },
      {
        label: 'Bicicletas',
        icon: 'directions_bike',
        route: '/mapa',
        queryParams: {
          bike: '1',
          subwayStations: '0',
          subwayRoutes: '0',
          lat: '-23.571447',
          lon: '-46.676697',
          z: '14',
        },
      },
      {
        label: 'Circulares USP',
        icon: 'school',
        route: '/mapa',
        queryParams: {
          subwayStations: '1',
          subwayRoutes: '1',
          bike: '0',
          lat: '-23.56216',
          lon: '-46.72652',
          z: '15',
          busRoutes: '8082-10,8083-10,8084-10,8085-10,8012-10,8022-10',
        },
      },
    ],
    Configurações: [
      {
        label: 'Notificações',
        icon: 'notifications',
        route: '/notifications',
      },
      {
        label: 'Favoritos',
        icon: 'favorite',
        route: '/favoritos',
      },
    ],
    Histórico: [
      {
        label: 'Ocorrências',
        icon: 'history',
        route: '/historico/ocorrencias',
      },
      {
        label: 'Intervalos',
        icon: 'schedule',
        route: '/historico/intervalos',
      },
    ],
    null: [
      {
        label: 'Telefones úteis',
        icon: 'contact_phone',
        route: '/telefones',
      },
      {
        label: 'Sobre',
        icon: 'info',
        route: '/sobre',
      },
      {
        label: 'Mapa de criminalidade de São Paulo',
        icon: 'local_police',
        url: 'https://criminalidade.yudi.com.br',
      },
      {
        label: 'Política de privacidade',
        icon: 'privacy_tip',
        url: 'https://yudi.com.br/privacy-policy',
      },
      {
        label: 'Versão leve (lite)',
        icon: 'bolt',
        url: 'https://metro.yudi.com.br/lite/',
      },
    ],
  };
}

const PAGE_DESTINATIONS: MenuDestination[] = [
  {
    label: 'Estado das linhas',
    icon: 'railway_alert',
    route: '',
    keywords: 'inicio operacao metro trem status',
  },
  {
    label: 'Painel',
    icon: 'dashboard',
    route: '/painel',
    keywords: 'indicadores dados estatisticas',
  },
  {
    label: 'Próximos trens',
    icon: 'schedule',
    route: '/proximo-trem',
    keywords: 'chegadas horarios estacoes',
  },
  {
    label: 'Mapa',
    icon: 'map',
    route: '/mapa',
    keywords: 'onibus linhas pontos paradas itinerarios',
  },
  {
    label: 'Menu',
    icon: 'menu',
    route: '/menu',
    keywords: 'login conta entrar configuracoes',
  },
];

export function searchDestinations(
  city: ReturnType<CityContextService['city']>,
): MenuDestination[] {
  return [
    ...PAGE_DESTINATIONS,
    ...Object.values(menuDestinations(city)).flat(),
  ];
}

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .trim();
}

export function matchDestinations(
  query: string,
  destinations: MenuDestination[],
): MenuDestination[] {
  const normalized = normalize(query);
  if (!normalized) return [];
  const words = normalized.split(/\s+/);
  return destinations
    .map((item, index) => {
      const label = normalize(item.label);
      const searchable = normalize(
        `${item.label} ${item.route ?? ''} ${item.keywords ?? ''}`,
      );
      const rank =
        label === normalized ? 0 : label.startsWith(normalized) ? 1 : 2;
      return {
        item,
        index,
        rank,
        matches: words.every((word) => searchable.includes(word)),
      };
    })
    .filter((entry) => entry.matches)
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((entry) => entry.item);
}
