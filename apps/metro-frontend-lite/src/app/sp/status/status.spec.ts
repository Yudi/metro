import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { ApiService, FavoritesService } from '@metro/shared/api';
import { RailLinesStatusResponse } from '@metro/shared/utils';
import { Status } from './status';

describe('Status', () => {
  let component: Status;
  let fixture: ComponentFixture<Status>;
  let status: RailLinesStatusResponse;
  let statusUpdates: BehaviorSubject<RailLinesStatusResponse>;
  beforeEach(async () => {
    status = {
      lines: [],
      specialLines: [],
      specialInfoCards: [],
      lastUpdated: new Date(),
      success: true,
      errorMessage: null,
    };
    statusUpdates = new BehaviorSubject(status);
    await TestBed.configureTestingModule({
      imports: [Status],
      providers: [
        provideRouter([]),
        {
          provide: ApiService,
          useValue: {
            getRailStatus: () => statusUpdates.asObservable(),
          },
        },
        {
          provide: FavoritesService,
          useValue: {
            isFavorite: () => false,
            addFavorite: jest.fn(),
            removeFavorite: jest.fn(),
          },
        },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(Status);
    component = fixture.componentInstance;
  });
  it('should create', () => {
    fixture.detectChanges();
    expect(component).toBeTruthy();
  });

  it.each([null, undefined, 8, {}, [], true, ''])(
    'renders a line with malformed or empty color name %p',
    (colorName) => {
      expect(component.normalizeColor(colorName)).toBe('');
      expect(component.formatLineName(colorName)).toBe('');
      status.lines = [
        {
          code: 5,
          // Simulate an API payload that does not match its declared type.
          colorName: colorName as unknown as string,
          colorHex: '#800080',
          line: 'Linha 5 - Lilás',
          statusCode: 'OperacaoNormal',
          statusLabel: 'Operação Normal',
          statusColor: 'verde',
          description: null,
        },
      ];
      fixture.destroy();
      fixture = TestBed.createComponent(Status);

      statusUpdates.next({ ...status });
      expect(() => fixture.detectChanges()).not.toThrow();
      const lineName = fixture.nativeElement.querySelector(
        '.line-name',
      ) as HTMLElement;
      expect(lineName.textContent?.trim()).toBe('');
      expect(fixture.nativeElement.textContent).toContain('Normal');
    },
  );

  it('preserves formatting for valid accented color names', () => {
    expect(component.normalizeColor('LILÁS')).toBe('lilas');
    expect(component.formatLineName('LILÁS')).toBe('Lilás');
  });

  it.each([null, undefined, { toString: 0 }, {}, '5', NaN, Infinity])(
    'renders and ignores clicks for malformed line code %p',
    (code) => {
      const line = {
        code: code as unknown as number,
        colorName: 'Lilás',
        colorHex: '#800080',
        line: 'Linha 5 - Lilás',
        statusCode: 'VelocidadeReduzida' as const,
        statusLabel: 'Velocidade Reduzida',
        statusColor: 'amarelo',
        description: 'Circulação com velocidade reduzida.',
      };
      status.lines = [line];

      fixture.changeDetectorRef.markForCheck();
      statusUpdates.next({ ...status });
      expect(() => fixture.detectChanges()).not.toThrow();
      expect(fixture.nativeElement.querySelector('.badge').textContent.trim()).toBe('—');
      expect(fixture.nativeElement.querySelector('.description')).toBeNull();
      expect(fixture.nativeElement.querySelector('.clickable')).toBeNull();
      component.expandedLine.set('8');
      expect(() => component.lineClick(line)).not.toThrow();
      expect(component.expandedLine()).toBe('8');
    },
  );

  it('toggles descriptions for valid numeric line codes', () => {
    const line = {
      code: 5,
      colorName: 'Lilás',
      colorHex: '#800080',
      line: 'Linha 5 - Lilás',
      statusCode: 'VelocidadeReduzida' as const,
      statusLabel: 'Velocidade Reduzida',
      statusColor: 'amarelo',
      description: 'Circulação com velocidade reduzida.',
    };
    status.lines = [line];
    fixture.changeDetectorRef.markForCheck();
    statusUpdates.next({ ...status });
    component.lineClick(line);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.description').textContent).toContain(line.description);
    component.lineClick(line);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.description')).toBeNull();
  });
});
