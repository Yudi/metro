import { TestBed } from '@angular/core/testing';
import { BusVehicleDetailsComponent, BusVehicleDetails } from './bus-vehicle-details.component';

describe('BusVehicleDetailsComponent', () => {
  function render(data: BusVehicleDetails) {
    const fixture = TestBed.createComponent(BusVehicleDetailsComponent);
    fixture.componentRef.setInput('data', data);
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(() => TestBed.configureTestingModule({ imports: [BusVehicleDetailsComponent] }));

  it('shows the route, destination, accessibility and position time in São Paulo time', () => {
    const fixture = render({
      routeShortName: '8000-10', destination: 'Terminal Lapa', origin: 'Praça Ramos',
      isCircular: false, accessible: true, recordedAt: '2026-10-10T18:30:05Z',
    });
    const element: HTMLElement = fixture.nativeElement;
    expect(element.textContent).toContain('8000-10');
    expect(element.textContent).toContain('Sentido Terminal Lapa');
    expect(element.textContent).toContain('Praça Ramos');
    expect(element.textContent).toContain('Veículo acessível');
    expect(element.textContent).not.toContain('Velocidade');
    expect(element.querySelector('time')?.textContent).toContain('15:30:05');
    expect(element.querySelector('time')?.getAttribute('datetime')).toBe('2026-10-10T18:30:05.000Z');
  });

  it('does not confuse unknown metadata with false accessibility or a fabricated time', () => {
    const fixture = render({ routeShortName: '', isCircular: false, recordedAt: 'invalid' });
    const element: HTMLElement = fixture.nativeElement;
    expect(element.textContent).toContain('Linha não informada');
    expect(element.textContent).toContain('Destino não informado');
    expect(element.textContent).not.toContain('Veículo não acessível');
    expect(element.querySelector('time')).toBeNull();
  });

  it('uses Circular for circular routes and preserves a false accessibility flag', () => {
    const fixture = render({
      routeShortName: '8000-10', isCircular: true, destination: 'Terminal Lapa', accessible: false,
    });
    expect(fixture.nativeElement.textContent).toContain('Circular');
    expect(fixture.nativeElement.textContent).not.toContain('Sentido Terminal Lapa');
    expect(fixture.nativeElement.textContent).toContain('Veículo não acessível');
  });
});
