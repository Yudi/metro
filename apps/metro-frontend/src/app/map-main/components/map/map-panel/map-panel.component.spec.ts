import { Component, inject, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MapPanelComponent } from './map-panel.component';
import { MAP_PANEL_REF } from './map-panel-ref';
import { MapPanelService } from './map-panel.service';

@Component({
  template: `<button type="button" (click)="panel.close(data)">Selecionar</button>`,
})
class PanelContentStub {
  readonly panel = inject(MAP_PANEL_REF);
  readonly data = inject<string>(MAT_DIALOG_DATA);
  private readonly favorite = signal(false);
  readonly isFavorite = () => this.favorite();
  readonly favoriteIcon = () => this.favorite() ? 'favorite' : 'favorite_border';
  readonly toggleFavorite = jest.fn(() => this.favorite.update(value => !value));
}

describe('MapPanelComponent', () => {
  let fixture: ComponentFixture<MapPanelComponent>;
  let panels: MapPanelService;
  let mapButton: HTMLButtonElement;

  beforeEach(async () => {
    TestBed.configureTestingModule({ imports: [MapPanelComponent] });
    fixture = TestBed.createComponent(MapPanelComponent);
    panels = TestBed.inject(MapPanelService);
    Object.defineProperty(fixture.nativeElement, 'clientHeight', { value: 700 });
    mapButton = document.createElement('button');
    document.body.appendChild(mapButton);
    mapButton.focus();
    fixture.detectChanges();
    await fixture.whenStable();
  });

  afterEach(() => {
    panels.clear();
    fixture.destroy();
    mapButton.remove();
  });

  function open(initialSnap: 'compact' | 'expanded' = 'compact') {
    const ref = panels.openComponent<string, string>({
      component: PanelContentStub,
      data: 'station-id',
      title: 'Estação Paraíso',
      summary: 'Linhas 1 e 2',
      initialSnap,
    });
    fixture.detectChanges();
    return ref;
  }

  function handle(): HTMLButtonElement {
    return fixture.nativeElement.querySelector('.map-panel__handle');
  }

  function pointer(type: string, y: number, time = 0): Event {
    const event = Object.assign(new Event(type, { bubbles: true }), {
      pointerId: 1,
      pointerType: 'touch',
      clientY: y,
      button: 0,
    });
    Object.defineProperty(event, 'timeStamp', { value: time });
    return event;
  }

  it('reuses the actual detail component across snaps and returns its result', () => {
    const ref = open();
    const results = jest.fn();
    ref.afterClosed().subscribe(results);
    const content = fixture.nativeElement.querySelector('ng-component');

    panels.setSnap('expanded');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('ng-component')).toBe(content);
    (content.querySelector('button') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(results).toHaveBeenCalledWith('station-id');
    expect(panels.panel()).toBeNull();
    expect(fixture.nativeElement.querySelector('[role="region"]').getAttribute('aria-label')).toBe('Ações do mapa');
  });

  it('keeps the desktop panel expanded without a drag handle and places favorite beside close', () => {
    open('compact');
    fixture.componentInstance.isDesktop.set(true);
    fixture.detectChanges();

    const frame: HTMLElement = fixture.nativeElement.querySelector('.map-panel');
    expect(handle()).toBeNull();
    expect(frame.style.height).toBe('596px');
    expect(frame.querySelector('.map-panel__body')?.hasAttribute('inert')).toBe(false);

    const favorite: HTMLButtonElement = frame.querySelector('.map-panel__favorite')!;
    const dismiss: HTMLButtonElement = frame.querySelector('.map-panel__dismiss')!;
    expect(favorite).toBeTruthy();
    expect(dismiss).toBeTruthy();
    expect(favorite.compareDocumentPosition(dismiss) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    favorite.click();
    expect((fixture.componentInstance.favoriteContent() as PanelContentStub).toggleFavorite).toHaveBeenCalled();
    dismiss.click();
    expect(panels.panel()).toBeNull();
  });

  it('keeps the favorite action when favoriting changes map selections', () => {
    open();
    const favorite: HTMLButtonElement = fixture.nativeElement.querySelector('.map-panel__favorite');
    favorite.click();
    fixture.componentRef.setInput('hasSelections', true);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.map-panel__favorite')).toBe(favorite);
    expect(favorite.getAttribute('aria-label')).toBe('Remover dos favoritos');
    expect(favorite.querySelector('mat-icon')?.textContent).toBe('favorite');
  });

  it('keeps the map focusable and handles Escape only from within the panel', async () => {
    open('expanded');
    await fixture.whenStable();
    mapButton.focus();
    mapButton.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();

    expect(document.activeElement).toBe(mapButton);
    expect(panels.panel()).not.toBeNull();

    const panel: HTMLElement = fixture.nativeElement.querySelector('[role="region"]');
    panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    await fixture.whenStable();

    expect(panels.panel()).toBeNull();
    expect(document.activeElement).toBe(mapButton);
  });

  it('follows the pointer continuously, then snaps without treating release as a tap', async () => {
    open();
    await fixture.whenStable();
    const grip = handle();
    const frame: HTMLElement = fixture.nativeElement.querySelector('.map-panel');
    const startHeight = Number.parseFloat(frame.style.height);
    grip.setPointerCapture = jest.fn();
    grip.dispatchEvent(pointer('pointerdown', 600, 0));
    grip.dispatchEvent(pointer('pointermove', 400, 400));
    fixture.detectChanges();
    expect(Number.parseFloat(frame.style.height)).toBe(startHeight + 200);
    expect(frame.classList.contains('is-dragging')).toBe(true);

    grip.dispatchEvent(pointer('pointerup', 400, 600));
    grip.click();
    fixture.detectChanges();
    expect(panels.snap()).toBe('half');
    expect(Number.parseFloat(frame.style.height)).toBe(350);
    expect(frame.classList.contains('is-dragging')).toBe(false);

    grip.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    fixture.detectChanges();
    expect(panels.snap()).toBe('expanded');
    expect(grip.getAttribute('aria-valuenow')).toBe('2');
  });

  it('stops at compact without dismissing details, and dismisses through the title-row X', async () => {
    open('expanded');
    await fixture.whenStable();
    const id = panels.panel()?.id;
    const grip = handle();
    grip.setPointerCapture = jest.fn();
    grip.dispatchEvent(pointer('pointerdown', 100, 0));
    grip.dispatchEvent(pointer('pointermove', 900, 800));
    grip.dispatchEvent(pointer('pointerup', 900, 1000));
    fixture.detectChanges();
    expect(panels.snap()).toBe('compact');
    expect(panels.panel()?.id).toBe(id);

    const dismiss: HTMLButtonElement = fixture.nativeElement.querySelector('.map-panel__title-row .map-panel__dismiss');
    dismiss.click();
    fixture.detectChanges();
    expect(panels.panel()).toBeNull();
    expect(fixture.nativeElement.querySelector('.map-panel__dismiss')).toBeNull();
  });

  it('captures a fast release near the middle anchor instead of overshooting it', async () => {
    open();
    await fixture.whenStable();
    const grip = handle();
    const frame: HTMLElement = fixture.nativeElement.querySelector('.map-panel');
    const endY = 600 - (350 - Number.parseFloat(frame.style.height));
    grip.setPointerCapture = jest.fn();
    grip.dispatchEvent(pointer('pointerdown', 600, 0));
    grip.dispatchEvent(pointer('pointermove', endY, 16));
    grip.dispatchEvent(pointer('pointerup', endY, 17));
    grip.click();
    fixture.detectChanges();
    expect(panels.snap()).toBe('half');
    expect(Number.parseFloat(frame.style.height)).toBe(350);
  });

  it('does not change the snap after a cancelled pointer gesture', () => {
    open();
    const grip = handle();
    grip.setPointerCapture = jest.fn();
    grip.dispatchEvent(pointer('pointerdown', 300));
    grip.dispatchEvent(pointer('pointercancel', 290));
    grip.dispatchEvent(pointer('pointerup', 240));
    expect(panels.snap()).toBe('compact');
  });
});
