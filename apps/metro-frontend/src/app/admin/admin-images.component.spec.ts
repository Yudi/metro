import { provideRouter } from '@angular/router';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { API_BASE_URL } from '@metro/shared/api';
import type {
  AdminImageEntry,
  AdminImageInput,
  ImageCopyright,
  MediaResource,
} from '@metro/shared/admin-contracts';
import {
  COPYRIGHT_FIXTURE,
  IMAGE_ENTRY_FIXTURE,
  MEDIA_STOP_FIXTURE,
  MEDIA_STATION_FIXTURE,
  MEDIA_TERMINAL_FIXTURE,
} from '@metro/shared/admin-contracts';
import { Observable, of, Subject } from 'rxjs';
import { AdminApiService } from './admin-api.service';
import { AdminImagesComponent } from './admin-images.component';

function createAdminApiMock() {
  return {
    sessionRevision: signal(0),
    searchMediaResources: jest.fn(
      (query: string): Observable<readonly MediaResource[]> =>
        of(
          query.trim().toLowerCase() === MEDIA_STATION_FIXTURE.name.toLowerCase()
            ? [MEDIA_STATION_FIXTURE]
            : [],
        ),
    ),
    listImages: jest.fn(
      (identity: string): Observable<readonly AdminImageEntry[]> =>
        of(
          identity === MEDIA_STATION_FIXTURE.identity
            ? [IMAGE_ENTRY_FIXTURE]
            : [],
        ),
    ),
    listCopyrights: jest.fn(
      (): Observable<readonly ImageCopyright[]> => of([COPYRIGHT_FIXTURE]),
    ),
    uploadImage: jest.fn(
      (file: File, metadata: AdminImageInput): Observable<AdminImageEntry> =>
        of({
          ...IMAGE_ENTRY_FIXTURE,
          ...metadata,
          key: file.name ? IMAGE_ENTRY_FIXTURE.key : 'station-images/metro/upload.avif',
        }),
    ),
    updateImage: jest.fn(
      (key: string, metadata: AdminImageInput): Observable<AdminImageEntry> =>
        of({ ...IMAGE_ENTRY_FIXTURE, ...metadata, key }),
    ),
    deleteImage: jest.fn((): Observable<boolean> => of(true)),
  };
}

describe('AdminImagesComponent', () => {
  let fixture: ComponentFixture<AdminImagesComponent>;
  let component: AdminImagesComponent;
  let api: ReturnType<typeof createAdminApiMock>;

  beforeEach(() => {
    api = createAdminApiMock();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: API_BASE_URL, useValue: '/api' },
        { provide: AdminApiService, useValue: api },
        { provide: MatSnackBar, useValue: { open: jest.fn() } },
      ],
    });
    fixture = TestBed.createComponent(AdminImagesComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => fixture.destroy());

  it('uses the public image proxy path for stop image previews', () => {
    component.selectedResource.set(MEDIA_STOP_FIXTURE);

    expect(
      component.imageUrl('station-images/stop/central-stop.avif'),
    ).toBe('/api/media/station-images/files/stop/central-stop.avif');
  });

  it('clears station scopes when an explicit resource-wide default is selected', () => {
    component.selectedResource.set(MEDIA_STATION_FIXTURE);
    component.form.controls.lineIds.setValue(['1']);
    component.form.controls.serviceTrain.setValue(true);
    component.form.controls.isDefault.setValue(true);

    component.onDefaultToggle(true);

    expect(component.form.controls.lineIds.value).toEqual([]);
    expect(component.form.controls.serviceTrain.value).toBe(false);
    expect(component.scopeOptionDisabled('station', '4')).toBe(true);
  });

  it('clears terminal platform scopes for an explicit resource-wide default', () => {
    component.selectedResource.set(MEDIA_TERMINAL_FIXTURE);
    component.form.controls.stopIds.setValue(['sptrans:10001']);
    component.form.controls.isDefault.setValue(true);

    component.onDefaultToggle(true);

    expect(component.form.controls.stopIds.value).toEqual([]);
    expect(component.scopeOptionDisabled('terminal', 'sptrans:10002')).toBe(true);
  });

  it('restores the train fallback when editing a station image', () => {
    component.selectedResource.set(MEDIA_STATION_FIXTURE);
    component.startEdit({
      ...IMAGE_ENTRY_FIXTURE,
      isDefault: false,
      lineIds: [],
      service: 'train',
    });

    expect(component.form.controls.serviceTrain.value).toBe(true);
  });

  it('uploads valid image metadata without a source URL', async () => {
    const file = new File(['image fixture'], 'station.png', {
      type: 'image/png',
    });
    component.selectedResource.set(MEDIA_STATION_FIXTURE);
    component.startUpload();
    component.form.patchValue({
      author: 'Autora de teste',
      title: 'Imagem sem fonte',
      copyrightId: COPYRIGHT_FIXTURE.id,
    });
    component.selectedFile.set(file);

    expect(component.form.controls.sourceUrl.valid).toBe(true);

    await component.save();

    expect(api.uploadImage).toHaveBeenCalledTimes(1);
    expect(api.uploadImage.mock.calls[0]?.[1].sourceUrl).toBeUndefined();
  });

  it('keeps a non-previewable HEIC file selected and clears its fallback when removed', () => {
    const file = new File(['heic fixture'], 'station.heic', {
      type: 'image/heic',
    });
    component.selectedFile.set(file);

    component.onFilePreviewError();

    expect(component.filePreviewError()).toBe(true);
    expect(component.selectedFile()).toBe(file);
    expect(component.fileError()).toBeNull();

    component.cancelEdit();

    expect(component.filePreviewError()).toBe(false);
    expect(component.selectedFile()).toBeNull();
  });

  it('keeps an upload draft through a new search and ignores a stale save response', async () => {
    const saveResponse = new Subject<AdminImageEntry>();
    const searchResponse = new Subject<readonly MediaResource[]>();
    const file = new File(['avif data'], 'draft.avif', { type: 'image/avif' });
    api.uploadImage.mockReturnValue(saveResponse.asObservable());
    api.searchMediaResources.mockImplementation((query) =>
      query === 'Terminal'
        ? searchResponse.asObservable()
        : of([MEDIA_STATION_FIXTURE]),
    );

    component.selectedResource.set(MEDIA_STATION_FIXTURE);
    component.startUpload();
    component.form.patchValue({
      author: 'Autora de teste',
      title: 'Rascunho da estação',
      sourceUrl: 'https://example.test/estacao',
      copyrightId: COPYRIGHT_FIXTURE.id,
    });
    component.selectedFile.set(file);

    const savePromise = component.save();
    expect(component.saving()).toBe(true);

    component.search.setValue('Terminal');
    await new Promise<void>((resolve) => setTimeout(resolve, 300));
    expect(api.searchMediaResources).toHaveBeenCalledWith('Terminal');

    searchResponse.next([MEDIA_TERMINAL_FIXTURE]);
    searchResponse.complete();
    expect(component.resources()).toEqual([MEDIA_TERMINAL_FIXTURE]);
    expect(component.selectedResource()).toBe(MEDIA_STATION_FIXTURE);
    expect(component.form.controls.title.value).toBe('Rascunho da estação');
    expect(component.selectedFile()).toBe(file);

    await component.chooseResource(MEDIA_TERMINAL_FIXTURE);
    expect(component.selectedResource()).toBe(MEDIA_STATION_FIXTURE);

    // A stale completion must not clear a newer context if it changes outside
    // the disabled resource controls while the request is still pending.
    component.selectedResource.set(MEDIA_TERMINAL_FIXTURE);
    component.form.controls.title.setValue('Rascunho do terminal');
    saveResponse.next(IMAGE_ENTRY_FIXTURE);
    saveResponse.complete();
    await savePromise;

    expect(component.selectedResource()).toBe(MEDIA_TERMINAL_FIXTURE);
    expect(component.form.controls.title.value).toBe('Rascunho do terminal');
  });
});
