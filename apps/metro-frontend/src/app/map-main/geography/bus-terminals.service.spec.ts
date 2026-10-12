import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import type {
  BusTerminalDetail,
  BusTerminalSummary,
} from '@metro/shared/bus-terminal-contracts';
import { BusTerminalsService } from './bus-terminals.service';

describe('BusTerminalsService', () => {
  let service: BusTerminalsService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        BusTerminalsService,
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });

    service = TestBed.inject(BusTerminalsService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('requests the terminal detail with the shared camel-case contract fields', () => {
    const terminal: BusTerminalDetail = {
      id: 'terminal:central',
      name: 'Terminal Central',
      aliases: [],
      latitude: -23.55,
      longitude: -46.63,
      stopIds: [],
      platformCodes: [],
      stops: [],
      routes: [],
    };
    let result: BusTerminalDetail | null | undefined;

    service.getTerminalDetail(terminal.id).subscribe((detail) => {
      result = detail;
    });

    const request = http.expectOne('/api/graphql');
    expect(request.request.method).toBe('POST');
    expect(request.request.body.variables).toEqual({ terminalId: terminal.id });
    expect(request.request.body.query).toContain(
      'busTerminal(terminalId: $terminalId)',
    );
    expect(request.request.body.query).toContain('boardingAllowed');
    request.flush({ data: { busTerminal: terminal } });

    expect(result).toEqual(terminal);
  });

  it('looks up a terminal summary by a physical stop ID', () => {
    const terminal: BusTerminalSummary = {
      id: 'terminal:central',
      name: 'Terminal Central',
      aliases: [],
      latitude: -23.55,
      longitude: -46.63,
      stopIds: ['stop-1'],
      platformCodes: ['A'],
    };
    let result: BusTerminalSummary | null | undefined;

    service.getTerminalForStop('stop-1').subscribe((summary) => {
      result = summary;
    });

    const request = http.expectOne('/api/graphql');
    expect(request.request.body.variables).toEqual({ stopId: 'stop-1' });
    expect(request.request.body.query).toContain(
      'busTerminalForStop(stopId: $stopId)',
    );
    request.flush({ data: { busTerminalForStop: terminal } });

    expect(result).toEqual(terminal);
  });

  it('surfaces GraphQL errors instead of treating missing data as an empty terminal', () => {
    let error: unknown;

    service.getTerminalDetail('terminal:missing').subscribe({
      error: (value: unknown) => (error = value),
    });

    http.expectOne('/api/graphql').flush({
      data: { busTerminal: null },
      errors: [{ message: 'resolver failed' }],
    });

    expect(error).toEqual(
      new Error('Não foi possível consultar o terminal de ônibus.'),
    );
  });
});
