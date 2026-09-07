import { TestBed } from '@angular/core/testing';
import { BusInformationComponent } from './bus-information.component';
import { routeNoticeView } from './bus-notice-view';
import type { OperationalNotice } from '../../services/bus-information.service';

const notice: OperationalNotice = {
  sourceId: '1', sourceUrl: 'https://www.sptrans.com.br/informativos/oeste/exemplo/1/',
  title: 'Desvio de itinerário', periodText: '07/09/2026, das 9h às 20h.',
  description: '07/09/2026, das 9h às 20h.\nMotivo: obras.\n875A-10 Aeroporto\n975A-10 Centro\nIda: via alternativa.\nVolta: sem alteração.\n1234-10 Outro destino\nIda: rua exclusiva de outra linha.',
  routes: ['875A-10', '975A-10', '1234-10'], listing: 'RECENT', listedDate: '7 de setembro de 2026',
};

describe('route warning presentation', () => {
  it('extracts shared-route direction blocks without leaking the next route instructions', () => {
    for (const code of ['875A-10', '975A-10']) {
      const view = routeNoticeView(notice, code);
      expect(view.reason).toBe('obras.');
      expect(view.directions).toEqual([{ label: 'Ida', text: 'via alternativa.' }, { label: 'Volta', text: 'sem alteração.' }]);
      expect(JSON.stringify(view)).not.toContain('rua exclusiva');
    }
    expect(routeNoticeView(notice, '1234-10').directions).toEqual([{ label: 'Ida', text: 'rua exclusiva de outra linha.' }]);
  });
  it('stops at an unrecognized route heading instead of attributing its directions to the previous route', () => {
    const changed = { ...notice, description: notice.description.replace('1234-10 Outro destino', 'Linha 1234-10 Outro destino') };
    expect(JSON.stringify(routeNoticeView(changed, '875A-10'))).not.toContain('rua exclusiva');
    expect(routeNoticeView(changed, '1234-10').directions).toEqual([]);
  });
  it('fails safely for ambiguous route sections, periods and unsafe source links', () => {
    const view = routeNoticeView({ ...notice, periodText: 'Informativo', sourceUrl: 'javascript:alert(1)' }, '9999-99');
    expect(view).toMatchObject({ period: null, directions: [], details: null, sourceUrl: null });
  });
  it('starts with a route-specific button, expands parsed fields, and has no global list or intervals', async () => {
    await TestBed.configureTestingModule({ imports: [BusInformationComponent] }).compileComponents();
    const fixture = TestBed.createComponent(BusInformationComponent);
    fixture.componentRef.setInput('routeCode', '875A-10');
    fixture.componentRef.setInput('notices', [routeNoticeView(notice, '875A-10')]);
    fixture.componentRef.setInput('stale', true);
    fixture.detectChanges();
    const button = fixture.nativeElement.querySelector('button');
    expect(button.getAttribute('aria-label')).toContain('875A-10');
    expect(fixture.nativeElement.querySelector('dl')).toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('Intervalos');
    button.click(); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Período informado');
    expect(fixture.nativeElement.textContent).toContain('obras.');
    expect(fixture.nativeElement.textContent).toContain('Consulta desatualizada');
    expect(fixture.nativeElement.textContent).not.toContain('rua exclusiva');
    button.click(); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('dl')).toBeNull();
    fixture.destroy();
  });
  it('renders nothing when a route has no warnings', async () => {
    await TestBed.configureTestingModule({ imports: [BusInformationComponent] }).compileComponents();
    const fixture = TestBed.createComponent(BusInformationComponent);
    fixture.componentRef.setInput('routeCode', '875A-10'); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('button')).toBeNull();
    fixture.destroy();
  });
});
