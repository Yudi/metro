import { EventEmitter, once } from 'node:events';
import { PassThrough } from 'node:stream';
import type { Request, Response } from 'express';
import { StationImagesController } from './station-images.controller';
import {
  StationImageObject,
  StationImagesService,
} from './station-images.service';

describe('StationImagesController image lifecycle', () => {
  it('cancels storage and destroys a body returned after an early disconnect', async () => {
    let resolveImage!: (image: StationImageObject) => void;
    const pendingImage = new Promise<StationImageObject>((resolve) => {
      resolveImage = resolve;
    });
    const { controller, getImage, request, response, sink } = createController(
      pendingImage,
    );
    const body = new PassThrough();
    const pipe = jest.spyOn(body, 'pipe');

    const handling = controller.getImage('metro', 'luz.avif', request, response);
    const signal: AbortSignal = getImage.mock.calls[0][2];
    sink.destroy();
    await once(sink, 'close');
    expect(signal.aborted).toBe(true);

    resolveImage({ body });
    await handling;

    expect(body.destroyed).toBe(true);
    expect(pipe).not.toHaveBeenCalled();
    expect(response.setHeader).not.toHaveBeenCalled();
    expect(request.listenerCount('aborted')).toBe(0);
    expect(response.listenerCount('close')).toBe(0);
  });

  it('cancels storage when the request aborts before storage resolves', async () => {
    const { controller, getImage, request, response } = createController(
      Promise.reject(new Error('Storage request aborted')),
    );
    const handling = controller.getImage('metro', 'luz.avif', request, response);
    request.emit('aborted');

    await expect(handling).resolves.toBeUndefined();
    expect(getImage.mock.calls[0][2].aborted).toBe(true);
    expect(response.setHeader).not.toHaveBeenCalled();
    expect(response.listenerCount('close')).toBe(0);
  });

  it('destroys the upstream body when the client disconnects during streaming', async () => {
    const body = new PassThrough();
    const { controller, getImage, request, response, sink } = createController(
      Promise.resolve({ body }),
    );
    await controller.getImage('metro', 'luz.avif', request, response);
    body.write(Buffer.alloc(64 * 1024));

    sink.destroy();
    await once(sink, 'close');

    expect(body.destroyed).toBe(true);
    expect(getImage.mock.calls[0][2].aborted).toBe(true);
    expect(request.listenerCount('aborted')).toBe(0);
  });

  it('streams a normal response and removes lifecycle listeners on completion', async () => {
    const body = new PassThrough();
    const { controller, getImage, request, response, sink } = createController(
      Promise.resolve({ body }),
    );
    const chunks: Buffer[] = [];
    sink.on('data', (chunk: Buffer) => chunks.push(chunk));
    await controller.getImage('metro', 'luz.avif', request, response);
    const finished = once(sink, 'finish');
    body.end('image bytes');
    await finished;

    expect(Buffer.concat(chunks).toString()).toBe('image bytes');
    expect(getImage.mock.calls[0][2].aborted).toBe(false);
    expect(request.listenerCount('aborted')).toBe(0);
    expect(response.listenerCount('close')).toBe(0);
  });

  it('destroys the unused body and removes listeners for a 304 response', async () => {
    const body = new PassThrough();
    const { controller, request, response } = createController(
      Promise.resolve({ body, etag: '"image"' }),
      'W/"image"',
    );
    await controller.getImage('metro', 'luz.avif', request, response);

    expect(response.status).toHaveBeenCalledWith(304);
    expect(body.destroyed).toBe(true);
    expect(request.listenerCount('aborted')).toBe(0);
    expect(response.listenerCount('close')).toBe(0);
  });

  it('keeps the storage failure response for connected clients', async () => {
    const error = new Error('Storage unavailable');
    const { controller, request, response } = createController(
      Promise.reject(error),
    );
    await expect(
      controller.getImage('metro', 'luz.avif', request, response),
    ).rejects.toBe(error);
    expect(response.listenerCount('close')).toBe(0);
    expect(request.listenerCount('aborted')).toBe(0);
  });
});

function createController(image: Promise<StationImageObject>, etag?: string) {
  const getImage = jest.fn().mockReturnValue(image);
  const service = { getImage } as unknown as StationImagesService;
  const request = Object.assign(new EventEmitter(), {
    aborted: false,
    get: jest.fn().mockReturnValue(etag),
  }) as unknown as Request;
  const sink = new PassThrough();
  const response = Object.assign(sink, {
    setHeader: jest.fn(),
    removeHeader: jest.fn(),
    status: jest.fn().mockReturnValue(sink),
  }) as unknown as Response;
  return {
    controller: new StationImagesController(service),
    getImage,
    request,
    response,
    sink,
  };
}
