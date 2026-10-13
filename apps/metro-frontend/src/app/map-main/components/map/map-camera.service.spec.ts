import { TestBed } from '@angular/core/testing';
import type { Map } from 'ol';
import { MapCameraService } from './map-camera.service';

describe('MapCameraService', () => {
  let service: MapCameraService;
  let target: HTMLElement;
  let viewport: HTMLElement;
  let zoom: number;
  let rotation: number;
  let size: [number, number];
  let animate: jest.Mock;
  let cancelAnimations: jest.Mock;
  let frame: FrameRequestCallback | null;
  const resolutionAt = (level: number) => 156543.03392804097 / 2 ** level;

  function flushFrame(): void {
    const callback = frame;
    frame = null;
    callback?.(0);
  }

  function addPanel(desktop: boolean, width: number, height: number): HTMLElement {
    const panel = document.createElement('div');
    panel.className = desktop ? 'map-panel is-desktop' : 'map-panel';
    panel.style.setProperty('--map-panel-height', `${height}px`);
    jest.spyOn(panel, 'getBoundingClientRect').mockReturnValue({
      width, height, left: 12, right: 12 + width,
      top: size[1] - height, bottom: size[1],
    } as DOMRect);
    target.parentElement?.appendChild(panel);
    return panel;
  }

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(MapCameraService);
    zoom = 17;
    rotation = 0;
    size = [1000, 800];
    frame = null;
    animate = jest.fn();
    cancelAnimations = jest.fn();
    const wrapper = document.createElement('div');
    target = document.createElement('div');
    viewport = document.createElement('div');
    target.appendChild(viewport);
    wrapper.appendChild(target);
    document.body.appendChild(wrapper);
    jest.spyOn(target, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, right: size[0], bottom: size[1],
      width: size[0], height: size[1],
    } as DOMRect);
    jest.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frame = callback;
      return 1;
    });
    jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => { frame = null; });
    jest.spyOn(window, 'matchMedia').mockReturnValue({ matches: false } as MediaQueryList);
    service.attach({
      getViewport: () => viewport,
      getTargetElement: () => target,
      getSize: () => size,
      getView: () => ({
        getZoom: () => zoom,
        getRotation: () => rotation,
        getCenter: () => [0, 0],
        getConstrainedZoom: (level: number) => Math.min(28, Math.max(0, level)),
        getResolutionForZoom: resolutionAt,
        getZoomForResolution: (resolution: number) => Math.log2(156543.03392804097 / resolution),
        animate,
        cancelAnimations,
      }),
    } as unknown as Map);
  });

  afterEach(() => {
    service.detach();
    target.parentElement?.remove();
    jest.restoreAllMocks();
  });

  it('smoothly centers a point without lowering an already useful zoom', () => {
    service.focusPoint([-46.6, -23.5], 16);
    flushFrame();
    expect(animate).toHaveBeenCalledWith(expect.objectContaining({ duration: 350 }));
    expect(animate.mock.calls[0][0]).not.toHaveProperty('zoom');
  });

  it('zooms in when a point selection is too far away to inspect', () => {
    zoom = 9;
    service.focusPoint([-46.6, -23.5], 16);
    flushFrame();
    expect(animate).toHaveBeenCalledWith(expect.objectContaining({ zoom: 16 }));
  });

  it('centers above a mobile sheet at the existing zoom', () => {
    size = [390, 800];
    addPanel(false, 390, 300);
    service.focusPoint([10, 20]);
    flushFrame();
    const { center } = animate.mock.calls[0][0];
    expect(center[1]).toBeCloseTo(20 - 146 * resolutionAt(zoom));
    expect(animate.mock.calls[0][0]).not.toHaveProperty('zoom');
  });

  it('centers to the right of the desktop information panel', () => {
    addPanel(true, 400, 650);
    service.focusPoint([10, 20]);
    flushFrame();
    const { center } = animate.mock.calls[0][0];
    expect(center[0]).toBeCloseTo(10 - 186 * resolutionAt(zoom));
  });

  it('retains zoom when a terminal extent can fit after panning', () => {
    service.fitExtent([0, 0, 100, 100], 16);
    flushFrame();
    expect(animate.mock.calls[0][0]).not.toHaveProperty('zoom');
  });

  it('zooms out just enough to fit a large route without forcing a minimum zoom', () => {
    service.fitExtent([0, 0, 100000, 100000], 15);
    flushFrame();
    const { zoom: targetZoom } = animate.mock.calls[0][0];
    expect(targetZoom).toBeLessThan(15);
    expect(100000 / resolutionAt(targetZoom)).toBeLessThanOrEqual(736.001);
  });

  it('adds detail for a route selected from a city-wide view', () => {
    zoom = 9;
    service.fitExtent([0, 0, 1000, 1000]);
    flushFrame();
    expect(animate.mock.calls[0][0].zoom).toBe(12);
  });

  it('fits rotated extents while preserving map orientation', () => {
    rotation = Math.PI / 2;
    service.fitExtent([0, 0, 100000, 1000]);
    flushFrame();
    const { zoom: targetZoom } = animate.mock.calls[0][0];
    expect(100000 / resolutionAt(targetZoom)).toBeCloseTo(736);
    expect(animate.mock.calls[0][0]).not.toHaveProperty('rotation');
  });

  it.each(['pointerdown', 'wheel', 'keydown'])('lets a %s gesture invalidate a late focus response', (eventType) => {
    const request = service.createFocusRequest();
    const gestureTarget = eventType === 'keydown' ? target : viewport;
    gestureTarget.dispatchEvent(eventType === 'keydown'
      ? new KeyboardEvent(eventType, { key: 'ArrowRight' })
      : new Event(eventType));
    request.point([10, 20]);
    flushFrame();
    expect(request.isCurrent()).toBe(false);
    expect(animate).not.toHaveBeenCalled();
  });

  it('cancels queued movement when a new selection takes over', () => {
    const oldRequest = service.createFocusRequest();
    oldRequest.point([10, 20]);
    service.focusPoint([30, 40]);
    oldRequest.point([50, 60]);
    flushFrame();
    expect(animate).toHaveBeenCalledTimes(1);
    expect(animate.mock.calls[0][0].center[1]).toBe(40);
  });

  it('keeps an explicit city overview zoom', () => {
    service.showOverview([10, 20], 10);
    flushFrame();
    expect(animate.mock.calls[0][0].zoom).toBe(10);
  });

  it('honors reduced motion', () => {
    jest.mocked(window.matchMedia).mockReturnValue({ matches: true } as MediaQueryList);
    service.focusPoint([10, 20]);
    flushFrame();
    expect(animate.mock.calls[0][0].duration).toBe(0);
  });

  it('does not move an invisible map or a map covered by the full sheet', () => {
    size = [0, 0];
    service.focusPoint([10, 20]);
    flushFrame();
    size = [390, 800];
    addPanel(false, 390, 760);
    service.focusPoint([10, 20]);
    flushFrame();
    expect(animate).not.toHaveBeenCalled();
  });

  it('ignores invalid coordinates', () => {
    service.focusPoint([Number.NaN, 20]);
    flushFrame();
    expect(animate).not.toHaveBeenCalled();
  });

  it.each(['Enter', ' '])('cancels a pending load when %s activates a map control', (key) => {
    const control = document.createElement('div');
    control.className = 'ol-control';
    const button = document.createElement('button');
    control.appendChild(button);
    viewport.appendChild(control);
    const request = service.createFocusRequest();

    button.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    request.point([10, 20]);
    flushFrame();

    expect(request.isCurrent()).toBe(false);
    expect(animate).not.toHaveBeenCalled();
  });

  it('cancels accessibility control clicks before the control starts its own animation', () => {
    const control = document.createElement('div');
    control.className = 'ol-control';
    const button = document.createElement('button');
    control.appendChild(button);
    viewport.appendChild(control);
    const startControlAnimation = jest.fn();
    button.addEventListener('click', startControlAnimation);
    const request = service.createFocusRequest();

    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    request.point([10, 20]);
    flushFrame();

    expect(request.isCurrent()).toBe(false);
    expect(animate).not.toHaveBeenCalled();
    expect(cancelAnimations.mock.invocationCallOrder.at(-1))
      .toBeLessThan(startControlAnimation.mock.invocationCallOrder[0]);
  });

  it('does not treat Enter on the map itself as a zoom control action', () => {
    const request = service.createFocusRequest();
    target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));

    expect(request.isCurrent()).toBe(true);
  });

  it('lets an older request cancel without affecting a newer selection', () => {
    const oldRequest = service.createFocusRequest();
    const currentRequest = service.createFocusRequest();
    currentRequest.point([30, 40]);
    oldRequest.cancel();
    flushFrame();

    expect(currentRequest.isCurrent()).toBe(true);
    expect(animate).toHaveBeenCalledTimes(1);
    expect(animate.mock.calls[0][0].center[1]).toBe(40);
  });

  it('cancels a queued focus before its animation frame runs', () => {
    const request = service.createFocusRequest();
    request.point([10, 20]);
    request.cancel();
    flushFrame();

    expect(animate).not.toHaveBeenCalled();
  });

  it('preserves close zoom for a cluster of coincident features', () => {
    zoom = 20;
    service.fitExtent([10, 20, 10, 20], 18, 18);
    flushFrame();

    expect(animate.mock.calls[0][0]).not.toHaveProperty('zoom');
  });

  it('still expands a coincident cluster from a wide view', () => {
    zoom = 12;
    service.fitExtent([10, 20, 10, 20], 18, 18);
    flushFrame();

    expect(animate.mock.calls[0][0].zoom).toBe(18);
  });

  it('resumes point focus when a sheet collapses, without polling while covered', async () => {
    size = [390, 800];
    const panel = addPanel(false, 390, 760);
    service.focusPoint([10, 20]);
    flushFrame();
    expect(animate).not.toHaveBeenCalled();
    expect(frame).toBeNull();

    panel.style.setProperty('--map-panel-height', '200px');
    await Promise.resolve();
    flushFrame();

    expect(animate).toHaveBeenCalledTimes(1);
    expect(animate.mock.calls[0][0].center[1]).toBeCloseTo(20 - 96 * resolutionAt(zoom));
    panel.dispatchEvent(new Event('transitionend', { bubbles: true }));
    flushFrame();
    expect(animate).toHaveBeenCalledTimes(1);
  });

  it('resumes extent focus after the sheet transition', () => {
    size = [390, 800];
    const panel = addPanel(false, 390, 760);
    service.fitExtent([0, 0, 100, 100], 16);
    flushFrame();

    panel.style.setProperty('--map-panel-height', '200px');
    panel.dispatchEvent(new Event('transitionend', { bubbles: true }));
    flushFrame();

    expect(animate).toHaveBeenCalledTimes(1);
  });

  it('waits for the sheet drag to finish before resuming focus', async () => {
    size = [390, 800];
    const panel = addPanel(false, 390, 200);
    panel.classList.add('is-dragging');
    service.focusPoint([10, 20]);
    flushFrame();
    expect(animate).not.toHaveBeenCalled();

    panel.classList.remove('is-dragging');
    await Promise.resolve();
    flushFrame();

    expect(animate).toHaveBeenCalledTimes(1);
  });

  it('does not replay covered focus after a map gesture cancels it', async () => {
    size = [390, 800];
    const panel = addPanel(false, 390, 760);
    service.focusPoint([10, 20]);
    flushFrame();
    viewport.dispatchEvent(new Event('wheel'));
    panel.style.setProperty('--map-panel-height', '200px');
    await Promise.resolve();
    flushFrame();

    expect(animate).not.toHaveBeenCalled();
  });

  it('resumes focus when a previously hidden map gains size', () => {
    size = [0, 0];
    service.focusPoint([10, 20]);
    flushFrame();
    expect(animate).not.toHaveBeenCalled();

    size = [1000, 800];
    window.dispatchEvent(new Event('resize'));
    flushFrame();

    expect(animate).toHaveBeenCalledTimes(1);
  });

  it('drops deferred focus and layout listeners when the map is detached', async () => {
    size = [390, 800];
    const panel = addPanel(false, 390, 760);
    service.focusPoint([10, 20]);
    flushFrame();
    service.detach();
    panel.style.setProperty('--map-panel-height', '200px');
    panel.dispatchEvent(new Event('transitionend', { bubbles: true }));
    window.dispatchEvent(new Event('resize'));
    await Promise.resolve();
    flushFrame();

    expect(animate).not.toHaveBeenCalled();
    expect(frame).toBeNull();
  });
});
