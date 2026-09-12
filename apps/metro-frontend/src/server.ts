import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express, { type Response } from 'express';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { routes } from './app/app.routes';
import { collectPaths, getStaticAssetCacheControl } from '@metro/shared/utils';

import xmlbuilder from 'xmlbuilder';

const serverDistFolder = dirname(fileURLToPath(import.meta.url));
const browserDistFolder = resolve(serverDistFolder, '../browser');

const app = express();
const angularApp = new AngularNodeAppEngine({ trustProxyHeaders: true });

function setStaticCacheHeaders(response: Response, filePath: string): void {
  response.setHeader(
    'Cache-Control',
    getStaticAssetCacheControl(basename(filePath)),
  );
}

app.use(
  '/app',
  express.static(browserDistFolder, {
    maxAge: 0,
    index: false,
    redirect: false,
    setHeaders: setStaticCacheHeaders,
  }),
);

app.get('/app/sitemap.xml', (req, res) => {
  const root = xmlbuilder.create('sitemapindex', {
    version: '1.0',
    encoding: 'UTF-8',
  });
  root.att('xmlns', 'http://www.sitemaps.org/schemas/sitemap/0.9');

  const sitemaps = [
    'https://metro.yudi.com.br/app/sitemap-main.xml',
    'https://metro.yudi.com.br/lite/sitemap.xml',
  ];

  sitemaps.forEach((loc) => {
    const sitemap = root.ele('sitemap');
    sitemap.ele('loc', loc);
  });

  res.type('application/xml; charset=utf-8');
  res.send(root.end({ pretty: true }));
});

app.get('/app/sitemap-main.xml', (req, res) => {
  const paths = Array.from(new Set(collectPaths(routes)));

  const root = xmlbuilder.create('urlset', {
    version: '1.0',
    encoding: 'UTF-8',
  });
  root.att('xmlns', 'http://www.sitemaps.org/schemas/sitemap/0.9');

  paths.forEach((route) => {
    const path = route.startsWith('/') ? route : `/${route}`;
    const url = root.ele('url');
    url.ele('loc', `https://metro.yudi.com.br/app${path}`);
  });

  res.type('application/xml; charset=utf-8');
  res.send(root.end({ pretty: true }));
});

app.use('/{*splat}', (req, res, next) => {
  angularApp
    .handle(req)
    .then((response) =>
      response ? writeResponseToNodeResponse(response, res) : next(),
    )
    .catch(next);
});

if (isMainModule(import.meta.url)) {
  const port = process.env['PORT'] || 4000;
  app.listen(port, () => {
    console.log(`Node Express server listening on http://localhost:${port}`);
  });
}

export const reqHandler = createNodeRequestHandler(app);
