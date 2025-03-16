import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { LineStatusService } from './shared/services/line-status.service';
import { LineStatusComponent } from './shared/components/line-status/line-status.component';
import { Line9Component } from './shared/components/train-tracking/line-9/line-9.component';

@Component({
  selector: 'app-root',
  imports: [LineStatusComponent, Line9Component],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent {
  lineStatusService = inject(LineStatusService);
  lineStatus = toSignal(this.lineStatusService.requestStatus());

  stopsL8 = [
    {
      code: 'JPR',
      name: 'Júlio Prestes',
    },
    {
      code: 'BFU',
      name: 'Palmeiras–Barra Funda',
    },
    {
      code: 'LAP',
      name: 'Lapa',
    },
    {
      code: 'DMO',
      name: 'Domingos de Moraes',
    },
    {
      code: 'ILE',
      name: 'Imperatriz Leopoldina',
    },
    {
      code: 'PAL',
      name: 'Presidente Altino',
    },
    {
      code: 'OSA',
      name: 'Osasco',
    },
    {
      code: 'CSA',
      name: 'Comandante Sampaio',
    },
    {
      code: 'QTU',
      name: 'Quitaúna',
    },
    {
      code: 'GMC',
      name: 'General Miguel Costa',
    },
    {
      code: 'CPB',
      name: 'Carapicuíba',
    },
    {
      code: 'STE',
      name: 'Santa Terezinha',
    },
    {
      code: 'AJO',
      name: 'Antônio João',
    },
    {
      code: 'BRU',
      name: 'Barueri',
    },
    {
      code: 'JBE',
      name: 'Jardim Belval',
    },
    {
      code: 'JSI',
      name: 'Jardim Silveira',
    },
    {
      code: 'JDI',
      name: 'Jandira',
    },
    {
      code: 'SCO',
      name: 'Sagrado Coração',
    },
    {
      code: 'ECD',
      name: 'Engenheiro Cardoso',
    },
    {
      code: 'IPV',
      name: 'Itapevi',
    },
  ];
  stopsL9 = [
    {
      code: 'OSA',
      name: 'Osasco',
    },
    {
      code: 'PAL',
      name: 'Presidente Altino',
    },
    {
      code: 'CEA',
      name: 'Ceasa',
    },
    {
      code: 'JAG',
      name: 'Villa Lobos–Jaguaré',
    },
    {
      code: 'USP',
      name: 'Cidade Universitária',
    },
    {
      code: 'PIN',
      name: 'Pinheiros',
    },
    {
      code: 'HEB',
      name: 'Hebraica–Rebouças',
    },
    {
      code: 'CJD',
      name: 'Cidade Jardim',
    },
    {
      code: 'VOL',
      name: 'Vila Olímpia',
    },
    {
      code: 'BRR',
      name: 'Berrini',
    },
    {
      code: 'MRB',
      name: 'Morumbi',
    },
    {
      code: 'GJT',
      name: 'Granja Julieta',
    },
    {
      code: 'JOD',
      name: 'João Dias',
    },
    {
      code: 'SAM',
      name: 'Santo Amaro',
    },
    {
      code: 'SOC',
      name: 'Socorro',
    },
    {
      code: 'JUR',
      name: 'Jurubatuba',
    },
    {
      code: 'AUT',
      name: 'Autódromo',
    },
    {
      code: 'INT',
      name: 'Primavera–Interlagos',
    },
    {
      code: 'GRA',
      name: 'Grajaú',
    },
    {
      code: 'MVN',
      name: 'Bruno Covas/Mendes–Vila Natal',
    },
    {
      code: 'VAG',
      name: 'Varginha',
    },
  ];
}
