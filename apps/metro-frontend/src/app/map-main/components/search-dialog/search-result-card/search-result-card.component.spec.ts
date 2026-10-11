import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  SearchResultCardComponent,
  SearchResult,
} from './search-result-card.component';

describe('SearchResultCardComponent keyboard activation', () => {
  let fixture: ComponentFixture<SearchResultCardComponent>;
  let card: HTMLElement;
  let selection: jest.Mock;

  const result: SearchResult = {
    id: 'stop-1',
    name: 'Av. Paulista, 1000',
    type: 'bus_stop',
    source: 'gtfs',
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SearchResultCardComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(SearchResultCardComponent);
    fixture.componentRef.setInput('result', result);
    selection = jest.fn();
    fixture.componentInstance.resultClick.subscribe(selection);
    fixture.detectChanges();
    card = fixture.nativeElement.querySelector('.result-card') as HTMLElement;
  });

  it('emits one selection for Enter', () => {
    const event = new KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
      cancelable: true,
    });

    card.dispatchEvent(event);

    expect(selection).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it('keeps the full line name above the destination', () => {
    fixture.componentRef.setInput('result', {
      id: 'direction-1', name: '100', type: 'route', source: 'gtfs',
      routeData: {
        id: 'direction-1', route_id: '100', route_short_name: '100',
        route_long_name: 'Terminal Central - Terminal Bairro',
        route_color: '1976d2', route_text_color: 'ffffff', source: 'gtfs',
        destination: 'Terminal Bairro', directionId: 1,
      },
    } satisfies SearchResult);
    fixture.detectChanges();

    expect(card.querySelector('.result-title')?.textContent?.trim())
      .toBe('Terminal Central - Terminal Bairro');
    expect(card.querySelector('.result-direction')?.textContent?.trim())
      .toBe('Sentido Terminal Bairro');
    expect(card.querySelector('.result-title')?.nextElementSibling?.className)
      .toBe('result-direction');
  });

  it('keeps the full line name and replaces a single destination with Circular', () => {
    fixture.componentRef.setInput('result', {
      id: 'circular', name: '100', type: 'route', source: 'gtfs',
      routeData: {
        id: 'circular', route_id: '100', route_short_name: '100',
        route_long_name: 'Terminal Central - Bairro', destination: 'Terminal Central',
        route_color: '1976d2', route_text_color: 'ffffff', source: 'gtfs', isCircular: true,
      },
    } satisfies SearchResult);
    fixture.detectChanges();
    expect(card.querySelector('.result-title')?.textContent?.trim()).toBe('Terminal Central - Bairro');
    expect(card.querySelector('.result-direction')?.textContent?.trim()).toBe('Circular');
  });

  it('emits one selection for Space and prevents page scrolling', () => {
    const event = new KeyboardEvent('keydown', {
      key: ' ',
      bubbles: true,
      cancelable: true,
    });

    card.dispatchEvent(event);

    expect(selection).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });
});
