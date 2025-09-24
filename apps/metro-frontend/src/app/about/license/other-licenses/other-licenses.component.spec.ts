import { ComponentFixture, TestBed } from '@angular/core/testing';

import { OtherLicensesComponent } from './other-licenses.component';

describe('OtherLicensesComponent', () => {
  let component: OtherLicensesComponent;
  let fixture: ComponentFixture<OtherLicensesComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OtherLicensesComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(OtherLicensesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
