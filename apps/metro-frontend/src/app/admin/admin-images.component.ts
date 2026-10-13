import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { API_BASE_URL } from '@metro/shared/api';
import {
  ADMIN_IMAGE_PREVIEW_URL,
  resolveAdminImagePreviewUrl,
} from './admin-image-preview';
import type {
  AdminImageEntry,
  AdminImageInput,
  ImageCopyright,
  MediaResource,
} from '@metro/shared/admin-contracts';
import { RouterLink } from '@angular/router';
import {
  catchError,
  debounceTime,
  map,
  merge,
  of,
  Subject,
  startWith,
  switchMap,
} from 'rxjs';
import { firstValueFrom } from 'rxjs';
import { AdminApiService } from './admin-api.service';
import {
  adminImageFileError,
  createAdminImageInput,
} from './admin-image-input';

type LoadState = 'idle' | 'loading' | 'ready' | 'error';
type EditorMode = 'upload' | 'edit' | null;
type ResourceSearchResult = {
  readonly state: 'ready' | 'error';
  readonly resources: readonly MediaResource[];
  readonly generation: number;
};

const WEB_URL_PATTERN = /^https?:\/\/\S+$/i;

@Component({
  selector: 'app-admin-images',
  imports: [
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatSnackBarModule,
    ReactiveFormsModule,
    RouterLink,
  ],
  templateUrl: './admin-images.component.html',
  styleUrls: [
    './admin-images.component.scss',
    './admin-image-editor.scss',
    './admin-image-states.scss',
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminImagesComponent {
  private readonly api = inject(AdminApiService);
  private readonly apiUrl = inject(API_BASE_URL);
  private readonly previewUrl = inject(ADMIN_IMAGE_PREVIEW_URL);
  private readonly snackBar = inject(MatSnackBar);
  private readonly destroyRef = inject(DestroyRef);

  readonly search = new FormControl('', { nonNullable: true });
  readonly resources = signal<readonly MediaResource[]>([]);
  readonly resourceState = signal<LoadState>('idle');
  readonly resourceError = signal<string | null>(null);
  readonly selectedResource = signal<MediaResource | null>(null);
  readonly entries = signal<readonly AdminImageEntry[]>([]);
  readonly entryState = signal<LoadState>('idle');
  readonly entryError = signal<string | null>(null);
  readonly copyrights = signal<readonly ImageCopyright[]>([]);
  readonly copyrightsError = signal<string | null>(null);
  readonly mode = signal<EditorMode>(null);
  readonly editingKey = signal<string | null>(null);
  readonly selectedFile = signal<File | null>(null);
  readonly filePreviewUrl = signal<string | null>(null);
  readonly filePreviewError = signal(false);
  readonly fileError = signal<string | null>(null);
  readonly actionError = signal<string | null>(null);
  readonly pendingDeleteKey = signal<string | null>(null);
  readonly saving = signal(false);
  readonly deletingKey = signal<string | null>(null);
  readonly resourceScopeOptions = computed(
    () => this.selectedResource()?.scopes ?? [],
  );

  readonly form = new FormGroup({
    author: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(256)],
    }),
    title: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(1024)],
    }),
    label: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(160)],
    }),
    sourceUrl: new FormControl('', {
      nonNullable: true,
      validators: [Validators.pattern(WEB_URL_PATTERN), Validators.maxLength(2048)],
    }),
    copyrightId: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    lineIds: new FormControl<string[]>([], { nonNullable: true }),
    stopIds: new FormControl<string[]>([], { nonNullable: true }),
    serviceTrain: new FormControl(false, { nonNullable: true }),
    isDefault: new FormControl(false, { nonNullable: true }),
  });

  private imageRequestGeneration = 0;
  private searchGeneration = 0;
  private copyrightsGeneration = 0;
  private readonly refreshSearch = new Subject<void>();
  private readonly sessionRevision = this.api.sessionRevision;

  constructor() {
    let observedRevision = this.sessionRevision();
    effect(() => {
      const revision = this.sessionRevision();
      if (revision === observedRevision) return;
      observedRevision = revision;
      this.imageRequestGeneration += 1;
      this.searchGeneration += 1;
      this.copyrightsGeneration += 1;
      this.resources.set([]);
      this.selectedResource.set(null);
      this.entries.set([]);
      this.copyrights.set([]);
      this.resourceState.set('idle');
      this.entryState.set('idle');
      this.mode.set(null);
      this.editingKey.set(null);
      this.pendingDeleteKey.set(null);
      this.saving.set(false);
      this.deletingKey.set(null);
      this.clearSelectedFile();
      this.resetForm();
    });

    merge(
      this.search.valueChanges.pipe(startWith('')),
      this.refreshSearch.pipe(map(() => this.search.value)),
    )
      .pipe(
        map((query) => query.trim()),
        debounceTime(250),
        switchMap((query) => {
          const generation = ++this.searchGeneration;
          this.resourceState.set('loading');
          this.resourceError.set(null);
          this.resources.set([]);
          return this.api.searchMediaResources(query).pipe(
            map((resources): ResourceSearchResult => ({ state: 'ready', resources, generation })),
            catchError(() =>
              of<ResourceSearchResult>({ state: 'error', resources: [], generation }),
            ),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((result) => {
        if (result.generation !== this.searchGeneration) return;
        this.resources.set(result.resources);
        this.resourceState.set(result.state);
        this.resourceError.set(
          result.state === 'error'
            ? 'Busca indisponível. Tente novamente.'
            : null,
        );
      });

    void this.loadCopyrights();
    this.destroyRef.onDestroy(() => this.clearSelectedFile());
  }

  async chooseResource(resource: MediaResource): Promise<void> {
    if (this.saving() || this.deletingKey() !== null) return;
    this.selectedResource.set(resource);
    this.entries.set([]);
    this.entryError.set(null);
    this.entryState.set('loading');
    this.resetEditor();
    this.clearSelectedFile();
    const generation = ++this.imageRequestGeneration;
    try {
      const entries = await firstValueFrom(this.api.listImages(resource.identity));
      if (
        generation !== this.imageRequestGeneration ||
        this.selectedResource()?.identity !== resource.identity
      ) {
        return;
      }
      this.entries.set(entries);
      this.entryState.set('ready');
    } catch {
      if (generation !== this.imageRequestGeneration) return;
      this.entryState.set('error');
      this.entryError.set('Não foi possível carregar imagens. Tente novamente.');
    }
  }

  retryResourceSearch(): void {
    this.refreshSearch.next();
  }

  async retryEntries(): Promise<void> {
    const resource = this.selectedResource();
    if (resource) await this.chooseResource(resource);
  }

  async loadCopyrights(): Promise<void> {
    const generation = ++this.copyrightsGeneration;
    this.copyrightsError.set(null);
    try {
      const copyrights = await firstValueFrom(this.api.listCopyrights());
      if (generation !== this.copyrightsGeneration) return;
      this.copyrights.set(copyrights);
    } catch {
      if (generation !== this.copyrightsGeneration) return;
      this.copyrightsError.set('Não foi possível carregar licenças. Tente novamente.');
    }
  }

  startUpload(): void {
    if (!this.selectedResource() || this.saving() || this.deletingKey() !== null) {
      return;
    }
    this.resetEditor();
    this.mode.set('upload');
    this.editingKey.set(null);
    this.fileError.set(null);
    this.actionError.set(null);
  }

  startEdit(entry: AdminImageEntry): void {
    if (this.saving() || this.deletingKey() !== null) return;
    this.clearSelectedFile();
    this.form.enable({ emitEvent: false });
    this.mode.set('edit');
    this.editingKey.set(entry.key);
    this.pendingDeleteKey.set(null);
    this.fileError.set(null);
    this.actionError.set(null);
    this.form.reset({
      author: entry.author,
      title: entry.title,
      label: entry.label ?? '',
      sourceUrl: entry.sourceUrl ?? '',
      copyrightId: entry.copyrightId ?? '',
      lineIds: entry.isDefault ? [] : [...(entry.lineIds ?? [])],
      stopIds: entry.isDefault ? [] : [...entry.stopIds],
      serviceTrain: !entry.isDefault && entry.service === 'train',
      isDefault: entry.isDefault,
    });
    this.syncScopeControlAvailability(entry.isDefault);
  }

  cancelEdit(): void {
    this.resetEditor();
    this.clearSelectedFile();
  }

  onDefaultToggle(isDefault: boolean): void {
    if (isDefault) {
      this.form.controls.lineIds.setValue([]);
      this.form.controls.stopIds.setValue([]);
      this.form.controls.serviceTrain.setValue(false);
    }
    this.syncScopeControlAvailability(isDefault);
  }

  onScopeSelectionChanged(kind: 'station' | 'terminal'): void {
    const selectedCount = kind === 'station'
      ? this.form.controls.lineIds.value.length
      : this.form.controls.stopIds.value.length;
    if (selectedCount > 0 && this.form.controls.isDefault.value) {
      this.form.controls.isDefault.setValue(false);
    }
  }

  scopeOptionDisabled(kind: 'station' | 'terminal', id: string): boolean {
    if (this.form.controls.isDefault.value) return true;
    const selected = kind === 'station'
      ? this.form.controls.lineIds.value
      : this.form.controls.stopIds.value;
    const limit = kind === 'station' ? 8 : 64;
    return selected.length >= limit && !selected.includes(id);
  }

  onFileSelected(event: Event): void {
    this.fileError.set(null);
    const input = event.target;
    const file = input instanceof HTMLInputElement ? input.files?.[0] : undefined;
    if (!file) return;

    this.clearSelectedFile();
    const validationError = adminImageFileError(file);
    if (validationError) {
      this.fileError.set(validationError);
      return;
    }

    this.selectedFile.set(file);
    this.filePreviewUrl.set(URL.createObjectURL(file));
  }

  onFilePreviewError(): void {
    this.filePreviewError.set(true);
  }

  imageUrl(key: string): string | null {
    const category = this.selectedResource()?.kind ?? 'station';
    return resolveAdminImagePreviewUrl(
      key,
      category,
      this.apiUrl,
      this.previewUrl,
    );
  }

  resourceKindLabel(resource: MediaResource): string {
    switch (resource.kind) {
      case 'station':
        return 'Estação';
      case 'stop':
        return 'Parada';
      case 'terminal':
        return 'Terminal';
    }
  }

  resourceScopeSummary(resource: MediaResource): string {
    if (resource.kind === 'station') {
      const count = resource.scopes.length;
      return `${count} ${count === 1 ? 'linha' : 'linhas'}`;
    }
    if (resource.kind === 'terminal') {
      const count = resource.scopes.length;
      return `${count} ${count === 1 ? 'plataforma' : 'plataformas'}`;
    }
    return '';
  }

  entryScopeSummary(entry: AdminImageEntry): string {
    const resource = this.selectedResource();
    if (!resource) return '';
    if (resource.kind === 'station') {
      const lineLabels = (entry.lineIds ?? []).map(
        (id) => resource.scopes.find((scope) => scope.id === id)?.label ?? id,
      );
      const summary = lineLabels.join(', ');
      if (entry.service === 'train') {
        return summary ? `${summary} (imagem de trens)` : 'Imagem de trens';
      }
      return summary;
    }
    if (resource.kind === 'terminal') {
      if (!entry.stopIds.length) return 'Todas as plataformas';
      const labels = entry.stopIds.map(
        (id) => resource.scopes.find((scope) => scope.id === id)?.label ?? id,
      );
      return labels.join(', ');
    }
    return '';
  }

  async save(): Promise<void> {
    const resource = this.selectedResource();
    const mode = this.mode();
    const key = this.editingKey();
    if (!resource || !mode || this.saving()) return;

    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    if (mode === 'upload' && !this.selectedFile()) {
      this.fileError.set('Selecione um arquivo JPEG, PNG, WebP, AVIF, HEIC ou HEIF.');
      return;
    }

    const metadata = this.createImageInput(resource);

    const sessionRevision = this.sessionRevision();
    this.saving.set(true);
    this.form.disable({ emitEvent: false });
    this.actionError.set(null);
    try {
      if (mode === 'upload') {
        const file = this.selectedFile();
        if (!file) return;
        await firstValueFrom(this.api.uploadImage(file, metadata));
      } else {
        if (!key) return;
        await firstValueFrom(this.api.updateImage(key, metadata));
      }
      if (!this.isCurrentImageContext(resource, mode, key, sessionRevision)) {
        return;
      }
      if (mode === 'upload') {
        this.snackBar.open('Imagem enviada.', 'Fechar', {
          duration: 4000,
          politeness: 'polite',
          verticalPosition: 'bottom',
          panelClass: 'admin-feedback',
        });
      } else {
        this.snackBar.open('Metadados atualizados.', 'Fechar', {
          duration: 4000,
          politeness: 'polite',
          verticalPosition: 'bottom',
          panelClass: 'admin-feedback',
        });
      }
      this.resetEditor();
      this.clearSelectedFile();
      await this.refreshEntries(resource);
    } catch (error: unknown) {
      if (this.isCurrentImageContext(resource, mode, key, sessionRevision)) {
        this.actionError.set(this.imageErrorMessage(error, mode));
      }
    } finally {
      this.form.enable({ emitEvent: false });
      this.syncScopeControlAvailability(this.form.controls.isDefault.value);
      this.saving.set(false);
    }
  }

  askToDelete(entry: AdminImageEntry): void {
    if (this.saving() || this.deletingKey() !== null) return;
    this.actionError.set(null);
    this.pendingDeleteKey.set(
      this.pendingDeleteKey() === entry.key ? null : entry.key,
    );
  }

  async deleteEntry(entry: AdminImageEntry): Promise<void> {
    if (this.saving() || this.deletingKey()) return;
    const resource = this.selectedResource();
    if (!resource) return;
    const mode = this.mode();
    const key = this.editingKey();
    const sessionRevision = this.sessionRevision();
    this.deletingKey.set(entry.key);
    this.actionError.set(null);
    try {
      const deleted = await firstValueFrom(this.api.deleteImage(entry.key));
      if (!this.isCurrentImageContext(resource, mode, key, sessionRevision)) {
        return;
      }
      if (!deleted) {
        this.actionError.set('A imagem não foi removida. Atualize a lista e tente novamente.');
        return;
      }
      this.pendingDeleteKey.set(null);
      if (this.editingKey() === entry.key) this.resetEditor();
      this.snackBar.open('Imagem removida.', 'Fechar', {
        duration: 4000,
        politeness: 'polite',
        verticalPosition: 'bottom',
        panelClass: 'admin-feedback',
      });
      await this.refreshEntries(resource);
    } catch (error: unknown) {
      if (this.isCurrentImageContext(resource, mode, key, sessionRevision)) {
        this.actionError.set(this.imageErrorMessage(error, 'delete'));
      }
    } finally {
      this.deletingKey.set(null);
    }
  }

  private async refreshEntries(
    resource: MediaResource,
    selectedKey = this.editingKey(),
  ): Promise<void> {
    const generation = ++this.imageRequestGeneration;
    this.entryState.set('loading');
    this.entryError.set(null);
    try {
      const entries = await firstValueFrom(this.api.listImages(resource.identity));
      if (
        generation !== this.imageRequestGeneration ||
        this.selectedResource()?.identity !== resource.identity
      ) {
        return;
      }
      this.entries.set(entries);
      this.entryState.set('ready');
      const selected = selectedKey
        ? entries.find((entry) => entry.key === selectedKey)
        : undefined;
      if (selected) {
        this.startEdit(selected);
      }
    } catch {
      if (generation !== this.imageRequestGeneration) return;
      this.entryState.set('error');
      this.entryError.set('Alteração salva, mas a lista não atualizou. Tente novamente.');
    }
  }

  private createImageInput(resource: MediaResource): AdminImageInput {
    const controls = this.form.controls;
    return createAdminImageInput(resource, {
      author: controls.author.value.trim(),
      title: controls.title.value.trim(),
      label: controls.label.value,
      sourceUrl: controls.sourceUrl.value.trim() || undefined,
      copyrightId: controls.copyrightId.value,
      lineIds: controls.lineIds.value,
      stopIds: controls.stopIds.value,
      service: controls.serviceTrain.value ? 'train' : undefined,
      isDefault: controls.isDefault.value,
    });
  }

  private isCurrentImageContext(
    resource: MediaResource,
    mode: EditorMode,
    key: string | null,
    sessionRevision: number,
  ): boolean {
    return (
      sessionRevision === this.sessionRevision() &&
      this.selectedResource()?.identity === resource.identity &&
      this.mode() === mode &&
      this.editingKey() === key
    );
  }

  private imageErrorMessage(
    error: unknown,
    operation: 'upload' | 'edit' | 'delete',
  ): string {
    if (error instanceof HttpErrorResponse && error.status === 409) {
      if (operation === 'upload') {
        return 'Limite de 12 imagens por local. Remova uma para enviar outra.';
      }
      if (operation === 'edit') return 'Confira os dados e atualize a lista.';
      return 'Não foi possível remover a imagem. Atualize a lista e tente novamente.';
    }
    if (error instanceof HttpErrorResponse && error.status === 413) {
      return 'Arquivo acima de 10 MiB. Escolha uma imagem menor.';
    }
    if (error instanceof HttpErrorResponse && error.status === 415) {
      return 'Este formato não pôde ser convertido neste servidor. Para HEIC, exporte JPEG ou PNG e tente novamente.';
    }
    if (error instanceof HttpErrorResponse && error.status === 429) {
      return 'Muitas imagens estão sendo convertidas agora. Aguarde alguns segundos e tente novamente.';
    }
    if (error instanceof HttpErrorResponse && error.status === 422) {
      return 'Dados inválidos. Confira os campos e tente novamente.';
    }
    if (error instanceof HttpErrorResponse && error.status === 403) {
      return 'Sem permissão para editar imagens. Entre novamente.';
    }
    return 'Não foi possível salvar. Os dados estão no formulário. Tente novamente.';
  }

  private resetEditor(): void {
    this.mode.set(null);
    this.editingKey.set(null);
    this.pendingDeleteKey.set(null);
    this.fileError.set(null);
    this.actionError.set(null);
    this.resetForm();
  }

  private resetForm(): void {
    this.form.enable({ emitEvent: false });
    this.form.reset({
      author: '',
      title: '',
      label: '',
      sourceUrl: '',
      copyrightId: '',
      lineIds: [],
      stopIds: [],
      serviceTrain: false,
      isDefault: false,
    });
    this.syncScopeControlAvailability(false);
  }

  private syncScopeControlAvailability(isDefault: boolean): void {
    if (isDefault) {
      this.form.controls.lineIds.disable({ emitEvent: false });
      this.form.controls.stopIds.disable({ emitEvent: false });
      this.form.controls.serviceTrain.disable({ emitEvent: false });
      return;
    }
    this.form.controls.lineIds.enable({ emitEvent: false });
    this.form.controls.stopIds.enable({ emitEvent: false });
    this.form.controls.serviceTrain.enable({ emitEvent: false });
  }

  private clearSelectedFile(): void {
    const previewUrl = this.filePreviewUrl();
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    this.filePreviewUrl.set(null);
    this.filePreviewError.set(false);
    this.selectedFile.set(null);
    this.fileError.set(null);
  }
}
