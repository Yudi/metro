import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Line9Component } from './line-9.component';

describe('Line9Component', () => {
  let component: Line9Component;
  let fixture: ComponentFixture<Line9Component>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Line9Component]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Line9Component);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
