import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ApiService } from '@metro/shared/api';
import { RailLinesStatusResponse } from '@metro/shared/utils';
import { of } from 'rxjs';
import { LineStatusGridComponent } from './line-status-grid.component';

describe('LineStatusGridComponent', () => {
  let component: LineStatusGridComponent;
  let fixture: ComponentFixture<LineStatusGridComponent>;
  let status: RailLinesStatusResponse;

  beforeEach(async () => {
    status = {
      lines: [],
      specialLines: [],
      specialInfoCards: [],
      lastUpdated: new Date(),
      success: true,
      errorMessage: null,
    };

    await TestBed.configureTestingModule({
      imports: [LineStatusGridComponent],
      providers: [
        {
          provide: ApiService,
          useValue: {
            getRailStatus: () => of(status),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(LineStatusGridComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should include issue-only lines only when they have a dashboard issue', () => {
    status.lines = [
      {
        code: 1,
        colorName: 'azul',
        colorHex: '#0000ff',
        line: 'Linha 1 - Azul',
        statusCode: 'OperacaoNormal',
        statusLabel: 'Operação Normal',
        statusColor: 'verde',
        description: null,
      },
      {
        code: 2,
        colorName: 'verde',
        colorHex: '#008000',
        line: 'Linha 2 - Verde',
        statusCode: 'OperacaoEncerrada',
        statusLabel: 'Operação Encerrada',
        statusColor: 'cinza',
        description: null,
      },
      {
        code: 3,
        colorName: 'vermelha',
        colorHex: '#ff0000',
        line: 'Linha 3 - Vermelha',
        statusCode: 'OperacaoParcial',
        statusLabel: 'Operação Parcial',
        statusColor: 'amarelo',
        description: 'Circulação parcial.',
      },
      {
        code: 4,
        colorName: 'amarela',
        colorHex: '#ffff00',
        line: 'Linha 4 - Amarela',
        statusCode: 'OperacaoNormal',
        statusLabel: 'Operação Normal',
        statusColor: 'verde',
        description: null,
      },
    ];

    fixture.componentRef.setInput('lineCodes', [1]);
    fixture.componentRef.setInput('issueLineCodes', [2, 3, 4]);
    component.retryFetch();
    fixture.detectChanges();

    expect(component.regularLines().map((line) => line.code)).toEqual([1, 3]);
  });
});
