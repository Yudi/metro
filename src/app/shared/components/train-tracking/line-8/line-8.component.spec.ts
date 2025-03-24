import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Line8Component } from './line-8.component';

describe('Line8Component', () => {
  let component: Line8Component;
  let fixture: ComponentFixture<Line8Component>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Line8Component]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Line8Component);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
