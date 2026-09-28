import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
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
  private readonly injector = inject(Injector);
  private readonly searchInput =
    viewChild<ElementRef<HTMLInputElement>>('searchInput');
  private readonly searchQueries = new BehaviorSubject('');
  private restoringFocus = false;
  private openingSearch = false;
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
        if (query && !this.searchOpen() && !this.restoringFocus) {
          void this.openSearch();
        }
      });
  }

  cityPath(path = ''): string {
    return this.cityContext.path(path);
  }

  async openSearch(): Promise<void> {
    if (this.restoringFocus || this.searchOpen() || this.openingSearch) return;
    this.openingSearch = true;
    this.searchError.set('');
    this.searchQueries.next(this.searchControl.value);

    try {
      const { OmniboxDialogComponent } = await import(
        '../omnibox/omnibox-dialog.component'
      );
      if (this.destroyRef.destroyed) return;

      // Keep the trigger visible while the lazy dialog chunk loads so typing
      // continues to reach it; replay the latest value when the dialog opens.
      this.searchQueries.next(this.searchControl.value);
      this.searchOpen.set(true);
      const dialogRef = this.dialog.open(OmniboxDialogComponent, {
        width: '760px',
        maxWidth: 'calc(100vw - 24px)',
        maxHeight: '90dvh',
        autoFocus: 'input',
        // Accept typing as soon as the dialog renders, including during its animation.
        delayFocusTrap: false,
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
          afterNextRender(
            () => {
              this.restoringFocus = true;
              this.searchInput()?.nativeElement.focus({ preventScroll: true });
              this.restoringFocus = false;
            },
            { injector: this.injector },
          );
        });
    } catch {
      this.searchOpen.set(false);
      this.searchError.set('Não foi possível abrir a busca. Tente novamente.');
    } finally {
      this.openingSearch = false;
    }
  }

  login(): void {
    this.authService.loginGoogle();
  }

  logout(): void {
    this.authService.logout();
  }
}
