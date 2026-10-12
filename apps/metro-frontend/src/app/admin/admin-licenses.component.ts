import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  signal,
} from '@angular/core';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import type { ImageCopyright } from '@metro/shared/admin-contracts';
import { firstValueFrom } from 'rxjs';
import { AdminApiService } from './admin-api.service';

type LoadState = 'loading' | 'ready' | 'error';
type EditorMode = 'create' | 'edit' | null;

@Component({
  selector: 'app-admin-licenses',
  imports: [
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSnackBarModule,
    ReactiveFormsModule,
  ],
  templateUrl: './admin-licenses.component.html',
  styleUrl: './admin-licenses.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminLicensesComponent {
  private readonly api = inject(AdminApiService);
  private readonly snackBar = inject(MatSnackBar);

  readonly licenses = signal<readonly ImageCopyright[]>([]);
  readonly loadState = signal<LoadState>('loading');
  readonly loadError = signal<string | null>(null);
  readonly actionError = signal<string | null>(null);
  readonly mode = signal<EditorMode>(null);
  readonly editingId = signal<string | null>(null);
  readonly saving = signal(false);
  readonly pendingDeleteId = signal<string | null>(null);
  readonly deletingId = signal<string | null>(null);

  readonly form = new FormGroup({
    license: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(128)],
    }),
    licenseUrl: new FormControl('', {
      nonNullable: true,
      validators: [Validators.pattern(/^https?:\/\/\S+$/i), Validators.maxLength(2048)],
    }),
  });

  private loadGeneration = 0;
  private readonly sessionRevision = this.api.sessionRevision;

  constructor() {
    let observedRevision = this.sessionRevision();
    effect(() => {
      const revision = this.sessionRevision();
      if (revision === observedRevision) return;
      observedRevision = revision;
      this.loadGeneration += 1;
      this.licenses.set([]);
      this.mode.set(null);
      this.editingId.set(null);
      this.pendingDeleteId.set(null);
      this.saving.set(false);
      this.deletingId.set(null);
      this.form.reset({ license: '', licenseUrl: '' });
      this.loadState.set('loading');
    });
    void this.loadLicenses();
  }

  async loadLicenses(): Promise<void> {
    const generation = ++this.loadGeneration;
    this.loadState.set('loading');
    this.loadError.set(null);
    try {
      const licenses = await firstValueFrom(this.api.listCopyrights());
      if (generation !== this.loadGeneration) return;
      this.licenses.set(licenses);
      this.loadState.set('ready');
    } catch {
      if (generation !== this.loadGeneration) return;
      this.loadState.set('error');
      this.loadError.set('Não foi possível carregar licenças. Tente novamente.');
    }
  }

  startCreate(): void {
    this.form.reset({ license: '', licenseUrl: '' });
    this.mode.set('create');
    this.editingId.set(null);
    this.pendingDeleteId.set(null);
    this.actionError.set(null);
  }

  startEdit(license: ImageCopyright): void {
    this.form.reset({
      license: license.license,
      licenseUrl: license.licenseUrl ?? '',
    });
    this.mode.set('edit');
    this.editingId.set(license.id);
    this.pendingDeleteId.set(null);
    this.actionError.set(null);
  }

  cancelEdit(): void {
    this.mode.set(null);
    this.editingId.set(null);
    this.actionError.set(null);
  }

  async save(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.saving()) return;

    const license = this.form.controls.license.value.trim();
    const licenseUrl = this.form.controls.licenseUrl.value.trim();
    const input = {
      license,
      ...(licenseUrl ? { licenseUrl } : {}),
    };
    const mode = this.mode();
    const id = this.editingId();
    if (!mode || (mode === 'edit' && !id)) return;

    const sessionRevision = this.sessionRevision();
    this.saving.set(true);
    this.actionError.set(null);
    try {
      if (mode === 'create') {
        await firstValueFrom(this.api.createCopyright(input));
      } else if (id) {
        await firstValueFrom(this.api.updateCopyright(id, input));
      }
      if (sessionRevision !== this.sessionRevision()) return;
      this.mode.set(null);
      this.editingId.set(null);
      this.snackBar.open(mode === 'create' ? 'Licença adicionada.' : 'Licença atualizada.', 'Fechar', {
        duration: 4000,
        politeness: 'polite',
        verticalPosition: 'bottom',
        panelClass: 'admin-feedback',
      });
      await this.loadLicenses();
    } catch (error: unknown) {
      if (sessionRevision === this.sessionRevision()) {
        this.actionError.set(this.apiErrorMessage(error, 'salvar'));
      }
    } finally {
      this.saving.set(false);
    }
  }

  askToDelete(license: ImageCopyright): void {
    this.actionError.set(null);
    this.pendingDeleteId.set(
      this.pendingDeleteId() === license.id ? null : license.id,
    );
  }

  async deleteLicense(license: ImageCopyright): Promise<void> {
    if (this.deletingId()) return;
    const sessionRevision = this.sessionRevision();
    this.actionError.set(null);
    this.deletingId.set(license.id);
    try {
      const deleted = await firstValueFrom(this.api.deleteCopyright(license.id));
      if (sessionRevision !== this.sessionRevision()) return;
      if (!deleted) {
        this.actionError.set('Licença não removida. Atualize a lista e tente novamente.');
        return;
      }
      this.pendingDeleteId.set(null);
      if (this.editingId() === license.id) this.cancelEdit();
      this.snackBar.open('Licença removida.', 'Fechar', {
        duration: 4000,
        politeness: 'polite',
        verticalPosition: 'bottom',
        panelClass: 'admin-feedback',
      });
      await this.loadLicenses();
    } catch (error: unknown) {
      if (sessionRevision === this.sessionRevision()) {
        this.actionError.set(this.apiErrorMessage(error, 'remover'));
      }
    } finally {
      this.deletingId.set(null);
    }
  }

  isSafeUrl(value: string | undefined): boolean {
    if (!value) return false;
    try {
      return ['http:', 'https:'].includes(new URL(value).protocol);
    } catch {
      return false;
    }
  }

  private apiErrorMessage(error: unknown, action: string): string {
    if (
      action === 'remover' &&
      error instanceof HttpErrorResponse &&
      [409, 422].includes(error.status)
    ) {
      return 'Licença em uso. Remova-a das imagens antes de apagar.';
    }
    if (error instanceof HttpErrorResponse && error.status === 422) {
      return 'Dados inválidos. Confira o nome e a URL.';
    }
    if (error instanceof HttpErrorResponse && error.status === 409) {
      return 'Licença alterada por outra pessoa. Atualize e tente novamente.';
    }
    if (error instanceof HttpErrorResponse && error.status === 403) {
      return 'Sem permissão para editar licenças. Entre novamente.';
    }
    return action === 'salvar'
      ? 'Não foi possível salvar. Tente novamente.'
      : 'Não foi possível remover. Tente novamente.';
  }
}
