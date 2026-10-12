import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService, firebaseUser, firebaseIdToken } from '@metro/shared/firebase';
import { ADMIN_ACCOUNT_FIXTURE } from '@metro/shared/admin-contracts';
import type { User } from 'firebase/auth';
import { MenuComponent } from './menu.component';

describe('MenuComponent', () => {
  let component: MenuComponent;
  let fixture: ComponentFixture<MenuComponent>;

  afterEach(() => {
    firebaseUser.set(null);
    firebaseIdToken.set(null);
  });

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MenuComponent],
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: {
            loginGoogle: jest.fn(),
            logout: jest.fn(),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(MenuComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('shows the admin destination only for a boolean Firebase admin claim', () => {
    const links = () => [...fixture.nativeElement.querySelectorAll('a')]
      .map((link) => (link as HTMLAnchorElement).textContent);
    expect(links().some((text) => text?.includes('Administração'))).toBe(false);
    firebaseUser.set({ uid: ADMIN_ACCOUNT_FIXTURE.uid } as User);
    firebaseIdToken.set(`header.${btoa(JSON.stringify({ admin: true }))}.signature`);
    fixture.detectChanges();
    expect(links().some((text) => text?.includes('Administração'))).toBe(true);
    firebaseIdToken.set(`header.${btoa(JSON.stringify({ admin: false }))}.signature`);
    fixture.detectChanges();
    expect(links().some((text) => text?.includes('Administração'))).toBe(false);
  });

  it('lists useful phones immediately before the about page', () => {
    const ungroupedItems = component.menuList['null'];

    expect(ungroupedItems.slice(0, 2)).toEqual([
      expect.objectContaining({
        label: 'Telefones úteis',
        route: '/telefones',
      }),
      expect.objectContaining({ label: 'Sobre', route: '/sobre' }),
    ]);
  });
});

describe('menu search handoff', () => {
  it('buffers typing across lazy loading, mirrors dialog edits, and restores focus without reopening', async () => {
    const { MatDialog } = await import('@angular/material/dialog');
    const { Subject } = await import('rxjs');
    const closed = new Subject<void>();
    const focusSearch = jest.fn(() => {
      expect(component.searchOpen()).toBe(false);
    });
    const open = jest.fn().mockReturnValue({
      componentInstance: { focusSearch },
      afterClosed: () => closed,
    });
    TestBed.configureTestingModule({
      imports: [MenuComponent],
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: { loginGoogle: jest.fn(), logout: jest.fn() },
        },
      ],
    });
    TestBed.overrideProvider(MatDialog, { useValue: { open } });
    const fixture = TestBed.createComponent(MenuComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    const opening = component.openSearch();
    expect(component.searchOpen()).toBe(false);
    component.searchControl.setValue('Pin');
    component.searchControl.setValue('Pinheiros');
    await opening;

    expect(open).toHaveBeenCalledTimes(1);
    expect(focusSearch).toHaveBeenCalledTimes(1);
    expect(component.searchOpen()).toBe(true);
    const options = open.mock.calls[0][1];
    expect(options).toEqual(
      expect.objectContaining({
        autoFocus: 'input',
        delayFocusTrap: false,
      }),
    );
    const received: string[] = [];
    const subscription = options.data.queryChanges.subscribe((query: string) =>
      received.push(query),
    );
    expect(received).toEqual(['Pinheiros']);
    component.searchControl.setValue('Pinheiros estação');
    expect(received).toEqual(['Pinheiros', 'Pinheiros estação']);

    options.data.onQueryChange('Consolação');
    expect(component.searchControl.value).toBe('Consolação');
    expect(received).toHaveLength(2);
    closed.next();
    fixture.detectChanges();
    expect(document.activeElement).toBe(
      fixture.nativeElement.querySelector('input'),
    );
    expect(open).toHaveBeenCalledTimes(1);
    expect(component.searchOpen()).toBe(false);
    await component.openSearch();
    expect(open).toHaveBeenCalledTimes(2);
    subscription.unsubscribe();
  });
});
