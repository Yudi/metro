import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-home',
  imports: [RouterLink],
  templateUrl: './home.html',
  styleUrl: './home.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Home {
  readonly links = [
    {
      label: 'Painel',
      route: '/sp/painel',
    },
    {
      label: 'Estado dos trens e dos metrôs',
      route: '/sp/estado',
    },
    {
      label: 'Próxima chegada',
      route: '/sp/proxima-chegada',
    },
    {
      label: 'Telefones úteis',
      route: '/sp/telefones',
    },
  ];
}
