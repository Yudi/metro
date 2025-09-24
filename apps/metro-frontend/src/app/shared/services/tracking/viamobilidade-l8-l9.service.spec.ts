import { TestBed } from '@angular/core/testing';

import { ViamobilidadeL8L9Service } from './viamobilidade-l8-l9.service';

describe('ViamobilidadeL8L9Service', () => {
  let service: ViamobilidadeL8L9Service;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ViamobilidadeL8L9Service);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
