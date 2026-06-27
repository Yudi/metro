import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-home',
  imports: [RouterLink],
  templateUrl: './home.html',
  styleUrl: './home.scss',
})
export class Home {
  links = [
    {
      name: 'São Paulo',
      prefix: 'sp',
      routes: [
        {
          label: 'Painel',
          route: 'painel',
        },
        {
          label: 'Estado dos trens e dos metrôs',
          route: 'estado',
        },
        {
          label: 'Próxima chegada',
          route: 'proxima-chegada',
        },
        {
          label: 'Telefones úteis',
          route: 'telefones',
        },
      ],
    },
  ];
}
