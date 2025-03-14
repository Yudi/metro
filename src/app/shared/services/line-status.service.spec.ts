import { TestBed } from '@angular/core/testing';

import { LineStatusService } from './line-status.service';

describe('LineStatusService', () => {
  let service: LineStatusService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(LineStatusService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
