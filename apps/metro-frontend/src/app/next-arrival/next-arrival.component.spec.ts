import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NextArrivalComponent } from './next-arrival.component';
describe('NextArrivalComponent', () => {
  let component: NextArrivalComponent;
  let fixture: ComponentFixture<NextArrivalComponent>;
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NextArrivalComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(NextArrivalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });
  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
