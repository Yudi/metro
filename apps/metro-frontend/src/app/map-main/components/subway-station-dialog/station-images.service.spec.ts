import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { API_BASE_URL } from '@metro/shared/api';
import { StationImagesService } from './station-images.service';
import { StationImageManifest } from './station-images';

const manifest: StationImageManifest = {
  version: 1,
  stations: {
    luz: [
      {
        key: 'station-images/metro/luz.avif',
        author: 'Autor',
        title: 'Luz',
        sourceUrl: 'https://commons.wikimedia.org/',
        license: 'CC0',
      },
    ],
  },
};

describe('StationImagesService', () => {
  let service: StationImagesService;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: '/api' },
      ],
    });
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
    expect(service.image('LUZ')?.src).toBe(
      '/api/media/station-images/files/metro/luz.avif',
    );
    expect(service.terminalImage('terminal:terminal-parque-central')).toBeUndefined();
    expect(service.image('Varginha')).toBeUndefined();
    expect(service.image('constructor')).toBeUndefined();
  });

  it('looks up terminals by exact catalog ID without using rail station keys', () => {
    const terminalManifest: StationImageManifest = {
      ...manifest,
      terminals: {
        'terminal:terminal-parque-central': [
          {
            key: 'station-images/terminal/terminal-parque-central.avif',
            author: 'Autor do terminal',
            title: 'Terminal Parque Central',
            sourceUrl: 'https://commons.wikimedia.org/terminal',
            license: 'CC BY 4.0',
            licenseUrl: 'https://creativecommons.org/licenses/by/4.0',
          },
        ],
      },
    };
    service.load();
    http.expectOne('/api/media/station-images').flush(terminalManifest);

    expect(service.terminalImage('terminal:terminal-parque-central')).toEqual({
      ...terminalManifest.terminals?.['terminal:terminal-parque-central']?.[0],
      src: '/api/media/station-images/files/terminal/terminal-parque-central.avif',
    });
    expect(service.terminalImage('terminal:missing')).toBeUndefined();
    expect(service.terminalImage('luz')).toBeUndefined();
    expect(service.image('terminal:terminal-parque-central')).toBeUndefined();
    expect(service.image('Luz')?.src).toBe(
      '/api/media/station-images/files/metro/luz.avif',
    );
  });

  it('rejects terminal files outside the allowed proxy category', () => {
    service.load();
    http.expectOne('/api/media/station-images').flush({
      version: 1,
      stations: {},
      terminals: {
        'terminal:parque-central': [
          {
            key: 'station-images/terminal/../secret.avif',
            author: 'Autor',
            title: 'Terminal',
            sourceUrl: 'https://commons.wikimedia.org/',
            license: 'CC0',
          },
        ],
      },
    });

    expect(service.terminalImage('terminal:parque-central')).toBeUndefined();
  });

  it('allows a later station opening to retry after metadata fails', () => {
    service.load();
    http
      .expectOne('/api/media/station-images')
      .flush('', { status: 503, statusText: 'Unavailable' });
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
