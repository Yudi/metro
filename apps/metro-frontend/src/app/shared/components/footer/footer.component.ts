import { Component } from '@angular/core';
import { MatToolbarModule } from '@angular/material/toolbar';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-footer',
  imports: [MatToolbarModule, RouterLink],
  templateUrl: './footer.component.html',
  styleUrl: './footer.component.scss',
})
export class FooterComponent {
  footerLinks = footerLinks;
}

export const footerLinks = [
  { name: 'Sobre', link: '/sobre', external: false },
  {
    name: 'Mapa de criminalidade de São Paulo',
    link: 'https://criminalidade.yudi.com.br',
    external: true,
  },
  {
    name: 'Política de privacidade',
    link: 'https://yudi.com.br/privacy-policy',
    external: true,
  },
];
