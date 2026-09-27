import { TestBed } from '@angular/core/testing';
import { MapPanelRef } from './map-panel-ref';
import { MapPanelService, MapPanelSnap } from './map-panel.service';

interface TestPanelData {
  label: string;
}

class TestPanelContent {
  data: TestPanelData | null = null;
}

describe('MapPanelService', () => {
  let service: MapPanelService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [MapPanelService],
    });
    service = TestBed.inject(MapPanelService);
  });

  function openPanel(
    data: TestPanelData = { label: 'first panel' },
    initialSnap: MapPanelSnap = 'compact',
  ): MapPanelRef<TestPanelData, string> {
    return service.openComponent<TestPanelData, string>({
      component: TestPanelContent,
      data,
      title: data.label,
      summary: `Details for ${data.label}`,
      initialSnap,
    });
  }

  it('completes a replaced panel exactly once', () => {
    const oldRef = openPanel({ label: 'old panel' });
    const next = jest.fn();
    const complete = jest.fn();
    oldRef.afterClosed().subscribe({ next, complete });

    const currentRef = openPanel({ label: 'current panel' });
    oldRef.close('late result');

    expect(oldRef.closeReason).toBe('replaced');
    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith(undefined);
    expect(complete).toHaveBeenCalledTimes(1);
    expect(service.panel()?.ref).toBe(currentRef);
    expect(currentRef.closeReason).toBeNull();
  });

  it('ignores a stale ref close after a newer panel opens', () => {
    const staleRef = openPanel({ label: 'stale panel' });
    const currentRef = openPanel({ label: 'current panel' });

    staleRef.close('stale result');

    expect(service.panel()?.ref).toBe(currentRef);
    expect(service.panel()?.data).toEqual({ label: 'current panel' });
    expect(currentRef.closeReason).toBeNull();
  });

  it('does not update ref or component data after the panel closes', () => {
    const ref = openPanel({ label: 'before close' });
    const instance = new TestPanelContent();
    const updateData = jest.fn(
      (component: TestPanelContent, data: TestPanelData) => {
        component.data = data;
      },
    );
    ref.setDataUpdater(updateData);
    ref.attachComponentInstance(instance);

    const activeData = { label: 'active update' };
    ref.updateData(activeData);
    const updateCountAtClose = updateData.mock.calls.length;
    ref.close('closed');

    ref.updateData({ label: 'late update' });

    expect(ref.data).toBe(activeData);
    expect(instance.data).toBe(activeData);
    expect(updateData).toHaveBeenCalledTimes(updateCountAtClose);
    expect(service.panel()).toBeNull();
  });

  it('clear invalidates the generation and completes the current panel', () => {
    const ref = openPanel({ label: 'panel to clear' });
    const generationBeforeClear = service.generation;
    const next = jest.fn();
    const complete = jest.fn();
    ref.afterClosed().subscribe({ next, complete });

    service.clear();

    expect(service.generation).toBe(generationBeforeClear + 1);
    expect(service.panel()).toBeNull();
    expect(ref.closeReason).toBe('cleared');
    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith(undefined);
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it('preserves the panel identity and data through every snap transition', () => {
    const data = { label: 'persistent panel data' };
    const ref = openPanel(data);
    const descriptor = service.panel();

    const expectPanelUnchanged = (snap: MapPanelSnap) => {
      expect(service.snap()).toBe(snap);
      expect(service.panel()).toBe(descriptor);
      expect(service.panel()?.ref).toBe(ref);
      expect(service.panel()?.data).toBe(data);
      expect(ref.data).toBe(data);
    };

    service.setSnap('half');
    expectPanelUnchanged('half');

    service.nextSnap();
    expectPanelUnchanged('expanded');

    service.nextSnap();
    expectPanelUnchanged('expanded');

    service.toggleSnap();
    expectPanelUnchanged('half');

    service.previousSnap();
    expectPanelUnchanged('compact');

    service.previousSnap();
    expectPanelUnchanged('compact');

    service.setSnap('expanded');
    expectPanelUnchanged('expanded');

    service.toggleSnap();
    expectPanelUnchanged('half');

    service.setSnap('compact');
    expectPanelUnchanged('compact');

    service.toggleSnap();
    expectPanelUnchanged('half');
  });
});
