import { Component, inject } from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { RouterLink } from '@angular/router';
import { AuthService } from '@metro/shared/firebase';
import { authReady } from '@metro/shared/firebase';
import { firebaseUser } from '@metro/shared/firebase';
import { SAO_PAULO_CITY_CENTER } from '@metro/shared/utils';

@Component({
  selector: 'app-menu.component',
  imports: [RouterLink, MatIcon, MatListModule],
  templateUrl: './menu.component.html',
  styleUrl: './menu.component.scss',
})
export class MenuComponent {
  public authService = inject(AuthService);
  public readonly authReady = authReady;

  public firebaseUser = firebaseUser;

  public readonly menuList: menuList = {
    Mapa: [
      {
        label: 'Metrô e trem',
        icon: 'train',
        route: '/mapa',
        queryParams: {
          subwayStations: '1',
          subwayRoutes: '1',
          bike: '0',
          lat: String(SAO_PAULO_CITY_CENTER.latitude),
          lon: String(SAO_PAULO_CITY_CENTER.longitude),
          z: '11',
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
    ],
  };

  // computed list of section keys so templates don’t rely on globals
  public get sections(): string[] {
    return Object.keys(this.menuList);
  }

  login() {
    this.authService.loginGoogle();
  }

  logout() {
    this.authService.logout();
  }
}

interface menuList {
  [section: string]: {
    label: string;
    route?: string;
    url?: string;
    queryParams?: { [key: string]: string };
    icon: string;
  }[];
}
