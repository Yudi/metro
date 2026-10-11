import { TestBed } from '@angular/core/testing';
import { MapSelectionsPanelComponent } from './map-selections-panel.component';
import type { SelectedRoute } from '../map.types';

describe('MapSelectionsPanelComponent route labels', () => {
  it('adds the opposite on click or keyboard activation while removal stays separate', async () => {
    await TestBed.configureTestingModule({ imports: [MapSelectionsPanelComponent] }).compileComponents();
    const fixture = TestBed.createComponent(MapSelectionsPanelComponent);
    fixture.componentRef.setInput('selectedRoutes', new Map([
      ['outbound', { id: 'outbound', routeId: '100', shortName: '100', longName: 'Centro - Bairro', destination: 'Centro', directionId: 0 }],
    ]));
    fixture.componentRef.setInput('selectedStops', new Map());
    const addOpposite = jest.fn();
    const remove = jest.fn();
    fixture.componentInstance.addOppositeDirection.subscribe(addOpposite);
    fixture.componentInstance.removeRoute.subscribe(remove);
    fixture.detectChanges();

    const element: HTMLElement = fixture.nativeElement;
    const chip = element.querySelector<HTMLElement>('mat-chip');
    const removeButton = element.querySelector<HTMLButtonElement>('button[matChipRemove]');
    if (!chip || !removeButton) throw new Error('Route chip controls are missing');
    chip.click();
    chip.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    chip.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    expect(addOpposite.mock.calls).toEqual([['outbound'], ['outbound'], ['outbound']]);

    const bubbledClick = jest.fn();
    element.addEventListener('click', bubbledClick);
    removeButton.click();
    removeButton.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(remove).toHaveBeenCalledWith('outbound');
    expect(addOpposite).toHaveBeenCalledTimes(3);
    expect(bubbledClick).not.toHaveBeenCalled();
  });

  it('distinguishes directions with the same code in visible and removal labels', async () => {
    await TestBed.configureTestingModule({ imports: [MapSelectionsPanelComponent] }).compileComponents();
    const fixture = TestBed.createComponent(MapSelectionsPanelComponent);
    const routes: SelectedRoute[] = [
      { id: 'outbound', shortName: '100', longName: 'Centro - Bairro', destination: 'Terminal Municipal - Centro' },
      { id: 'inbound', shortName: '100', longName: 'Centro - Bairro', destination: 'Terminal Municipal - Bairro' },
      { id: 'legacy', shortName: '200', longName: 'Terminal Regional - Centro' },
    ];
    fixture.componentRef.setInput('selectedRoutes', new Map(routes.map((route) => [route.id, route])));
    fixture.componentRef.setInput('selectedStops', new Map());
    fixture.detectChanges();

    const element: HTMLElement = fixture.nativeElement;
    const destinations = [...element.querySelectorAll('.route-direction-destination')]
      .map((label) => label.textContent?.trim());
    expect(destinations).toEqual([
      'Terminal Municipal - Centro', 'Terminal Municipal - Bairro', 'Terminal Regional - Centro',
    ]);
    const removeLabels = [...element.querySelectorAll('button[matChipRemove]')]
      .map((button) => button.getAttribute('aria-label'));
    expect(removeLabels).toEqual([
      'Remover rota 100, sentido Terminal Municipal - Centro',
      'Remover rota 100, sentido Terminal Municipal - Bairro',
      'Remover rota 200 - Terminal Regional - Centro',
    ]);
  });
});
