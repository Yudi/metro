import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { normalizeHexColor } from '@metro/shared/utils';
import { HistoryRouteIdentityComponent } from '../../../shared/history/history-transit-identity.component';

export interface BusVehicleDetails {
  routeShortName: string;
  destination?: string;
  origin?: string;
  isCircular: boolean;
  routeColor?: string;
  routeTextColor?: string;
  accessible?: boolean;
  recordedAt?: string;
}

@Component({
  selector: 'app-bus-vehicle-details',
  imports: [HistoryRouteIdentityComponent, MatIconModule, MatListModule],
  template: `
    <div
      class="route-identity"
      role="group"
      [attr.aria-label]="details().routeShortName ? 'Linha ' + details().routeShortName : 'Linha e destino'"
    >
      @if (details().routeShortName; as route) {
        <app-history-route-identity
          [name]="route"
          [backgroundColor]="routeColor()"
          [textColor]="routeTextColor()"
        />
      } @else {
        <span>Linha não informada</span>
      }
      <span class="destination">
        @if (details().isCircular) {
          Circular
        } @else if (details().destination; as destination) {
          Sentido {{ destination }}
        } @else {
          Destino não informado
        }
      </span>
    </div>
    <mat-list aria-label="Informações do ônibus">
      @if (details().origin; as origin) {
        <mat-list-item lines="3">
          <mat-icon matListItemIcon aria-hidden="true">trip_origin</mat-icon>
          <span matListItemTitle>Origem</span>
          <span matListItemLine>{{ origin }}</span>
        </mat-list-item>
      }
      <mat-list-item>
        <mat-icon matListItemIcon aria-hidden="true">accessible</mat-icon>
        <span matListItemTitle>Acessibilidade</span>
        <span matListItemLine>{{ accessibilityLabel() }}</span>
      </mat-list-item>
      <mat-list-item lines="3">
        <mat-icon matListItemIcon aria-hidden="true">update</mat-icon>
        <span matListItemTitle>Última atualização da posição</span>
        <span matListItemLine>
          @if (recordedAt(); as time) {
            <time [attr.datetime]="time.iso">{{ time.label }}</time>
          } @else {
            Não informada
          }
        </span>
      </mat-list-item>
    </mat-list>
  `,
  styles: `
    :host { display: block; }
    .route-identity { display: flex; align-items: flex-start; gap: 8px; }
    .destination { min-width: 0; overflow-wrap: anywhere; }
    mat-list-item [matListItemTitle],
    mat-list-item [matListItemLine] { white-space: normal; overflow-wrap: anywhere; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BusVehicleDetailsComponent {
  private readonly panelData = inject<BusVehicleDetails | null>(
    MAT_DIALOG_DATA,
    { optional: true },
  );
  readonly data = input<BusVehicleDetails>();
  readonly details = computed(() => this.data() ?? this.panelData ?? {
    routeShortName: '',
    isCircular: false,
  });
  readonly routeColor = computed(() =>
    normalizeHexColor(this.details().routeColor, '1976d2'),
  );
  readonly routeTextColor = computed(() =>
    normalizeHexColor(this.details().routeTextColor, 'ffffff'),
  );
  readonly accessibilityLabel = computed(() => {
    const accessible = this.details().accessible;
    if (accessible === true) return 'Veículo acessível';
    if (accessible === false) return 'Veículo não acessível';
    return 'Não informada';
  });
  readonly recordedAt = computed(() => {
    const value = this.details().recordedAt;
    if (!value) return null;
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return null;
    return {
      iso: date.toISOString(),
      label: new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        dateStyle: 'short',
        timeStyle: 'medium',
      }).format(date),
    };
  });
}
