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
