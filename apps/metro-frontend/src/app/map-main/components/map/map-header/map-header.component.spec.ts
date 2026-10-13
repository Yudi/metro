import { FormControl } from '@angular/forms';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CityContextService } from '../../../../cities/city-context.service';
import { MapHeaderComponent } from './map-header.component';

describe('MapHeaderComponent', () => {
  let fixture: ComponentFixture<MapHeaderComponent>;
  let component: MapHeaderComponent;
  let searchClick: jest.Mock;

  beforeEach(() => {
    searchClick = jest.fn();
    TestBed.configureTestingModule({
      imports: [MapHeaderComponent],
      providers: [
        {
          provide: CityContextService,
          useValue: { city: () => ({ name: 'São Paulo' }) },
        },
      ],
    });

    fixture = TestBed.createComponent(MapHeaderComponent);
    component = fixture.componentInstance;
    component.searchClick.subscribe(searchClick);
    fixture.detectChanges();
  });

  afterEach(() => fixture.destroy());

  it('emits for nonempty values from the current control and ignores replaced controls', () => {
    const firstControl = new FormControl('', { nonNullable: true });
    fixture.componentRef.setInput('searchControl', firstControl);
    fixture.detectChanges();

    firstControl.setValue('linha');
    firstControl.setValue('   ');
    expect(searchClick).toHaveBeenCalledTimes(1);

    fixture.componentRef.setInput('searchOpen', true);
    fixture.detectChanges();
    firstControl.setValue('parada');
    expect(searchClick).toHaveBeenCalledTimes(1);

    fixture.componentRef.setInput('searchOpen', false);
    const replacementControl = new FormControl('', { nonNullable: true });
    fixture.componentRef.setInput('searchControl', replacementControl);
    fixture.detectChanges();

    firstControl.setValue('old control');
    replacementControl.setValue('new control');
    expect(searchClick).toHaveBeenCalledTimes(2);
  });

  it('opens search from the icon button and focuses the input without scrolling', () => {
    const searchButton = fixture.nativeElement.querySelector(
      'button[aria-label="Pesquisar linhas e paradas"]',
    ) as HTMLButtonElement;
    expect(searchButton).not.toBeNull();
    searchButton.click();
    expect(searchClick).toHaveBeenCalledTimes(1);

    const input = fixture.nativeElement.querySelector(
      'input[type="search"]',
    ) as HTMLInputElement;
    const focus = jest.spyOn(input, 'focus');
    component.focusSearch();
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
  });
});
