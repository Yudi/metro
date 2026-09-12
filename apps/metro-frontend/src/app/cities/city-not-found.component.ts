import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { cityPath } from '@metro/shared/cities';

@Component({
  selector: 'app-city-not-found',
  imports: [RouterLink],
  template: `
    <main>
      <h1>Página não encontrada</h1>
      <p>Não encontramos uma cidade ou página com este endereço.</p>
      <a [routerLink]="homePath">Voltar ao início</a>
    </main>
  `,
  styles: `
    :host {
      display: block;
      padding: 2rem;
    }

    main {
      margin: 0 auto;
      max-width: 42rem;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CityNotFoundComponent {
  readonly homePath = cityPath();
}
