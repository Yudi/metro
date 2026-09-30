import type { StationHeaderImage } from '../../subway-station-dialog/station-images';
import { Component, inject, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MapPanelComponent } from './map-panel.component';
import { MAP_PANEL_REF } from './map-panel-ref';
import { MapPanelService } from './map-panel.service';

@Component({
  template: `<button type="button" (click)="panel.close(data)">
    Selecionar
  </button>`,
})
class PanelContentStub {
  readonly headerImage = signal<StationHeaderImage | undefined>(undefined);
  readonly onHeaderImageError = () => this.headerImage.set(undefined);
  readonly panel = inject(MAP_PANEL_REF);
  readonly data = inject<string>(MAT_DIALOG_DATA);
  private readonly favorite = signal(false);
  readonly isFavorite = () => this.favorite();
  readonly favoriteIcon = () =>
    this.favorite() ? 'favorite' : 'favorite_border';
  readonly toggleFavorite = jest.fn(() =>
    this.favorite.update((value) => !value),
  );
}

describe('MapPanelComponent', () => {
  let fixture: ComponentFixture<MapPanelComponent>;
  let panels: MapPanelService;
  let mapButton: HTMLButtonElement;

  beforeEach(async () => {
    TestBed.configureTestingModule({ imports: [MapPanelComponent] });
    fixture = TestBed.createComponent(MapPanelComponent);
    panels = TestBed.inject(MapPanelService);
    Object.defineProperty(fixture.nativeElement, 'clientHeight', {
      value: 700,
    });
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

  function open(initialSnap: 'compact' | 'half' | 'expanded' = 'compact') {
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

  it('interpolates the photo continuously above half height and hides it when compact', () => {
    open('half');
    const component = fixture.componentInstance;
    const { half, expanded } = component.anchors();
    expect(component.photoProgress()).toBe(0);
    component.dragHeight.set(half + (expanded - half) / 2);
    expect(component.photoProgress()).toBeCloseTo(0.5);
    component.dragHeight.set(expanded);
    expect(component.photoProgress()).toBe(1);
    component.dragHeight.set(null);
    panels.setSnap('compact');
    expect(component.photoProgress()).toBe(0);
    component.isDesktop.set(true);
    expect(component.photoProgress()).toBe(1);
  });

  it('keeps the title interactive while compact content is inert', () => {
    open('compact');
    const body: HTMLElement =
      fixture.nativeElement.querySelector('.map-panel__body');
    const title: HTMLElement = body.querySelector(
      '.map-panel__title-block',
    ) as HTMLElement;
    const content: HTMLElement = body.querySelector(
      '.map-panel__content',
    ) as HTMLElement;
    expect(title.closest('[inert]')).toBeNull();
    expect(content.hasAttribute('inert')).toBe(true);
    panels.setSnap('expanded');
    fixture.detectChanges();
    expect(content.hasAttribute('inert')).toBe(false);
  });

  it('clears the header image when replacing illustrated content', () => {
    open('expanded');
    const image: StationHeaderImage = {
      key: 'station-images/metro/luz.avif',
      src: '/api/media/station-images/files/metro/luz.avif',
      author: 'Autor',
      title: 'Luz',
      sourceUrl: 'https://commons.wikimedia.org/',
      license: 'CC0',
    };
    const illustrated = {
      headerImage: signal<StationHeaderImage | undefined>(image),
      onHeaderImageError: jest.fn(),
    };
    fixture.componentInstance.onAttached({ instance: illustrated });
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector('.map-panel__header-image'),
    ).toBeTruthy();
    const body: HTMLElement =
      fixture.nativeElement.querySelector('.map-panel__body');
    body.scrollTop = 84;
    body.dispatchEvent(new Event('scroll'));
    expect(fixture.componentInstance.handlePhotoVisibility()).toBe(0.5);
    expect(fixture.componentInstance.photoProgress()).toBe(1);
    open('compact');
    expect(
      fixture.nativeElement.querySelector('.map-panel__header-image'),
    ).toBeNull();
  });

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
    expect(
      fixture.nativeElement
        .querySelector('[role="region"]')
        .getAttribute('aria-label'),
    ).toBe('Ações do mapa');
  });

  it('keeps the desktop panel expanded without a drag handle and places favorite beside close', () => {
    open('compact');
    fixture.componentInstance.isDesktop.set(true);
    fixture.detectChanges();

    const frame: HTMLElement =
      fixture.nativeElement.querySelector('.map-panel');
    expect(handle()).toBeNull();
    expect(frame.style.getPropertyValue('--map-panel-height')).toBe('652px');
    expect(frame.querySelector('.map-panel__body')?.hasAttribute('inert')).toBe(
      false,
    );

    const favorite: HTMLButtonElement = frame.querySelector(
      '.map-panel__favorite',
    )!;
    const dismiss: HTMLButtonElement = frame.querySelector(
      '.map-panel__dismiss',
    )!;
    expect(favorite).toBeTruthy();
    expect(dismiss).toBeTruthy();
    expect(
      favorite.compareDocumentPosition(dismiss) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    favorite.click();
    expect(
      (fixture.componentInstance.favoriteContent() as PanelContentStub)
        .toggleFavorite,
    ).toHaveBeenCalled();
    dismiss.click();
    expect(panels.panel()).toBeNull();
  });

  it('keeps the favorite action when favoriting changes map selections', () => {
    open();
    const favorite: HTMLButtonElement = fixture.nativeElement.querySelector(
      '.map-panel__favorite',
    );
    favorite.click();
    fixture.componentRef.setInput('hasSelections', true);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.map-panel__favorite')).toBe(
      favorite,
    );
    expect(favorite.getAttribute('aria-label')).toBe('Remover dos favoritos');
    expect(favorite.querySelector('mat-icon')?.textContent).toBe('favorite');
  });

  it('keeps the map focusable and handles Escape only from within the panel', async () => {
    open('expanded');
    await fixture.whenStable();
    mapButton.focus();
    mapButton.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    fixture.detectChanges();

    expect(document.activeElement).toBe(mapButton);
    expect(panels.panel()).not.toBeNull();

    const panel: HTMLElement =
      fixture.nativeElement.querySelector('[role="region"]');
    panel.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    fixture.detectChanges();
    await fixture.whenStable();

    expect(panels.panel()).toBeNull();
    expect(document.activeElement).toBe(mapButton);
  });

  it('follows the pointer continuously, then snaps without treating release as a tap', async () => {
    open();
    await fixture.whenStable();
    const grip = handle();
    const frame: HTMLElement =
      fixture.nativeElement.querySelector('.map-panel');
    const startHeight = Number.parseFloat(
      frame.style.getPropertyValue('--map-panel-height'),
    );
    grip.setPointerCapture = jest.fn();
    grip.dispatchEvent(pointer('pointerdown', 600, 0));
    grip.dispatchEvent(pointer('pointermove', 400, 400));
    fixture.detectChanges();
    expect(
      Number.parseFloat(frame.style.getPropertyValue('--map-panel-height')),
    ).toBe(startHeight + 200);
    expect(frame.classList.contains('is-dragging')).toBe(true);

    grip.dispatchEvent(pointer('pointerup', 400, 600));
    grip.click();
    fixture.detectChanges();
    expect(panels.snap()).toBe('half');
    expect(
      Number.parseFloat(frame.style.getPropertyValue('--map-panel-height')),
    ).toBe(350);
    expect(frame.classList.contains('is-dragging')).toBe(false);

    grip.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'End', bubbles: true }),
    );
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

    const dismiss: HTMLButtonElement = fixture.nativeElement.querySelector(
      '.map-panel__title-row .map-panel__dismiss',
    );
    dismiss.click();
    fixture.detectChanges();
    expect(panels.panel()).toBeNull();
    expect(
      fixture.nativeElement.querySelector('.map-panel__dismiss'),
    ).toBeNull();
  });

  it('captures a fast release near the middle anchor instead of overshooting it', async () => {
    open();
    await fixture.whenStable();
    const grip = handle();
    const frame: HTMLElement =
      fixture.nativeElement.querySelector('.map-panel');
    const endY =
      600 -
      (350 -
        Number.parseFloat(frame.style.getPropertyValue('--map-panel-height')));
    grip.setPointerCapture = jest.fn();
    grip.dispatchEvent(pointer('pointerdown', 600, 0));
    grip.dispatchEvent(pointer('pointermove', endY, 16));
    grip.dispatchEvent(pointer('pointerup', endY, 17));
    grip.click();
    fixture.detectChanges();
    expect(panels.snap()).toBe('half');
    expect(
      Number.parseFloat(frame.style.getPropertyValue('--map-panel-height')),
    ).toBe(350);
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

  it('keeps visible half-height controls clickable without starting a drag', async () => {
    const ref = open('half');
    await fixture.whenStable();
    const result = jest.fn();
    ref.afterClosed().subscribe(result);
    const body: HTMLElement =
      fixture.nativeElement.querySelector('.map-panel__body');
    const button = body.querySelector(
      'ng-component button',
    ) as HTMLButtonElement;
    button.dispatchEvent(pointer('pointerdown', 400));
    button.dispatchEvent(pointer('pointerup', 400));
    expect(body.hasAttribute('inert')).toBe(false);
    expect(fixture.componentInstance.dragHeight()).toBeNull();
    button.click();
    expect(result).toHaveBeenCalledWith('station-id');
  });

  function touch(type: string, y: number, time: number): Event {
    const event = Object.assign(
      new Event(type, { bubbles: true, cancelable: true }),
      {
        touches: type === 'touchend' ? [] : [{ clientX: 100, clientY: y }],
        changedTouches: [{ clientX: 100, clientY: y }],
      },
    );
    Object.defineProperty(event, 'timeStamp', { value: time });
    return event;
  }

  it('resizes in both directions from content, suppressing only the drag click', async () => {
    open('half');
    await fixture.whenStable();
    const body: HTMLElement =
      fixture.nativeElement.querySelector('.map-panel__body');
    body.dispatchEvent(touch('touchstart', 500, 0));
    const move = touch('touchmove', 170, 400);
    body.dispatchEvent(move);
    fixture.detectChanges();
    expect(move.defaultPrevented).toBe(true);
    expect(fixture.componentInstance.height()).toBe(680);
    expect(body.scrollTop).toBe(0);
    body.dispatchEvent(touch('touchend', 170, 600));
    fixture.detectChanges();
    expect(panels.snap()).toBe('expanded');
    (body.querySelector('ng-component button') as HTMLButtonElement).click();
    expect(panels.panel()).not.toBeNull();

    panels.setSnap('half');
    fixture.detectChanges();
    body.dispatchEvent(touch('touchstart', 400, 700));
    body.dispatchEvent(touch('touchmove', 650, 1100));
    body.dispatchEvent(touch('touchend', 650, 1300));
    expect(panels.snap()).toBe('compact');
  });

  it('leaves expanded content scrolling native, collapsing only from its top', async () => {
    open('expanded');
    await fixture.whenStable();
    const body: HTMLElement =
      fixture.nativeElement.querySelector('.map-panel__body');
    body.scrollTop = 80;
    body.dispatchEvent(touch('touchstart', 300, 0));
    const move = touch('touchmove', 400, 100);
    body.dispatchEvent(move);
    expect(move.defaultPrevented).toBe(false);
    expect(fixture.componentInstance.dragHeight()).toBeNull();
    body.dispatchEvent(touch('touchend', 400, 150));
    body.scrollTop = 0;
    body.dispatchEvent(touch('touchstart', 300, 200));
    body.dispatchEvent(touch('touchmove', 630, 600));
    body.dispatchEvent(touch('touchend', 630, 800));
    expect(panels.snap()).toBe('half');
  });

  it('uses wheel direction at half height and preserves native scrolling when expanded', async () => {
    open('half');
    await fixture.whenStable();
    const body: HTMLElement =
      fixture.nativeElement.querySelector('.map-panel__body');
    jest.useFakeTimers();
    try {
      const down = new WheelEvent('wheel', {
        deltaY: 30,
        bubbles: true,
        cancelable: true,
      });
      body.dispatchEvent(down);
      expect(down.defaultPrevented).toBe(true);
      jest.advanceTimersByTime(170);
      expect(panels.snap()).toBe('expanded');
      const scroll = new WheelEvent('wheel', {
        deltaY: 50,
        bubbles: true,
        cancelable: true,
      });
      body.dispatchEvent(scroll);
      expect(scroll.defaultPrevented).toBe(false);
      panels.setSnap('half');
      body.dispatchEvent(
        new WheelEvent('wheel', {
          deltaY: -30,
          bubbles: true,
          cancelable: true,
        }),
      );
      jest.advanceTimersByTime(170);
      expect(panels.snap()).toBe('compact');
    } finally {
      jest.useRealTimers();
    }
  });

  it('requires a pause after scrolling to the top before a wheel gesture collapses the panel', async () => {
    open('expanded');
    await fixture.whenStable();
    const body: HTMLElement =
      fixture.nativeElement.querySelector('.map-panel__body');
    const scroll = (time: number) => {
      const event = new WheelEvent('wheel', { deltaY: -100, cancelable: true });
      Object.defineProperty(event, 'timeStamp', { value: time });
      body.dispatchEvent(event);
      return event;
    };
    jest.useFakeTimers();
    try {
      body.scrollTop = 300;
      expect(scroll(100).defaultPrevented).toBe(false);
      // Simulate native scrolling reaching the top, followed by momentum events.
      body.scrollTop = 0;
      for (const time of [140, 300, 500, 740]) {
        expect(scroll(time).defaultPrevented).toBe(false);
        expect(fixture.componentInstance.dragHeight()).toBeNull();
        expect(panels.snap()).toBe('expanded');
      }
      expect(scroll(991).defaultPrevented).toBe(true);
      jest.advanceTimersByTime(170);
      expect(panels.snap()).toBe('half');
    } finally {
      jest.useRealTimers();
    }
  });

  it('does not apply the wheel pause boundary to touch gestures', async () => {
    open('expanded');
    await fixture.whenStable();
    const body: HTMLElement =
      fixture.nativeElement.querySelector('.map-panel__body');
    body.scrollTop = 100;
    body.dispatchEvent(
      new WheelEvent('wheel', { deltaY: -100, cancelable: true }),
    );
    body.scrollTop = 0;
    body.dispatchEvent(touch('touchstart', 300, 0));
    const move = touch('touchmove', 630, 400);
    body.dispatchEvent(move);
    expect(move.defaultPrevented).toBe(true);
    body.dispatchEvent(touch('touchend', 630, 600));
    expect(panels.snap()).toBe('half');
  });

  it('uses the fixed top-edge baseline when the toolbar space changes the rendered height', async () => {
    open('half');
    await fixture.whenStable();
    const component = fixture.componentInstance;
    const frame: HTMLElement =
      fixture.nativeElement.querySelector('.map-panel');
    jest
      .spyOn(fixture.nativeElement, 'getBoundingClientRect')
      .mockReturnValue({ bottom: 700 });
    jest
      .spyOn(frame, 'getBoundingClientRect')
      .mockReturnValue({ top: 350, height: 390 } as DOMRect);
    const grip = handle();
    grip.setPointerCapture = jest.fn();
    grip.dispatchEvent(pointer('pointerdown', 370, 0));
    grip.dispatchEvent(pointer('pointermove', 270, 100));
    expect(component.height()).toBe(450);
    expect(component.anchors().expanded).toBe(688);
    expect(component.toolbarProgress()).toBeCloseTo(100 / 338);
    expect(component.toolbarProgress()).toBeGreaterThan(0);
    grip.dispatchEvent(pointer('pointercancel', 270, 110));
    fixture.detectChanges();
    expect(panels.dragging()).toBe(false);
  });

  it('keeps navigation fully visible through half height and restores it on destruction', async () => {
    open('half');
    await fixture.whenStable();
    expect(fixture.componentInstance.toolbarProgress()).toBe(0);
    expect(panels.toolbarHideProgress()).toBe(0);
    panels.setSnap('expanded');
    fixture.detectChanges();
    expect(fixture.componentInstance.toolbarProgress()).toBe(1);
    expect(panels.toolbarHideProgress()).toBe(1);
    fixture.destroy();
    expect(panels.toolbarHideProgress()).toBe(0);
    expect(panels.dragging()).toBe(false);
  });

  it('cancels a multi-touch gesture and leaves pinch-wheel gestures native', async () => {
    open('half');
    await fixture.whenStable();
    const body: HTMLElement =
      fixture.nativeElement.querySelector('.map-panel__body');
    body.dispatchEvent(touch('touchstart', 500, 0));
    body.dispatchEvent(touch('touchmove', 400, 100));
    body.dispatchEvent(
      Object.assign(new Event('touchstart', { bubbles: true }), {
        touches: [
          { clientX: 100, clientY: 400 },
          { clientX: 200, clientY: 400 },
        ],
      }),
    );
    expect(fixture.componentInstance.dragHeight()).toBeNull();
    expect(panels.snap()).toBe('half');
    const wheel = new WheelEvent('wheel', {
      deltaY: 50,
      ctrlKey: true,
      cancelable: true,
    });
    body.dispatchEvent(wheel);
    expect(wheel.defaultPrevented).toBe(false);
  });
});
