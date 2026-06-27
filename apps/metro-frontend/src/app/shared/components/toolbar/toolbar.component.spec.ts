import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  ActivatedRoute,
  convertToParamMap,
  provideRouter,
  Router,
} from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { ToolbarComponent } from './toolbar.component';

describe('ToolbarComponent', () => {
  let component: ToolbarComponent;
  let fixture: ComponentFixture<ToolbarComponent>;
  let queryParamMap: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  let router: Router;

  beforeEach(async () => {
    queryParamMap = new BehaviorSubject(convertToParamMap({}));

    await TestBed.configureTestingModule({
      imports: [ToolbarComponent],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              queryParamMap: queryParamMap.value,
            },
            queryParamMap: queryParamMap.asObservable(),
          },
        },
      ],
    }).compileComponents();

    router = TestBed.inject(Router);
    fixture = TestBed.createComponent(ToolbarComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('shows a back route for whitelisted app paths', () => {
    queryParamMap.next(convertToParamMap({ back: '/mapa' }));

    expect(component.backRoute()).toBe('/mapa');
  });

  it('ignores external back routes', () => {
    queryParamMap.next(convertToParamMap({ back: 'https://example.com' }));

    expect(component.backRoute()).toBeNull();
  });

  it('ignores routes outside the whitelist', () => {
    queryParamMap.next(convertToParamMap({ back: '/admin' }));

    expect(component.backRoute()).toBeNull();
  });

  it('navigates to the sanitized back route', () => {
    const navigateByUrl = jest
      .spyOn(router, 'navigateByUrl')
      .mockResolvedValue(true);

    queryParamMap.next(convertToParamMap({ back: '/favoritos' }));
    component.navigateBack();

    expect(navigateByUrl).toHaveBeenCalledWith('/favoritos');
  });
});
