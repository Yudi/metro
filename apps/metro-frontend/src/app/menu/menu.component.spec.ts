import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '@metro/shared/firebase';
import { MenuComponent } from './menu.component';

describe('MenuComponent', () => {
  let component: MenuComponent;
  let fixture: ComponentFixture<MenuComponent>;

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
