import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Subject, of } from 'rxjs';
import { NotificationApiService } from '@metro/shared/api';
import type { NotificationTarget } from '@metro/shared/notification-contracts';
import { NotificationTriggerEditorComponent } from './notification-trigger-editor.component';

describe('NotificationTriggerEditorComponent', () => {
  let component: NotificationTriggerEditorComponent;
  let fixture: ComponentFixture<NotificationTriggerEditorComponent>;
  const getTargets = jest.fn();

  const station: NotificationTarget = {
    id: 'station-opaque',
    kind: 'rail_station',
    label: 'Pinheiros',
    available: true,
  };

  beforeEach(async () => {
    getTargets.mockReset().mockReturnValue(of([station]));
    await TestBed.configureTestingModule({
      imports: [NotificationTriggerEditorComponent],
      providers: [
        {
          provide: NotificationApiService,
          useValue: {
            getTargets,
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(NotificationTriggerEditorComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => jest.useRealTimers());

  it('keeps multiple weekdays and overnight windows in the saved input', () => {
    const saved = jest.fn();
    component.saved.subscribe(saved);
    component.form.controls.name.setValue('Saída noturna');
    component.form.controls.days.setValue([1, 3, 5]);
    component.selectedTargets.set([station]);
    component.form.controls.targetIds.setValue([station.id]);
    component.addWindow({ start: '22:00', end: '01:00' });

    component.submit();

    expect(saved).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          days: [1, 3, 5],
          timezone: 'America/Sao_Paulo',
          windows: [
            { start: '07:00', end: '09:00' },
            { start: '22:00', end: '01:00' },
          ],
        }),
      }),
    );
  });

  it('puts Sunday first in the weekday picker', () => {
    expect(component.dayOptions.map((day) => day.shortLabel)).toEqual([
      'Dom',
      'Seg',
      'Ter',
      'Qua',
      'Qui',
      'Sex',
      'Sáb',
    ]);
  });

  it('uses shared identity components for selected rail targets', () => {
    component.selectedTargets.set([
      {
        ...station,
        label: 'Pinheiros · Linha 9 - Esmeralda',
        railLineCode: 9,
      },
      {
        id: 'line-opaque',
        kind: 'rail_line',
        label: 'Linha 4 - Amarela',
        available: true,
        railLineCode: 4,
      },
    ]);
    fixture.detectChanges();

    const identities = fixture.nativeElement.querySelectorAll<HTMLElement>(
      '.target-chip app-notification-target-identity',
    );
    const badges = fixture.nativeElement.querySelectorAll<HTMLElement>(
      '.target-chip app-notification-target-identity .line-badge',
    );

    expect(identities).toHaveLength(2);
    expect(badges[0]).toHaveClass('round');
    expect(badges[0]).toHaveTextContent('9');
    expect(badges[1]).not.toHaveClass('round');
    expect(fixture.nativeElement.textContent).toContain('Pinheiros');
    expect(fixture.nativeElement.textContent).not.toContain('Esmeralda');
    expect(fixture.nativeElement.textContent).not.toContain('Amarela');
  });

  it('hides selected targets for broad searches but allows an exact search', () => {
    jest.useFakeTimers();
    const selectedLine: NotificationTarget = {
      id: 'line-opaque',
      kind: 'rail_line',
      label: 'Linha 9 - Esmeralda',
      available: true,
      railLineCode: 9,
    };
    getTargets.mockReturnValue(of([selectedLine]));
    component.selectedTargets.set([selectedLine]);
    component.form.controls.targetIds.setValue([selectedLine.id]);

    component.onTargetSearch({
      target: { value: 'linha' },
    } as unknown as Event);
    jest.advanceTimersByTime(250);
    expect(component.targetResults()).toEqual([]);

    component.onTargetSearch({ target: { value: '9' } } as unknown as Event);
    jest.advanceTimersByTime(250);
    expect(component.targetResults()).toEqual([selectedLine]);
  });

  it('resets selected destinations when the notification kind changes', () => {
    component.selectedTargets.set([station]);
    component.form.controls.targetIds.setValue([station.id]);

    component.form.controls.kind.setValue('rail_headway');

    expect(component.selectedTargets()).toEqual([]);
    expect(component.form.controls.targetIds.value).toEqual([]);
  });

  it('uses a simple arrival horizon and keeps cadence internal', () => {
    const saved = jest.fn();
    component.saved.subscribe(saved);
    component.form.controls.name.setValue('Próximos trens');
    component.form.controls.kind.setValue('rail_arrivals');
    component.form.controls.arrivalLeadMinutes.setValue(10);
    component.selectedTargets.set([station]);
    component.form.controls.targetIds.setValue([station.id]);

    component.submit();

    expect(saved).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          kind: 'rail_arrivals',
          arrivalLeadMinutes: 10,
          intervalMinutes: 5,
          smart: false,
        }),
      }),
    );
  });

  it('searches identical text again after changing target kind', () => {
    jest.useFakeTimers();
    const search = () =>
      component.onTargetSearch({
        target: { value: 'Pinheiros' },
      } as unknown as Event);
    search();
    jest.advanceTimersByTime(250);
    expect(getTargets).toHaveBeenLastCalledWith('rail_line', 'Pinheiros');

    component.form.controls.kind.setValue('rail_arrivals');
    search();
    jest.advanceTimersByTime(250);
    expect(getTargets).toHaveBeenLastCalledWith('rail_station', 'Pinheiros');
    expect(getTargets).toHaveBeenCalledTimes(2);
  });

  it('cancels the old request immediately when the target kind changes', () => {
    jest.useFakeTimers();
    const oldResults = new Subject<NotificationTarget[]>();
    getTargets.mockReturnValue(oldResults);
    component.onTargetSearch({
      target: { value: 'Pinheiros' },
    } as unknown as Event);
    jest.advanceTimersByTime(250);
    expect(oldResults.observed).toBe(true);

    component.form.controls.kind.setValue('bus_arrivals');
    expect(oldResults.observed).toBe(false);
    oldResults.next([station]);
    expect(component.targetResults()).toEqual([]);
    expect(component.targetLoading()).toBe(false);
    component.selectTarget(station);
    expect(component.selectedTargets()).toEqual([]);
  });

  it('keeps the revision captured when editing through a background refresh', () => {
    const saved = jest.fn();
    component.saved.subscribe(saved);
    fixture.componentRef.setInput('trigger', {
      id: 'trigger-1',
      revision: 3,
      name: 'Aviso original',
      enabled: true,
      days: [1, 2, 3, 4, 5],
      windows: [{ start: '07:00', end: '09:00' }],
      timezone: 'America/Sao_Paulo',
      smart: true,
      leadMinutes: 15,
      intervalMinutes: 15,
      kind: 'rail_status',
      targetIds: [station.id],
      statusMode: 'abnormal',
      targets: [station],
    });
    fixture.detectChanges();
    const refreshedTrigger = fixture.componentInstance.trigger();
    fixture.componentRef.setInput('trigger', {
      ...refreshedTrigger,
      revision: 4,
    });
    fixture.detectChanges();
    component.form.controls.name.setValue('Rascunho local');

    component.submit();

    expect(saved).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'trigger-1', expectedRevision: 3 }),
    );
  });
});
