import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Subject, of, throwError } from 'rxjs';
import { NotificationApiService } from '@metro/shared/api';
import type { NotificationTarget } from '@metro/shared/notification-contracts';
import { NotificationTriggerEditorComponent } from './notification-trigger-editor.component';

describe('NotificationTriggerEditorComponent', () => {
  let component: NotificationTriggerEditorComponent;
  let fixture: ComponentFixture<NotificationTriggerEditorComponent>;
  const getTargets = jest.fn();
  const getFavoriteTargets = jest.fn();
  const getStopRoutes = jest.fn();

  const station: NotificationTarget = {
    id: 'station-opaque',
    kind: 'rail_station',
    label: 'Pinheiros',
    available: true,
  };

  beforeEach(async () => {
    getFavoriteTargets.mockReset().mockReturnValue(of([]));
    getStopRoutes.mockReset().mockReturnValue(of([]));
    getTargets.mockReset().mockReturnValue(of([station]));
    await TestBed.configureTestingModule({
      imports: [NotificationTriggerEditorComponent],
      providers: [
        {
          provide: NotificationApiService,
          useValue: {
            getTargets,
            getFavoriteTargets,
            getStopRoutes,
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
        label: 'Pinheiros (Linha 9 - Esmeralda)',
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
    expect(badges[0]).not.toHaveClass('round');
    expect(badges[0]).toHaveTextContent('4');
    expect(badges[1]).toHaveClass('round');
    expect(badges[1]).toHaveTextContent('9');
    expect(fixture.nativeElement.textContent).toContain('Pinheiros');
    expect(fixture.nativeElement.textContent).toContain('Esmeralda');
    expect(fixture.nativeElement.textContent).toContain('Amarela');
  });

  it('sorts rail target results naturally by line number', () => {
    jest.useFakeTimers();
    const lines: NotificationTarget[] = [10, 2, 1].map((code) => ({
      id: `line-${code}`,
      kind: 'rail_line',
      label: `Linha ${code}`,
      available: true,
      railLineCode: code,
    }));
    getTargets.mockReturnValue(of(lines));

    component.onTargetSearch({
      target: { value: 'linha' },
    } as unknown as Event);
    jest.advanceTimersByTime(250);

    expect(
      component.targetResults().map((target) => target.railLineCode),
    ).toEqual([1, 2, 10]);
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
  it.each(['full', 'number', 'code', 'color'] as const)(
    'updates the preview and saves the %s line-name preference',
    (lineNameFormat) => {
      const saved = jest.fn();
      component.saved.subscribe(saved);
      component.form.controls.name.setValue('Minha viagem');
      component.selectTarget({
        id: 'line-1',
        kind: 'rail_line',
        label: 'Linha 1 - Azul',
        available: true,
        railLineCode: 1,
      });
      component.form.controls.lineNameFormat.setValue(lineNameFormat);
      fixture.detectChanges();
      const expected = {
        full: 'Linha 1 - Azul',
        number: '1',
        code: 'L1',
        color: 'Azul',
      }[lineNameFormat];
      expect(
        fixture.nativeElement.querySelector('.notification-preview')
          .textContent,
      ).toContain(`${expected}: Velocidade Reduzida`);
      component.submit();
      expect(saved).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({ lineNameFormat }),
        }),
      );
    },
  );

  it('always previews L1, L2 and L3 independently of the saved selection', () => {
    component.selectTarget({
      id: 'line-9',
      kind: 'rail_line',
      label: 'Linha 9 - Esmeralda',
      available: true,
      railLineCode: 9,
    });
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector('.notification-preview p')
        .textContent,
    ).toBe(
      'L1: Velocidade Reduzida\nL2: Operação normalizada\nL3: Operação Normal',
    );
    expect(fixture.nativeElement.textContent).not.toContain(
      'Cenário de exemplo',
    );
    expect(fixture.nativeElement.textContent).toContain('Dados fictícios');
    component.removeTarget(component.selectedTargets()[0]);
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector('.notification-preview p')
        .textContent,
    ).toBe(
      'L1: Velocidade Reduzida\nL2: Operação normalizada\nL3: Operação Normal',
    );
  });
  it('shows favorites when empty and restores them after clearing a search', () => {
    jest.useFakeTimers();
    getFavoriteTargets.mockReturnValue(of([station]));
    component.form.controls.kind.setValue('rail_arrivals');
    expect(component.targetResults()).toEqual([station]);
    component.onTargetSearch({ target: { value: 'Pinheiros' } } as unknown as Event);
    jest.advanceTimersByTime(250);
    component.onTargetSearch({ target: { value: '' } } as unknown as Event);
    expect(getFavoriteTargets).toHaveBeenLastCalledWith('rail_station');
    expect(component.targetResults()).toEqual([station]);
  });

  it('lists stop lines, saves filters and treats a cleared selection as all lines', () => {
    const stop: NotificationTarget = { id: 'stop-one', kind: 'bus_stop', label: 'Praça da Sé', available: true };
    const route: NotificationTarget = { id: 'route-one', kind: 'bus_route', label: '8000-10', available: true };
    getStopRoutes.mockReturnValue(of([route]));
    component.form.controls.kind.setValue('bus_arrivals');
    component.form.controls.name.setValue('Meu ônibus');
    component.selectTarget(stop);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('input[type="search"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('mat-checkbox').textContent).toContain('8000-10');
    const saved = jest.fn();
    component.saved.subscribe(saved);
    component.toggleStopRoute(stop.id, route.id);
    component.submit();
    expect(saved.mock.lastCall[0].input.busStopRouteIds).toEqual({ [stop.id]: [route.id] });
    component.clearStopRoutes(stop.id);
    component.submit();
    expect(saved.mock.lastCall[0].input.busStopRouteIds).toEqual({ [stop.id]: [] });
    component.addAnotherStop();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('input[type="search"]')).not.toBeNull();
    component.removeTarget(stop);
    expect(component.busStopRouteIds()).toEqual({});
  });

  it('cancels stale line loading when a stop is removed', () => {
    const routes = new Subject<NotificationTarget[]>();
    getStopRoutes.mockReturnValue(routes);
    component.form.controls.kind.setValue('bus_arrivals');
    const stop: NotificationTarget = { id: 'stop-one', kind: 'bus_stop', label: 'Sé', available: true };
    component.selectTarget(stop);
    expect(routes.observed).toBe(true);
    component.removeTarget(stop);
    expect(routes.observed).toBe(false);
    expect(component.stopRoutesLoading()).toBe(false);
  });

  it('restores saved stop filters without changing the input and keeps stops independent', () => {
    const firstStop: NotificationTarget = { id: 'stop-one', kind: 'bus_stop', label: 'Sé', available: true };
    const secondStop: NotificationTarget = { ...firstStop, id: 'stop-two', label: 'Lapa' };
    const filters = { [firstStop.id]: ['route-one'], [secondStop.id]: ['route-two'] };
    fixture.componentRef.setInput('trigger', {
      id: 'saved-trigger', revision: 1, name: 'Ônibus', enabled: true,
      kind: 'bus_arrivals', days: [1], windows: [{ start: '07:00', end: '09:00' }],
      timezone: 'America/Sao_Paulo', smart: false, leadMinutes: 0,
      intervalMinutes: 5, statusMode: 'all', targetIds: [firstStop.id, secondStop.id],
      targets: [firstStop, secondStop], busStopRouteIds: filters,
    });
    fixture.detectChanges();
    expect(component.isStopRouteSelected(firstStop.id, 'route-one')).toBe(true);
    component.toggleStopRoute(firstStop.id, 'route-three');
    expect(filters[firstStop.id]).toEqual(['route-one']);
    expect(component.busStopRouteIds()[secondStop.id]).toEqual(['route-two']);
    component.form.controls.kind.setValue('rail_status');
    expect(component.busStopRouteIds()).toEqual({});
  });

  it('lets line loading be retried without discarding selected filters', () => {
    const stop: NotificationTarget = { id: 'stop-one', kind: 'bus_stop', label: 'Sé', available: true };
    getStopRoutes.mockReturnValue(throwError(() => new Error('offline')));
    component.form.controls.kind.setValue('bus_arrivals');
    component.selectTarget(stop);
    component.toggleStopRoute(stop.id, 'route-one');
    expect(component.stopRouteErrors()).toEqual([stop.id]);
    getStopRoutes.mockReturnValue(of([]));
    component.loadStopRoutes();
    expect(component.stopRouteErrors()).toEqual([]);
    expect(component.busStopRouteIds()[stop.id]).toEqual(['route-one']);
  });

});
