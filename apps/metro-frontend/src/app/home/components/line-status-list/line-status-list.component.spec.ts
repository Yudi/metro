import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LineStatusListComponent } from '../line-status/line-status.component';

describe('LineStatusListComponent', () => {
  let component: LineStatusListComponent;
  let fixture: ComponentFixture<LineStatusListComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LineStatusListComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(LineStatusListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
