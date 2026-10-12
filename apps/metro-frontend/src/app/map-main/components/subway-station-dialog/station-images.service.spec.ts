import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { API_BASE_URL } from '@metro/shared/api';
import { StationImagesService } from './station-images.service';
import { StationImageManifest } from './station-images';
import { IMAGE_ENTRY_FIXTURE, MEDIA_STOP_FIXTURE, MEDIA_TERMINAL_FIXTURE } from '@metro/shared/admin-contracts';

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

  it('invalidates stale pending metadata and bypasses the previous HTTP cache after admin edits', () => {
    service.load();
    const stale = http.expectOne('/api/media/station-images');
    service.invalidate();
    service.load();
    const fresh = http.expectOne((request) => request.url === '/api/media/station-images' && request.params.has('version'));
    stale.flush(manifest);
    expect(service.image('Luz')).toBeUndefined();
    fresh.flush({ ...manifest, stations: { luz: [{ ...manifest.stations['luz'][0], title: 'Título atualizado' }] } });
    expect(service.image('Luz')?.title).toBe('Título atualizado');
  });

  it('uses stop-specific terminal metadata and preserves generic fallback for other stops', () => {
    const generic = { ...IMAGE_ENTRY_FIXTURE, key: 'station-images/terminal/default.avif' };
    const scoped = { ...generic, key: 'station-images/terminal/platform.avif', isDefault: false, stopIds: [MEDIA_TERMINAL_FIXTURE.scopes[0].id] };
    const stopImage = { ...IMAGE_ENTRY_FIXTURE, key: 'station-images/stop/direct.avif' };
    service.load();
    http.expectOne('/api/media/station-images').flush({ version: 1, stations: {},
      terminals: { [MEDIA_TERMINAL_FIXTURE.identity]: [generic, scoped] },
      stops: { [MEDIA_STOP_FIXTURE.identity]: [stopImage] },
    });
    expect(service.terminalImage(MEDIA_TERMINAL_FIXTURE.identity, MEDIA_TERMINAL_FIXTURE.scopes[0].id)?.key).toBe(scoped.key);
    expect(service.stopImage('sptrans:10002', MEDIA_TERMINAL_FIXTURE.identity)?.key).toBe(generic.key);
    expect(service.stopImage('sptrans:10001', MEDIA_TERMINAL_FIXTURE.identity)?.key).toBe(stopImage.key);
    expect(service.stopImage('10001', MEDIA_TERMINAL_FIXTURE.identity, 'SPTRANS', '10001')?.key).toBe(stopImage.key);
    expect(service.terminalImage(MEDIA_TERMINAL_FIXTURE.identity, '10001')?.key).toBe(scoped.key);
    expect(service.stopImage('missing')).toBeUndefined();
  });

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

  it('preserves punctuation in the canonical identity of Engº. Goulart', () => {
    service.load();
    http.expectOne('/api/media/station-images').flush({ version: 1,
      stations: { 'engº.goulart': [IMAGE_ENTRY_FIXTURE] },
    });
    expect(service.image('Engº. Goulart')?.key).toBe(IMAGE_ENTRY_FIXTURE.key);
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
