import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { API_BASE_URL } from '@metro/shared/api';
import { Line89NextTrainService } from './line-8-9-next-train.service';

describe('Line89NextTrainService', () => {
  let service: Line89NextTrainService;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        { provide: API_BASE_URL, useValue: '/api' },
      ],
    });
    service = TestBed.inject(Line89NextTrainService);
  });
  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
