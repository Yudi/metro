import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { MatDialog } from '@angular/material/dialog';
import { FavoritesService } from '@metro/shared/api';
import { AnonymousFavoritesImportDialogComponent } from './anonymous-favorites-import-dialog.component';
import { AnonymousFavoritesImportPromptService } from './anonymous-favorites-import-prompt.service';

@Component({ template: '' })
class TestHostComponent {}

describe('anonymous favorites login consent', () => {
  const count = signal<number | null>(null);
  const importFavorites = jest.fn();
  const discardFavorites = jest.fn();

  beforeEach(() => {
    count.set(null);
    importFavorites.mockReset();
    discardFavorites.mockReset();
    TestBed.configureTestingModule({
      imports: [TestHostComponent, AnonymousFavoritesImportDialogComponent],
      providers: [
        {
          provide: FavoritesService,
          useValue: {
            anonymousFavoritesImportCount: count.asReadonly(),
            importAnonymousFavorites: importFavorites,
            discardAnonymousFavorites: discardFavorites,
          },
        },
      ],
    });
  });

  it('opens on a pending login import outside the favorites page and closes on logout', async () => {
    TestBed.inject(AnonymousFavoritesImportPromptService);
    const fixture = TestBed.createComponent(TestHostComponent);
    await fixture.whenStable();
    const dialog = TestBed.inject(MatDialog);
    expect(dialog.openDialogs).toHaveLength(0);

    count.set(2);
    await fixture.whenStable();
    expect(dialog.openDialogs).toHaveLength(1);
    expect(importFavorites).not.toHaveBeenCalled();

    const closed = firstValueFrom(dialog.openDialogs[0].afterClosed());
    count.set(null);
    await fixture.whenStable();
    await closed;
    expect(dialog.openDialogs).toHaveLength(0);
  });

  it('does not import or discard on dismissal', async () => {
    TestBed.inject(AnonymousFavoritesImportPromptService);
    const fixture = TestBed.createComponent(TestHostComponent);
    count.set(2);
    await fixture.whenStable();
    TestBed.inject(MatDialog).closeAll();
    await fixture.whenStable();
    expect(importFavorites).not.toHaveBeenCalled();
    expect(discardFavorites).not.toHaveBeenCalled();
    expect(count()).toBe(2);
  });

  it('requires an explicit transfer click', async () => {
    count.set(2);
    const fixture = TestBed.createComponent(
      AnonymousFavoritesImportDialogComponent,
    );
    await fixture.whenStable();
    expect(importFavorites).not.toHaveBeenCalled();
    const buttons = fixture.nativeElement.querySelectorAll('button');
    buttons[2].click();
    await fixture.whenStable();
    expect(importFavorites).toHaveBeenCalledTimes(1);
    expect(discardFavorites).not.toHaveBeenCalled();
  });

  it('prevents duplicate choices and allows retry after a storage failure', async () => {
    count.set(1);
    discardFavorites.mockRejectedValueOnce(new Error('storage unavailable'));
    const fixture = TestBed.createComponent(
      AnonymousFavoritesImportDialogComponent,
    );
    await fixture.whenStable();
    const first = fixture.componentInstance.resolve(false);
    await fixture.componentInstance.resolve(true);
    await first;
    await fixture.whenStable();
    expect(importFavorites).not.toHaveBeenCalled();
    expect(
      fixture.nativeElement.querySelector('[role="alert"]').textContent,
    ).toContain('Não foi possível salvar sua escolha');
    expect(fixture.componentInstance.pending()).toBe(false);
    await fixture.componentInstance.resolve(false);
    expect(discardFavorites).toHaveBeenCalledTimes(2);
  });
});
