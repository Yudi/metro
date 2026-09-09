import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ScheduledDeparturesComponent } from './scheduled-departures.component';

describe('ScheduledDeparturesComponent', () => {
  let fixture: ComponentFixture<ScheduledDeparturesComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ScheduledDeparturesComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(ScheduledDeparturesComponent);
  });

  it('groups departures by hour and alternates their visual treatment', () => {
    fixture.componentRef.setInput('times', ['06:00', '06:30', '07:00']);
    fixture.detectChanges();

    const groups = fixture.nativeElement.querySelectorAll('.departure-group');
    expect(groups).toHaveLength(2);
    expect(groups[0].classList.contains('alternate-hour')).toBe(false);
    expect(groups[1].classList.contains('alternate-hour')).toBe(true);
    expect(groups[0].textContent).toContain('06:00');
    expect(groups[0].textContent).toContain('06:30');
  });

  it('uses the supplied time formatter for labels and departure text', () => {
    fixture.componentRef.setInput('times', ['06:00']);
    fixture.componentRef.setInput('formatTime', (time: string) =>
      time.replace(':00', 'h'),
    );
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('06h');
    expect(fixture.nativeElement.querySelector('ul').ariaLabel).toContain('06h');
  });
});
