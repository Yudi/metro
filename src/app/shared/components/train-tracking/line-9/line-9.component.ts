import { Component, inject, OnInit, Signal } from '@angular/core';
import {
  NextTrain,
  ViamobilidadeL8L9Service,
} from '../../../services/tracking/viamobilidade-l8-l9.service';
import { Observable, tap } from 'rxjs';
import { toSignal } from '@angular/core/rxjs-interop';
import { AsyncPipe } from '@angular/common';

@Component({
  selector: 'app-line-9',
  imports: [AsyncPipe],
  templateUrl: './line-9.component.html',
  styleUrl: './line-9.component.scss',
})
export class Line9Component implements OnInit {
  private NextTrainService = inject(ViamobilidadeL8L9Service);
  private requestNextTrain = this.NextTrainService.requestNextTrain;
  stopsL9: Stop[] = [
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

  getNextTrain(stationCode: string) {
    this.requestNextTrain('L9', stationCode).pipe(
      tap((data: NextTrain[]) => {
        // this.trainDataSubject.next({
        //   ...this.trainDataSubject.value,
        //   [code]: data, // Updating the dictionary reactively

        this.stopsL9.map((stop) => {
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
    this.stopsL9.map((stop) => {
      this.getNextTrain(stop.code);
    });
  }
}

interface Stop {
  code: string;
  name: string;
  nextTrain?: NextTrain[];
}
