import { Component, inject, OnInit, Signal } from '@angular/core';
import {
  NextTrain,
  ViamobilidadeL8L9Service,
} from '../../../services/tracking/viamobilidade-l8-l9.service';
import { Observable, tap } from 'rxjs';
import { toSignal } from '@angular/core/rxjs-interop';
import { AsyncPipe } from '@angular/common';

@Component({
  selector: 'app-line-8',
  imports: [],
  templateUrl: './line-8.component.html',
  styleUrl: './line-8.component.scss',
})
export class Line8Component {
  private NextTrainService = inject(ViamobilidadeL8L9Service);
  private requestNextTrain = this.NextTrainService.requestNextTrain;
  stopsL8: Stop[] = [
    {
      code: 'JPR',
      name: 'Júlio Prestes',
    },
    {
      code: 'BFU',
      name: 'Palmeiras–Barra Funda',
    },
    {
      code: 'LAB',
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

  getNextTrain(stationCode: string) {
    this.requestNextTrain('L8', stationCode).pipe(
      tap((data: NextTrain[]) => {
        this.stopsL8.map((stop) => {
          if (stop.code === stationCode) {
            stop['nextTrain'] = data;
          }
          console.log('Hello');

          return stop;
        });
      }),
    );
  }

  ngOnInit() {
    this.createObservable();
  }

  createObservable() {
    this.stopsL8.map((stop) => {
      this.getNextTrain(stop.code);
    });
  }
}

interface Stop {
  code: string;
  name: string;
  nextTrain?: NextTrain[];
}
