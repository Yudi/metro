import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnChanges,
  SimpleChanges,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  FormArray,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { NotificationApiService } from '@metro/shared/api';
import { getRailLineByCode } from '@metro/shared/utils';
import {
  NOTIFICATION_KINDS,
  NOTIFICATION_TIMEZONE,
  TARGET_KIND_FOR_NOTIFICATION,
  validateNotificationTrigger,
} from '@metro/shared/notification-contracts';
import type {
  NotificationKind,
  NotificationTarget,
  NotificationTargetKind,
  NotificationTrigger,
  NotificationTriggerInput,
} from '@metro/shared/notification-contracts';
import {
  Subject,
  catchError,
  distinctUntilChanged,
  of,
  switchMap,
  timer,
} from 'rxjs';
import {
  NotificationTargetIdentityComponent,
  sortNotificationTargets,
} from './notification-target-identity.component';

export type NotificationTriggerFormInput = NotificationTriggerInput & {
  arrivalLeadMinutes?: number;
};

export interface NotificationTriggerEditorSave {
  input: NotificationTriggerFormInput;
  id?: string;
  expectedRevision?: number;
}

interface WindowFormControls {
  start: FormControl<string>;
  end: FormControl<string>;
}

interface TriggerFormControls {
  name: FormControl<string>;
  kind: FormControl<NotificationKind>;
  days: FormControl<number[]>;
  windows: FormArray<FormGroup<WindowFormControls>>;
  smart: FormControl<boolean>;
  leadMinutes: FormControl<number>;
  arrivalLeadMinutes: FormControl<number>;
  intervalMinutes: FormControl<number>;
  statusMode: FormControl<'all' | 'abnormal'>;
  targetIds: FormControl<string[]>;
}

const DEFAULT_TRIGGER: NotificationTriggerFormInput = {
  name: '',
  enabled: true,
  days: [1, 2, 3, 4, 5],
  windows: [{ start: '07:00', end: '09:00' }],
  timezone: NOTIFICATION_TIMEZONE,
  smart: true,
  leadMinutes: 15,
  arrivalLeadMinutes: 5,
  intervalMinutes: 15,
  kind: 'rail_status',
  targetIds: [],
  statusMode: 'abnormal',
};

const DAY_OPTIONS = [
  { value: 0, shortLabel: 'Dom', label: 'domingo' },
  { value: 1, shortLabel: 'Seg', label: 'segunda-feira' },
  { value: 2, shortLabel: 'Ter', label: 'terça-feira' },
  { value: 3, shortLabel: 'Qua', label: 'quarta-feira' },
  { value: 4, shortLabel: 'Qui', label: 'quinta-feira' },
  { value: 5, shortLabel: 'Sex', label: 'sexta-feira' },
  { value: 6, shortLabel: 'Sáb', label: 'sábado' },
] as const;

const KIND_LABELS: Record<NotificationKind, string> = {
  rail_status: 'Status do metrô e trem',
  rail_headway: 'Intervalo entre trens',
  rail_arrivals: 'Próximos trens',
  bus_arrivals: 'Chegadas de ônibus',
  bus_notices: 'Avisos de ônibus',
  special_departures: 'Partidas especiais',
};

const TARGET_KIND_LABELS: Record<NotificationTargetKind, string> = {
  rail_line: 'linhas',
  rail_station: 'estações',
  bus_route: 'linhas',
  bus_stop: 'pontos',
  special_line: 'serviços',
};

function normalizeTargetSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function targetSearchTerms(target: NotificationTarget): string[] {
  const label = target.label.trim();
  const terms = [label, label.split('·', 1)[0] ?? label];

  if (target.kind === 'rail_line') {
    const lineCode = target.railLineCode ?? /^linha\s*(\d+)/iu.exec(label)?.[1];
    if (lineCode) {
      terms.push(String(lineCode), `L${lineCode}`, `Linha ${lineCode}`);
      const line = getRailLineByCode(Number(lineCode));
      if (line) {
        terms.push(line.colorName, line.fullName);
      }
    }
  }

  return terms;
}

function isExplicitTargetSearch(
  target: NotificationTarget,
  search: string,
): boolean {
  const query = normalizeTargetSearch(search);
  return (
    query.length > 0 &&
    targetSearchTerms(target).some(
      (term) => normalizeTargetSearch(term) === query,
    )
  );
}

@Component({
  selector: 'app-notification-trigger-editor',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    MatSlideToggleModule,
    NotificationTargetIdentityComponent,
  ],
  templateUrl: './notification-trigger-editor.component.html',
  styleUrl: './notification-trigger-editor.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotificationTriggerEditorComponent implements OnChanges {
  readonly trigger = input<NotificationTrigger | null>(null);
  readonly busy = input(false);
  readonly saveError = input<string | null>(null);

  readonly saved = output<NotificationTriggerEditorSave>();
  readonly closed = output<void>();

  readonly dayOptions = DAY_OPTIONS;
  readonly notificationKinds = NOTIFICATION_KINDS;
  readonly kindLabels = KIND_LABELS;
  readonly selectedKind = signal<NotificationKind>(DEFAULT_TRIGGER.kind);
  readonly targetSearch = signal('');
  private readonly rawTargetResults = signal<NotificationTarget[]>([]);
  readonly targetResults = computed(() => {
    const search = this.targetSearch();
    const selectedIds = new Set(
      this.selectedTargets().map((target) => target.id),
    );

    return sortNotificationTargets(
      this.rawTargetResults().filter(
        (target) =>
          !selectedIds.has(target.id) || isExplicitTargetSearch(target, search),
      ),
    );
  });
  readonly selectedTargets = signal<NotificationTarget[]>([]);
  readonly sortedSelectedTargets = computed(() =>
    sortNotificationTargets(this.selectedTargets()),
  );
  readonly targetLoading = signal(false);
  readonly targetError = signal(false);
  readonly submitted = signal(false);
  readonly formError = signal<string | null>(null);
  readonly targetKind = computed(
    () => TARGET_KIND_FOR_NOTIFICATION[this.selectedKind()],
  );
  readonly targetKindLabel = computed(
    () => TARGET_KIND_LABELS[this.targetKind()],
  );
  readonly title = computed(() =>
    this.trigger() ? 'Editar aviso' : 'Novo aviso',
  );
  readonly isRailStatus = computed(() => this.selectedKind() === 'rail_status');
  readonly isArrivalKind = computed(
    () =>
      this.selectedKind() === 'rail_arrivals' ||
      this.selectedKind() === 'bus_arrivals',
  );
  readonly isSmartKind = computed(
    () =>
      this.selectedKind() === 'rail_status' ||
      this.selectedKind() === 'bus_notices',
  );

  readonly windows = new FormArray<FormGroup<WindowFormControls>>([]);
  readonly form = new FormGroup<TriggerFormControls>({
    name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(80)],
    }),
    kind: new FormControl(DEFAULT_TRIGGER.kind, { nonNullable: true }),
    days: new FormControl([...DEFAULT_TRIGGER.days], { nonNullable: true }),
    windows: this.windows,
    smart: new FormControl(DEFAULT_TRIGGER.smart, { nonNullable: true }),
    leadMinutes: new FormControl(DEFAULT_TRIGGER.leadMinutes, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(0), Validators.max(60)],
    }),
    arrivalLeadMinutes: new FormControl(
      DEFAULT_TRIGGER.arrivalLeadMinutes ?? 5,
      {
        nonNullable: true,
        validators: [
          Validators.required,
          Validators.min(1),
          Validators.max(30),
        ],
      },
    ),
    intervalMinutes: new FormControl(DEFAULT_TRIGGER.intervalMinutes, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(5), Validators.max(120)],
    }),
    statusMode: new FormControl(DEFAULT_TRIGGER.statusMode, {
      nonNullable: true,
    }),
    targetIds: new FormControl([...DEFAULT_TRIGGER.targetIds], {
      nonNullable: true,
    }),
  });

  private readonly api = inject(NotificationApiService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly targetSearchSubject = new Subject<{
    kind: NotificationTargetKind;
    search: string;
  }>();
  private initializedKey: string | null = null;
  private baselineId: string | undefined;
  private baselineRevision: number | undefined;
  private baselineEnabled = true;

  constructor() {
    this.addWindow(DEFAULT_TRIGGER.windows[0]);

    this.form.controls.kind.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((kind) => {
        const previousKind = this.selectedKind();
        this.selectedKind.set(kind);
        this.updateIntervalValidators(kind, previousKind);
        if (!isSmartNotificationKind(kind)) {
          this.form.controls.smart.setValue(false, { emitEvent: false });
        } else if (!isSmartNotificationKind(previousKind)) {
          this.form.controls.smart.setValue(true, { emitEvent: false });
        }
        this.selectedTargets.set([]);
        this.rawTargetResults.set([]);
        this.form.controls.targetIds.setValue([]);
        this.updateTargetSearch('');
      });

    this.targetSearchSubject
      .pipe(
        distinctUntilChanged(
          (previous, current) =>
            previous.kind === current.kind &&
            previous.search === current.search,
        ),
        switchMap(({ kind, search }) => {
          if (!search) {
            this.targetLoading.set(false);
            this.targetError.set(false);
            return of<NotificationTarget[] | null>([]);
          }

          this.targetLoading.set(true);
          this.targetError.set(false);
          // Cancel stale requests immediately; debounce only the next request.
          return timer(250).pipe(
            switchMap(() => this.api.getTargets(kind, search)),
            catchError(() => {
              this.targetError.set(true);
              return of<NotificationTarget[] | null>(null);
            }),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((targets) => {
        this.targetLoading.set(false);
        if (targets === null) {
          this.rawTargetResults.set([]);
          return;
        }

        const selectedTargets = this.selectedTargets();
        const byId = new Map(targets.map((target) => [target.id, target]));
        for (const target of selectedTargets) {
          if (!byId.has(target.id)) {
            byId.set(target.id, target);
          }
        }

        this.rawTargetResults.set([...byId.values()]);
      });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['trigger']) {
      return;
    }

    const key = this.trigger()?.id ?? 'new';
    if (key === this.initializedKey) {
      return;
    }

    this.initializedKey = key;
    this.populate(this.trigger());
  }

  windowGroup(index: number): FormGroup<WindowFormControls> {
    return this.windows.at(index);
  }

  isDaySelected(day: number): boolean {
    return this.form.controls.days.value.includes(day);
  }

  toggleDay(day: number): void {
    const days = new Set(this.form.controls.days.value);
    if (days.has(day)) {
      days.delete(day);
    } else {
      days.add(day);
    }

    this.form.controls.days.setValue([...days].sort((a, b) => a - b));
    this.form.controls.days.markAsDirty();
  }

  addWindow(
    window: { start: string; end: string } = { start: '07:00', end: '09:00' },
  ): void {
    if (this.windows.length >= 8) {
      return;
    }

    this.windows.push(
      new FormGroup<WindowFormControls>({
        start: new FormControl(window.start, {
          nonNullable: true,
          validators: [
            Validators.required,
            Validators.pattern(/^([01]\d|2[0-3]):[0-5]\d$/u),
          ],
        }),
        end: new FormControl(window.end, {
          nonNullable: true,
          validators: [
            Validators.required,
            Validators.pattern(/^([01]\d|2[0-3]):[0-5]\d$/u),
          ],
        }),
      }),
    );
  }

  removeWindow(index: number): void {
    if (this.windows.length <= 1) {
      return;
    }

    this.windows.removeAt(index);
  }

  onTargetSearch(event: Event): void {
    const query = (event.target as HTMLInputElement).value;
    this.updateTargetSearch(query);
  }

  private updateTargetSearch(query: string): void {
    this.targetSearch.set(query);
    this.rawTargetResults.set([]);
    this.targetSearchSubject.next({
      kind: this.targetKind(),
      search: query.trim(),
    });
  }

  selectTarget(target: NotificationTarget): void {
    if (
      !target.available ||
      target.kind !== this.targetKind() ||
      this.isTargetSelected(target.id)
    ) {
      return;
    }

    const selected = [...this.selectedTargets(), target];
    this.selectedTargets.set(selected);
    this.form.controls.targetIds.setValue(selected.map((item) => item.id));
    this.form.controls.targetIds.markAsDirty();
    this.updateTargetSearch('');
    this.rawTargetResults.set([]);
  }

  removeTarget(target: NotificationTarget): void {
    const selected = this.selectedTargets().filter(
      (item) => item.id !== target.id,
    );
    this.selectedTargets.set(selected);
    this.form.controls.targetIds.setValue(selected.map((item) => item.id));
    this.form.controls.targetIds.markAsDirty();
  }

  isTargetSelected(targetId: string): boolean {
    return this.selectedTargets().some((target) => target.id === targetId);
  }

  submit(): void {
    this.submitted.set(true);
    this.formError.set(null);
    this.form.markAllAsTouched();

    if (this.form.invalid) {
      this.formError.set('Revise os campos destacados antes de salvar.');
      return;
    }

    const value = this.form.getRawValue();
    const input: NotificationTriggerFormInput = {
      name: value.name.trim(),
      enabled: this.baselineEnabled,
      days: [...value.days].sort((a, b) => a - b),
      windows: value.windows.map((window) => ({
        start: window.start,
        end: window.end,
      })),
      timezone: NOTIFICATION_TIMEZONE,
      smart: this.isSmartKind() ? value.smart : false,
      leadMinutes: value.leadMinutes,
      arrivalLeadMinutes: value.arrivalLeadMinutes,
      intervalMinutes: value.intervalMinutes,
      kind: value.kind,
      targetIds: [...value.targetIds],
      statusMode: value.statusMode,
    };
    const validationError = validateNotificationTrigger(input);
    if (validationError) {
      this.formError.set(validationError);
      return;
    }

    this.saved.emit({
      input,
      id: this.baselineId,
      expectedRevision: this.baselineRevision,
    });
  }

  private populate(trigger: NotificationTrigger | null): void {
    const value = trigger ?? DEFAULT_TRIGGER;
    this.baselineId = trigger?.id;
    this.baselineRevision = trigger?.revision;
    this.baselineEnabled = trigger?.enabled ?? DEFAULT_TRIGGER.enabled;
    this.form.reset(
      {
        name: value.name,
        kind: value.kind,
        days: [...value.days],
        smart: value.smart,
        leadMinutes: value.leadMinutes,
        arrivalLeadMinutes: value.arrivalLeadMinutes ?? 5,
        intervalMinutes: value.intervalMinutes,
        statusMode: value.statusMode,
        targetIds: [...value.targetIds],
      },
      { emitEvent: false },
    );

    while (this.windows.length > 0) {
      this.windows.removeAt(0);
    }
    for (const window of value.windows) {
      this.addWindow(window);
    }

    const targets = trigger?.targets ?? [];
    this.selectedKind.set(value.kind);
    this.updateIntervalValidators(value.kind, value.kind);
    this.selectedTargets.set(targets);
    this.rawTargetResults.set([]);
    this.updateTargetSearch('');
    this.targetError.set(false);
    this.targetLoading.set(false);
    this.formError.set(null);
    this.submitted.set(false);
    this.form.markAsPristine();
  }

  private updateIntervalValidators(
    kind: NotificationKind,
    previousKind: NotificationKind,
  ): void {
    const wasArrival =
      previousKind === 'rail_arrivals' || previousKind === 'bus_arrivals';
    const isArrival = kind === 'rail_arrivals' || kind === 'bus_arrivals';
    const minimum = kind === 'rail_arrivals' || kind === 'bus_arrivals' ? 1 : 5;
    const control = this.form.controls.intervalMinutes;
    control.setValidators([
      Validators.required,
      Validators.min(minimum),
      Validators.max(120),
    ]);
    if (isArrival && !wasArrival) {
      control.setValue(5, { emitEvent: false });
    } else if (!isArrival && wasArrival) {
      control.setValue(15, { emitEvent: false });
    } else if (control.value < minimum) {
      control.setValue(minimum, { emitEvent: false });
    }
    control.updateValueAndValidity({ emitEvent: false });
  }
}

function isSmartNotificationKind(kind: NotificationKind): boolean {
  return kind === 'rail_status' || kind === 'bus_notices';
}
