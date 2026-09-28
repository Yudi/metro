import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { BottomToolbarComponent } from './bottom-toolbar.component';

describe('BottomToolbarComponent', () => {
  let component: BottomToolbarComponent;
  let fixture: ComponentFixture<BottomToolbarComponent>;
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BottomToolbarComponent],
      providers: [provideRouter([])],
    }).compileComponents();
    fixture = TestBed.createComponent(BottomToolbarComponent);
    fixture.componentRef.setInput('items', []);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });
  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('sets --app-bottom-toolbar-height CSS variable', () => {
    const val = document.documentElement.style.getPropertyValue(
      '--app-bottom-toolbar-height',
    );
    // can be '0px' in JSDOM but must be set
    expect(val).toMatch(/^\d+px$/);
  });

  it('slides without changing its reserved height and removes hidden navigation from focus', () => {
    const toolbar: HTMLElement = fixture.nativeElement.querySelector('.bottom-toolbar');
    const reservedHeight = document.documentElement.style.getPropertyValue('--app-bottom-toolbar-height');
    fixture.componentRef.setInput('hideProgress', 0.5);
    fixture.componentRef.setInput('dragging', true);
    fixture.detectChanges();
    expect(toolbar.style.transform).toBe('translateY(50%)');
    expect(toolbar.classList.contains('is-dragging')).toBe(true);
    expect(toolbar.hasAttribute('inert')).toBe(false);
    expect(document.documentElement.style.getPropertyValue('--app-bottom-toolbar-height')).toBe(reservedHeight);

    fixture.componentRef.setInput('hideProgress', 1);
    fixture.componentRef.setInput('dragging', false);
    fixture.detectChanges();
    expect(toolbar.hasAttribute('inert')).toBe(true);
    expect(toolbar.classList.contains('is-dragging')).toBe(false);

    fixture.componentRef.setInput('hideProgress', 0);
    fixture.detectChanges();
    expect(toolbar.hasAttribute('inert')).toBe(false);
  });

});
