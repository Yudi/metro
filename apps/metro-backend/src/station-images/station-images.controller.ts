import { Controller, Get, Param, Req, Res } from '@nestjs/common';
import { ApiOkResponse, ApiParam, ApiProduces, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import type { Readable } from 'node:stream';
import { StationImagesService } from './station-images.service';

const MANIFEST_CACHE_CONTROL =
  'public, max-age=300, stale-while-revalidate=3600';
const IMAGE_CACHE_CONTROL =
  'public, max-age=86400, stale-while-revalidate=604800';

@ApiTags('Mídia')
@Controller('media/station-images')
export class StationImagesController {
  constructor(private readonly stationImagesService: StationImagesService) {}

  @Get()
  @ApiProduces('application/json')
  @ApiOkResponse({
    description: 'Manifesto de imagens e atribuições das estações.',
  })
  async getMetadata(
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const result = await this.stationImagesService.getManifest();
    response.setHeader('Cache-Control', MANIFEST_CACHE_CONTROL);
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    setValidators(response, result.etag);

    if (isNotModified(request, result.etag)) {
      response.status(304).end();
      return;
    }

    response.status(200).send(result.body);
  }

  @Get('files/:category/:filename')
  @ApiProduces('image/avif')
  @ApiParam({
    name: 'category',
    enum: ['metro', 'monorail', 'rail'],
    description: 'Tipo de serviço da estação.',
  })
  @ApiParam({
    name: 'filename',
    example: 'luz.avif',
    description: 'Nome do arquivo AVIF da estação.',
  })
  @ApiOkResponse({ description: 'Imagem AVIF da estação.' })
  async getImage(
    @Param('category') category: string,
    @Param('filename') filename: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const cancellation = new AbortController();
    let body: Readable | undefined;
    const cleanup = () => {
      request.off('aborted', onDisconnect);
      response.off('close', onClose);
      response.off('finish', cleanup);
    };
    const onDisconnect = () => {
      cancellation.abort();
      body?.destroy();
      cleanup();
    };
    const onClose = () => {
      if (!response.writableEnded) {
        onDisconnect();
      } else {
        cleanup();
      }
    };
    request.once('aborted', onDisconnect);
    response.once('close', onClose);
    response.once('finish', cleanup);

    try {
      if (request.aborted || response.destroyed) {
        onDisconnect();
        return;
      }

      const image = await this.stationImagesService.getImage(
        category,
        filename,
        cancellation.signal,
      );
      body = image.body;
      if (cancellation.signal.aborted || request.aborted || response.destroyed) {
        onDisconnect();
        return;
      }

      response.setHeader('Cache-Control', IMAGE_CACHE_CONTROL);
      response.setHeader('Content-Type', 'image/avif');
      response.setHeader('Content-Disposition', 'inline');
      response.setHeader('X-Content-Type-Options', 'nosniff');
      if (image.contentLength !== undefined) {
        response.setHeader('Content-Length', image.contentLength);
      }
      setValidators(response, image.etag, image.lastModified);

      if (isNotModified(request, image.etag)) {
        body.destroy();
        response.status(304).end();
        cleanup();
        return;
      }

      body.once('error', (error: Error) => {
        body?.destroy();
        cleanup();
        if (response.destroyed) {
          return;
        }
        if (response.headersSent) {
          response.destroy(error);
        } else {
          response.removeHeader('Content-Length');
          response.removeHeader('Content-Type');
          response.removeHeader('Content-Disposition');
          response.removeHeader('Cache-Control');
          response.removeHeader('ETag');
          response.removeHeader('Last-Modified');
          response.status(502).end('Station image storage is unavailable');
        }
      });
      body.pipe(response);
    } catch (error) {
      body?.destroy();
      cleanup();
      if (!cancellation.signal.aborted && !request.aborted && !response.destroyed) {
        throw error;
      }
    }
  }
}

function setValidators(
  response: Response,
  etag?: string,
  lastModified?: Date,
): void {
  if (etag && !/[\r\n]/.test(etag)) {
    response.setHeader('ETag', etag);
  }
  if (lastModified && !Number.isNaN(lastModified.getTime())) {
    response.setHeader('Last-Modified', lastModified.toUTCString());
  }
}

function isNotModified(request: Request, etag?: string): boolean {
  const header = request.get('If-None-Match');
  if (!header || !etag) {
    return false;
  }

  const normalizedEtag = normalizeEtag(etag);
  return header
    .split(',')
    .map((candidate) => candidate.trim())
    .some(
      (candidate) =>
        candidate === '*' || normalizeEtag(candidate) === normalizedEtag,
    );
}

function normalizeEtag(etag: string): string {
  return etag.startsWith('W/') ? etag.slice(2) : etag;
}
