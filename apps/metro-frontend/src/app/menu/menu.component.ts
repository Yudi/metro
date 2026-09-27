import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NgOptimizedImage } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIcon } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { RouterLink } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { AuthService, authReady, firebaseUser } from '@metro/shared/firebase';
import { CityContextService } from '../cities/city-context.service';
import { menuDestinations } from './menu-destinations';

@Component({
  selector: 'app-menu',
  imports: [
    RouterLink,
    MatIcon,
    MatListModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    ReactiveFormsModule,
    NgOptimizedImage,
  ],
  templateUrl: './menu.component.html',
  styleUrl: './menu.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MenuComponent {
  private readonly dialog = inject(MatDialog);
  private readonly destroyRef = inject(DestroyRef);
  private readonly searchInput =
    viewChild<ElementRef<HTMLInputElement>>('searchInput');
  private readonly searchQueries = new BehaviorSubject('');
  private restoringFocus = false;
  readonly authService = inject(AuthService);
  readonly cityContext = inject(CityContextService);
  readonly authReady = authReady;
  readonly firebaseUser = firebaseUser;
  readonly searchControl = new FormControl('', { nonNullable: true });
  readonly searchOpen = signal(false);
  readonly searchError = signal('');
  readonly menuList = menuDestinations(this.cityContext.city());
  readonly sections = Object.keys(this.menuList);

  constructor() {
    this.searchControl.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((query) => {
        this.searchQueries.next(query);
        // Typing after Escape should reopen search even when focus stayed here.
        if (!this.searchOpen() && !this.restoringFocus) void this.openSearch();
      });
  }

  cityPath(path = ''): string {
    return this.cityContext.path(path);
  }

  async openSearch(): Promise<void> {
    if (this.restoringFocus || this.searchOpen()) return;
    this.searchOpen.set(true);
    this.searchError.set('');
    this.searchQueries.next(this.searchControl.value);

    try {
      const { OmniboxDialogComponent } = await import(
        '../omnibox/omnibox-dialog.component'
      );
      if (this.destroyRef.destroyed) return;

      const dialogRef = this.dialog.open(OmniboxDialogComponent, {
        width: '760px',
        maxWidth: 'calc(100vw - 24px)',
        maxHeight: '90dvh',
        autoFocus: 'input',
        restoreFocus: false,
        data: {
          // Replay includes typing during the lazy import; subsequent events bridge
          // the dialog animation until its own input receives focus.
          queryChanges: this.searchQueries.asObservable(),
          onQueryChange: (query: string) => {
            this.searchControl.setValue(query, { emitEvent: false });
          },
        },
      });
      dialogRef
        .afterClosed()
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe(() => {
          this.searchOpen.set(false);
          this.restoringFocus = true;
          this.searchInput()?.nativeElement.focus({ preventScroll: true });
          this.restoringFocus = false;
        });
    } catch {
      this.searchOpen.set(false);
      this.searchError.set('Não foi possível abrir a busca. Tente novamente.');
    }
  }

  login(): void {
    this.authService.loginGoogle();
  }

  logout(): void {
    this.authService.logout();
  }
}
