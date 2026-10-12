import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  signal,
} from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import type { AdminAccount } from '@metro/shared/admin-contracts';
import { firebaseUser } from '@metro/shared/firebase';
import { firstValueFrom } from 'rxjs';
import { AdminApiService } from './admin-api.service';

type LoadState = 'loading' | 'ready' | 'error';

@Component({
  selector: 'app-admin-accounts',
  imports: [
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSnackBarModule,
    ReactiveFormsModule,
  ],
  templateUrl: './admin-accounts.component.html',
  styleUrl: './admin-accounts.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminAccountsComponent {
  private readonly api = inject(AdminApiService);
  private readonly snackBar = inject(MatSnackBar);

  readonly firebaseUser = firebaseUser;
  readonly accounts = signal<readonly AdminAccount[]>([]);
  readonly loadState = signal<LoadState>('loading');
  readonly loadError = signal<string | null>(null);
  readonly actionError = signal<string | null>(null);
  readonly adding = signal(false);
  readonly pendingDeleteUid = signal<string | null>(null);
  readonly deletingUid = signal<string | null>(null);
  readonly email = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.email, Validators.maxLength(254)],
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
      this.accounts.set([]);
      this.loadState.set('loading');
      this.loadError.set(null);
      this.pendingDeleteUid.set(null);
      this.adding.set(false);
      this.deletingUid.set(null);
    });
    void this.loadAccounts();
  }

  async loadAccounts(): Promise<void> {
    const generation = ++this.loadGeneration;
    this.loadState.set('loading');
    this.loadError.set(null);
    try {
      const accounts = await firstValueFrom(this.api.listAdmins());
      if (generation !== this.loadGeneration) return;
      this.accounts.set(accounts);
      this.loadState.set('ready');
    } catch {
      if (generation !== this.loadGeneration) return;
      this.loadState.set('error');
      this.loadError.set('Não foi possível carregar a lista. Tente novamente.');
    }
  }

  async addAccount(): Promise<void> {
    this.actionError.set(null);
    this.email.markAsTouched();
    if (this.email.invalid || this.adding()) return;

    const sessionRevision = this.sessionRevision();
    this.adding.set(true);
    try {
      await firstValueFrom(this.api.addAdmin(this.email.value.trim()));
      if (sessionRevision !== this.sessionRevision()) return;
      this.email.reset('');
      this.pendingDeleteUid.set(null);
      this.snackBar.open('Acesso concedido.', 'Fechar', {
        duration: 4000,
        politeness: 'polite',
        verticalPosition: 'bottom',
        panelClass: 'admin-feedback',
      });
      await this.loadAccounts();
    } catch (error: unknown) {
      if (sessionRevision === this.sessionRevision()) {
        this.actionError.set(this.accountErrorMessage(error));
      }
    } finally {
      this.adding.set(false);
    }
  }

  askToDelete(account: AdminAccount): void {
    this.actionError.set(null);
    this.pendingDeleteUid.set(
      this.pendingDeleteUid() === account.uid ? null : account.uid,
    );
  }

  cancelDelete(): void {
    this.pendingDeleteUid.set(null);
    this.actionError.set(null);
  }

  async deleteAccount(account: AdminAccount): Promise<void> {
    if (
      account.bootstrap ||
      account.uid === this.firebaseUser()?.uid ||
      this.deletingUid()
    ) {
      return;
    }

    const sessionRevision = this.sessionRevision();
    this.actionError.set(null);
    this.deletingUid.set(account.uid);
    try {
      const deleted = await firstValueFrom(this.api.deleteAdmin(account.uid));
      if (sessionRevision !== this.sessionRevision()) return;
      if (!deleted) {
        this.actionError.set('O acesso não foi removido. Atualize a lista e tente novamente.');
        return;
      }
      this.pendingDeleteUid.set(null);
      this.snackBar.open('Acesso removido.', 'Fechar', {
        duration: 4000,
        politeness: 'polite',
        verticalPosition: 'bottom',
        panelClass: 'admin-feedback',
      });
      await this.loadAccounts();
    } catch (error: unknown) {
      if (sessionRevision === this.sessionRevision()) {
        this.actionError.set(this.accountErrorMessage(error));
      }
    } finally {
      this.deletingUid.set(null);
    }
  }

  isCurrentAccount(account: AdminAccount): boolean {
    return account.uid === this.firebaseUser()?.uid;
  }

  emailError(): string {
    if (this.email.hasError('required')) return 'Informe um e-mail.';
    if (this.email.hasError('email')) return 'Use um e-mail válido.';
    return 'E-mail longo demais.';
  }

  private accountErrorMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse && error.status === 409) {
      return 'Este e-mail já tem acesso administrativo.';
    }
    if (error instanceof HttpErrorResponse && error.status === 403) {
      return 'Sem permissão para alterar acessos. Entre novamente.';
    }
    return 'Não foi possível alterar o acesso. Tente novamente.';
  }
}
