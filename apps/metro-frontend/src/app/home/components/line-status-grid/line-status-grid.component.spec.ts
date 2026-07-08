import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ApiService } from '@metro/shared/api';
import {
  EXPRESSO_LINHA_10_SCHEDULE,
  RailLinesStatusResponse,
  SpecialRailLineStatus,
} from '@metro/shared/utils';
import { of } from 'rxjs';
import { LineDescriptionDialogComponent } from './line-description-dialog.component';
import { LineStatusGridComponent } from './line-status-grid.component';

describe('LineStatusGridComponent', () => {
  let component: LineStatusGridComponent;
  let fixture: ComponentFixture<LineStatusGridComponent>;
  let status: RailLinesStatusResponse;
  let dialogOpen: jest.Mock;

  function createSpecialLine(
    partial: Partial<SpecialRailLineStatus>,
  ): SpecialRailLineStatus {
    return {
      code: 'EA',
      colorName: 'Preto',
      colorHex: '#000000',
      line: 'Expresso Aeroporto',
      statusCode: 'OperacaoNormal',
      statusLabel: 'Operação Normal',
      statusColor: 'verde',
      nextDepartures: [],
      issues: [],
      ...partial,
    };
  }

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

    dialogOpen = jest.fn();
    fixture = TestBed.createComponent(LineStatusGridComponent);
    component = fixture.componentInstance;
    (
      component as unknown as {
        dialog: { open: jest.Mock };
      }
    ).dialog = { open: dialogOpen };
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

  it('opens the Expresso Linha 10 dialog with the hardcoded schedule groups', () => {
    component.specialLineClick(
      createSpecialLine({
        code: '10X',
        colorName: 'Turquesa',
        colorHex: '#00A3A4',
        line: 'Expresso Linha 10',
      }),
    );

    expect(dialogOpen).toHaveBeenCalledWith(LineDescriptionDialogComponent, {
      data: expect.objectContaining({
        title: '10X - Expresso Linha 10',
        description: 'Dias úteis, nos picos da manhã e da tarde.',
        scheduleSections: [
          expect.objectContaining({
            title: 'Santo André → Tamanduateí',
            times: EXPRESSO_LINHA_10_SCHEDULE.departures.santoAndre,
          }),
          expect.objectContaining({
            title: 'Tamanduateí → Santo André',
            times: EXPRESSO_LINHA_10_SCHEDULE.departures.tamanduatei,
          }),
        ],
      }),
    });
  });

  it('opens the Expresso Aeroporto dialog with concise interval text', () => {
    component.specialLineClick(createSpecialLine({ code: 'EA' }));

    expect(dialogOpen).toHaveBeenCalledWith(LineDescriptionDialogComponent, {
      data: expect.objectContaining({
        title: 'EA - Expresso Aeroporto',
        description: expect.stringContaining(
          'De segunda a sábado, partidas a cada 60 minutos',
        ),
      }),
    });
  });

  it('opens the Aeromóvel GRU dialog with the daily operating window', () => {
    component.specialLineClick(
      createSpecialLine({
        code: 'GRU',
        colorName: 'Azul',
        colorHex: '#186dbf',
        line: 'Aeromóvel GRU',
        statusLabel: 'Aberto',
      }),
    );

    expect(dialogOpen).toHaveBeenCalledWith(LineDescriptionDialogComponent, {
      data: expect.objectContaining({
        title: 'GRU - Aeromóvel GRU',
        details: expect.arrayContaining([
          expect.stringContaining('Todos os dias, das 16h às 00h'),
        ]),
      }),
    });
  });
});
