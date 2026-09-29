import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { API_BASE_URL } from '@metro/shared/api';
import { StationImagesService } from './station-images.service';
import { StationImageManifest } from './station-images';

const manifest: StationImageManifest = {
  version: 1,
  stations: {
    luz: [{
      key: 'station-images/metro/luz.avif', author: 'Autor', title: 'Luz',
      sourceUrl: 'https://commons.wikimedia.org/', license: 'CC0',
    }],
  },
};

describe('StationImagesService', () => {
  let service: StationImagesService;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [
      provideHttpClient(), provideHttpClientTesting(),
      { provide: API_BASE_URL, useValue: '/api' },
    ] });
    service = TestBed.inject(StationImagesService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('loads metadata once and constructs only backend proxy image URLs', () => {
    service.load();
    service.load();
    expect(service.image('Luz')).toBeUndefined();
    http.expectOne('/api/media/station-images').flush(manifest);
    service.load();
    expect(service.image('LUZ')?.src).toBe('/api/media/station-images/files/metro/luz.avif');
    expect(service.image('Varginha')).toBeUndefined();
    expect(service.image('constructor')).toBeUndefined();
  });

  it('allows a later station opening to retry after metadata fails', () => {
    service.load();
    http.expectOne('/api/media/station-images').flush('', { status: 503, statusText: 'Unavailable' });
    expect(service.image('Luz')).toBeUndefined();
    service.load();
    http.expectOne('/api/media/station-images').flush(manifest);
    expect(service.image('Luz')).toBeDefined();
  });

  it('removes failed images instead of leaving a broken header', () => {
    service.load();
    http.expectOne('/api/media/station-images').flush(manifest);
    service.markUnavailable('station-images/metro/luz.avif');
    expect(service.image('Luz')).toBeUndefined();
  });
});
