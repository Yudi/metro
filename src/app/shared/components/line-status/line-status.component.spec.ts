import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LineStatusComponent } from './line-status.component';

describe('LineStatusComponent', () => {
  let component: LineStatusComponent;
  let fixture: ComponentFixture<LineStatusComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LineStatusComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(LineStatusComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
