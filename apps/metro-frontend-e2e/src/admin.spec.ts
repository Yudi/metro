import { expect, test, type Page } from '@playwright/test';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { sharedEnvironment } from '@metro/shared/environment';
import {
  ADMIN_ACCOUNT_FIXTURE,
  COPYRIGHT_FIXTURE,
  IMAGE_ENTRY_FIXTURE,
  IMAGE_PNG_FIXTURE_BASE64,
  MEDIA_STATION_FIXTURE,
  MEDIA_STOP_FIXTURE,
  MEDIA_TERMINAL_FIXTURE,
  REGULAR_ACCOUNT_FIXTURE,
  type AdminAccount,
  type AdminImageEntry,
  type AdminImageInput,
  type ImageCopyright,
} from '@metro/shared/admin-contracts';

const root = resolve(
  __dirname,
  '../../../dist/apps/metro-frontend-e2e-static/browser',
);
const captures = resolve(
  __dirname,
  '../../metro-frontend/.impeccable/review/admin',
);
const avatar = resolve(
  __dirname,
  '../../metro-frontend/public/icons/avatar-placeholder.avif',
);
const types: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.avif': 'image/avif',
};

async function setup(
  page: Page,
  access: 'admin' | 'regular' | 'anonymous' = 'admin',
) {
  let admins: AdminAccount[] = [ADMIN_ACCOUNT_FIXTURE];
  let licenses: ImageCopyright[] = [COPYRIGHT_FIXTURE];
  let images: AdminImageEntry[] = [IMAGE_ENTRY_FIXTURE];
  const mutations: {
    method: string;
    path: string;
    metadata?: AdminImageInput;
  }[] = [];
  const requests: string[] = [];
  const resources = [
    MEDIA_STATION_FIXTURE,
    MEDIA_STOP_FIXTURE,
    MEDIA_TERMINAL_FIXTURE,
  ];

  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const headers = {
      'access-control-allow-origin': '*',
      'access-control-allow-headers': '*',
      'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
      'cache-control': 'no-store',
    };
    const json = (value: unknown, status = 200) =>
      route.fulfill({ status, headers, json: value });
    if (request.method() === 'OPTIONS')
      return route.fulfill({ status: 204, headers });
    if (url.pathname === '/api/graphql') {
      const multipart = request
        .headers()
        ['content-type']?.startsWith('multipart/form-data');
      const operation = multipart
        ? JSON.parse(
            request
              .postData()
              ?.match(/name="operations"\r\n\r\n([^\r]+)/)?.[1] ?? '{}',
          )
        : request.postDataJSON();
      const query: string = operation.query ?? '';
      const variables: Record<string, unknown> = operation.variables ?? {};
      const field = [
        'adminAccounts',
        'grantAdmin',
        'revokeAdmin',
        'adminMediaResources',
        'adminImages',
        'adminImageLicenses',
        'uploadAdminImage',
        'updateAdminImage',
        'deleteAdminImage',
        'createAdminImageLicense',
        'updateAdminImageLicense',
        'deleteAdminImageLicense',
      ].find((name) => new RegExp(`\\b${name}\\b`).test(query));
      const result = (value: unknown) =>
        json({ data: { [field ?? 'unknown']: value } });
      requests.push(field ? `admin:${field}` : url.pathname);
      if (!field)
        return json({
          data: { ensureUser: true, userFavorites: {}, favorites: [] },
        });
      if (access !== 'admin')
        return json({
          errors: [
            {
              message: 'Administrator access required',
              extensions: { code: 'FORBIDDEN' },
            },
          ],
        });
      if (field === 'adminAccounts') return result(admins);
      if (field === 'grantAdmin') {
        expect(variables['email']).toBe(REGULAR_ACCOUNT_FIXTURE.email);
        admins = [...admins, REGULAR_ACCOUNT_FIXTURE];
        return result(REGULAR_ACCOUNT_FIXTURE);
      }
      if (field === 'revokeAdmin') {
        admins = admins.filter((account) => account.uid !== variables['uid']);
        return result(true);
      }
      if (field === 'adminMediaResources')
        return result(String(variables['query'] ?? '').trim() ? resources : []);
      if (field === 'adminImageLicenses') return result(licenses);
      if (field === 'createAdminImageLicense') {
        const created = {
          id: 'created-license',
          ...(variables['input'] as object),
        } as ImageCopyright;
        licenses = [...licenses, created];
        return result(created);
      }
      if (field === 'updateAdminImageLicense') {
        const updated = {
          id: variables['id'],
          ...(variables['input'] as object),
        } as ImageCopyright;
        licenses = licenses.map((license) =>
          license.id === variables['id'] ? updated : license,
        );
        return result(updated);
      }
      if (field === 'deleteAdminImageLicense') {
        if (images.some((image) => image.copyrightId === variables['id'])) {
          return json({
            errors: [
              {
                message: 'This license is still used by an image',
                extensions: { code: 'CONFLICT' },
              },
            ],
          });
        }
        licenses = licenses.filter((license) => license.id !== variables['id']);
        return result(true);
      }
      if (field === 'adminImages')
        return result(
          images.filter(
            (image) => image.stationIdentity === variables['identity'],
          ),
        );
      if (field === 'deleteAdminImage') {
        mutations.push({ method: field, path: url.pathname });
        images = images.filter((image) => image.key !== variables['key']);
        return result(true);
      }
      const metadata = variables['metadata'] as AdminImageInput;
      if (field === 'uploadAdminImage') {
        expect(multipart).toBe(true);
        expect(request.headers()['x-graphql-upload']).toBe('1');
        expect(request.postData()).toContain('filename="fixture.png"');
      }
      mutations.push({ method: field, path: url.pathname, metadata });
      const license =
        licenses.find((entry) => entry.id === metadata.copyrightId) ??
        COPYRIGHT_FIXTURE;
      const category = metadata.stationIdentity.startsWith('terminal:')
        ? 'terminal'
        : metadata.stationIdentity.startsWith('stop:')
          ? 'stop'
          : 'metro';
      const entry: AdminImageEntry = {
        ...IMAGE_ENTRY_FIXTURE,
        ...metadata,
        key:
          (variables['key'] as string | undefined) ??
          `station-images/${category}/uploaded-fixture.avif`,
        position: 1,
        stopIds: metadata.stopIds ?? [],
        license: license.license,
        licenseUrl: license.licenseUrl,
      };
      images = [
        ...images
          .filter((image) => image.key !== entry.key)
          .map((image) =>
            metadata.isDefault &&
            image.stationIdentity === metadata.stationIdentity
              ? { ...image, isDefault: false }
              : image,
          ),
        entry,
      ];
      return result(entry);
    }
    if (url.pathname.startsWith('/api/media/station-images/files/')) {
      return route.fulfill({
        body: await readFile(avatar),
        contentType: 'image/avif',
        headers,
      });
    }
    if (url.pathname.startsWith('/api/')) return json({});
    if (url.origin !== 'http://localhost:4200') return route.abort();
    if (url.pathname === '/auth-fixture')
      return route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><html><body>Auth fixture</body></html>',
      });
    const assetPath = url.pathname.startsWith('/app/')
      ? url.pathname.slice(4)
      : url.pathname;
    const requested = resolve(root, `.${decodeURIComponent(assetPath)}`);
    if (!requested.startsWith(`${root}/`)) return route.abort();
    const file = extname(url.pathname)
      ? requested
      : resolve(root, 'index.html');
    try {
      return route.fulfill({
        body: await readFile(file),
        contentType: types[extname(file)] ?? 'application/octet-stream',
      });
    } catch {
      return route.fulfill({ status: 404, body: 'Missing built test asset' });
    }
  });

  if (access !== 'anonymous') {
    await page.goto('/auth-fixture');
    await page.evaluate(
      async ({ apiKey, account, admin }) => {
        const now = Math.floor(Date.now() / 1000);
        const encode = (value: unknown) =>
          btoa(JSON.stringify(value))
            .replaceAll('+', '-')
            .replaceAll('/', '_')
            .replaceAll('=', '');
        const token = `${encode({ alg: 'none', typ: 'JWT' })}.${encode({ sub: account.uid, user_id: account.uid, admin, iat: now, exp: now + 3600 })}.fixture`;
        const db = await new Promise<IDBDatabase>((resolveDb, reject) => {
          const request = indexedDB.open('firebaseLocalStorageDb', 1);
          request.onupgradeneeded = () =>
            request.result.createObjectStore('firebaseLocalStorage', {
              keyPath: 'fbase_key',
            });
          request.onsuccess = () => resolveDb(request.result);
          request.onerror = () => reject(request.error);
        });
        await new Promise<void>((resolveWrite, reject) => {
          const tx = db.transaction('firebaseLocalStorage', 'readwrite');
          tx.objectStore('firebaseLocalStorage').put({
            fbase_key: `firebase:authUser:${apiKey}:[DEFAULT]`,
            value: {
              uid: account.uid,
              email: account.email,
              displayName: account.displayName,
              emailVerified: true,
              isAnonymous: false,
              providerData: [],
              apiKey,
              appName: '[DEFAULT]',
              stsTokenManager: {
                accessToken: token,
                refreshToken: 'fixture-refresh',
                expirationTime: Date.now() + 3600_000,
              },
            },
          });
          tx.oncomplete = () => resolveWrite();
          tx.onerror = () => reject(tx.error);
        });
        db.close();
      },
      {
        apiKey: sharedEnvironment.firebase.apiKey,
        account: ADMIN_ACCOUNT_FIXTURE,
        admin: access === 'admin',
      },
    );
  }
  return { mutations, requests };
}

test('regular and signed-out users cannot reach the admin menu or protected pages', async ({
  page,
}) => {
  const state = await setup(page, 'regular');
  await page.goto('/sp/menu');
  await expect(
    page.getByRole('link', { name: 'Administração', exact: true }),
  ).toHaveCount(0);
  await page.goto('/sp/admin/imagens');
  await expect(page).toHaveURL(/\/sp\/menu$/);
  expect(state.requests.filter((path) => path.startsWith('admin:'))).toEqual(
    [],
  );
});

test('an anonymous user is redirected before admin code is activated', async ({
  page,
}) => {
  await setup(page, 'anonymous');
  await page.goto('/sp/admin');
  await expect(page).toHaveURL(/\/sp\/menu$/);
  await expect(
    page.getByRole('link', { name: 'Administração', exact: true }),
  ).toHaveCount(0);
});

test('the admin menu opens a feature nav-list and grants/removes a registered email', async ({
  page,
}) => {
  await setup(page);
  await page.goto('/sp/menu');
  await page.getByRole('link', { name: 'Administração', exact: true }).click();
  const navigation = page.getByRole('navigation', { name: 'Administração' });
  await expect(
    navigation.getByRole('link', { name: 'Administradores' }),
  ).toBeVisible();
  await expect(navigation.getByRole('link', { name: 'Imagens' })).toBeVisible();
  await expect(
    navigation.getByRole('link', { name: 'Licenças' }),
  ).toBeVisible();
  await navigation.getByRole('link', { name: 'Administradores' }).click();
  await expect(
    page.getByRole('button', {
      name: `Remover acesso de ${ADMIN_ACCOUNT_FIXTURE.email}`,
    }),
  ).toBeDisabled();
  await page
    .getByRole('textbox', { name: 'E-mail' })
    .fill(REGULAR_ACCOUNT_FIXTURE.email ?? '');
  await page.getByRole('button', { name: 'Adicionar', exact: true }).click();
  await expect(
    page.getByText(REGULAR_ACCOUNT_FIXTURE.email ?? '', { exact: true }),
  ).toBeVisible();
  await mkdir(captures, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: resolve(captures, 'accounts-desktop.png'),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: resolve(captures, 'accounts-mobile.png'),
    fullPage: true,
  });
  await page
    .getByRole('button', {
      name: `Remover acesso de ${REGULAR_ACCOUNT_FIXTURE.email}`,
    })
    .click();
  await page
    .getByRole('button', { name: 'Remover acesso', exact: true })
    .click();
  await expect(
    page.getByText(REGULAR_ACCOUNT_FIXTURE.email ?? '', { exact: true }),
  ).toHaveCount(0);
});

test('licenses are shared records while holders stay image-specific', async ({
  page,
}) => {
  await setup(page);
  await page.goto('/sp/admin/direitos-autorais');
  await page.getByRole('button', { name: 'Nova licença' }).click();
  await page.getByRole('textbox', { name: 'Nome' }).fill('CC0 de teste');
  await page
    .getByRole('textbox', { name: 'URL (opcional)' })
    .fill('https://example.test/license');
  await expect(page.getByRole('textbox', { name: 'Autor' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  const row = page.getByRole('listitem').filter({ hasText: 'CC0 de teste' });
  await mkdir(captures, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: resolve(captures, 'licenses-desktop.png'),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: resolve(captures, 'licenses-mobile.png'),
    fullPage: true,
  });
  await row.getByRole('button', { name: 'Editar' }).click();
  await page.getByRole('textbox', { name: 'Nome' }).fill('CC0 revisada');
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await page
    .getByRole('listitem')
    .filter({ hasText: 'CC0 revisada' })
    .getByRole('button', { name: 'Remover' })
    .click();
  await page
    .getByRole('listitem')
    .filter({ hasText: 'CC0 revisada' })
    .getByRole('button', { name: 'Remover', exact: true })
    .click();
  await expect(page.getByText('CC0 revisada', { exact: true })).toHaveCount(0);
});

test('station metadata supports per-line images and remains usable on mobile', async ({
  page,
}) => {
  const state = await setup(page);
  await mkdir(captures, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/sp/admin/imagens');
  await page.getByRole('searchbox', { name: 'Buscar local' }).fill('Luz');
  await page.getByRole('button', { name: /Luz/ }).click();
  await expect(
    page.getByRole('img', { name: IMAGE_ENTRY_FIXTURE.title }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Editar', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Autor' })
    .fill('Autora específica da imagem');
  await page.getByRole('checkbox', { name: 'Imagem padrão' }).uncheck();
  await page.getByRole('combobox', { name: 'Linhas' }).press('Enter');
  await page
    .getByRole('option', { name: MEDIA_STATION_FIXTURE.scopes[1].label })
    .click();
  await page.keyboard.press('Escape');
  await page.screenshot({
    path: resolve(captures, 'editor-desktop.png'),
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Salvar' }).click();
  await expect.poll(() => state.mutations.length).toBe(1);
  expect(state.mutations[0].metadata).toMatchObject({
    author: 'Autora específica da imagem',
    lineIds: ['4'],
    isDefault: false,
  });
  await expect(
    page.getByText('Autora específica da imagem', { exact: false }),
  ).toBeVisible();
  await page.screenshot({
    path: resolve(captures, 'desktop.png'),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: resolve(captures, 'mobile.png'),
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Editar', exact: true }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: resolve(captures, 'editor-mobile.png'),
    fullPage: true,
  });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.screenshot({
    path: resolve(captures, 'mobile-dark.png'),
    fullPage: true,
  });
});

test('terminal images upload as defaults, can target a stop, and can be deleted', async ({
  page,
}) => {
  const state = await setup(page);
  await page.goto('/sp/admin/imagens');
  await page.getByRole('searchbox', { name: 'Buscar local' }).fill('Terminal');
  await page.getByRole('button', { name: /Terminal Central/ }).click();
  await page.getByRole('button', { name: 'Nova imagem', exact: true }).click();
  await page
    .locator('input[type=file]')
    .setInputFiles({
      name: 'fixture.png',
      mimeType: 'image/png',
      buffer: Buffer.from(IMAGE_PNG_FIXTURE_BASE64, 'base64'),
    });
  await page
    .getByRole('textbox', { name: 'Título' })
    .fill('Terminal — prévia de teste');
  await page.getByRole('textbox', { name: 'Autor' }).fill('Autora de teste');
  await expect(
    page.getByRole('textbox', { name: 'Fonte (URL, opcional)' }),
  ).toBeVisible();
  await page.getByRole('combobox', { name: 'Licença', exact: true }).click();
  await page.getByRole('option', { name: COPYRIGHT_FIXTURE.license }).click();
  await page.getByRole('checkbox', { name: 'Imagem padrão' }).check();
  await page
    .getByRole('button', { name: 'Enviar imagem', exact: true })
    .click();
  await expect.poll(() => state.mutations.length).toBe(1);
  expect(state.mutations[0].method).toBe('uploadAdminImage');
  expect(state.mutations[0].metadata).toMatchObject({
    stationIdentity: MEDIA_TERMINAL_FIXTURE.identity,
    isDefault: true,
  });
  expect(state.mutations[0].metadata?.sourceUrl).toBeUndefined();
  await expect(
    page.getByRole('img', { name: 'Terminal — prévia de teste' }),
  ).toHaveAttribute('src', /\.avif$/);
  expect(state.mutations[0].metadata?.stopIds).toBeUndefined();
  await page.getByRole('button', { name: 'Editar', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Imagem padrão' }).uncheck();
  await page.getByRole('combobox', { name: 'Paradas' }).press('Enter');
  await page
    .getByRole('option', { name: MEDIA_TERMINAL_FIXTURE.scopes[0].label })
    .click();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Salvar' }).click();
  await expect.poll(() => state.mutations.length).toBe(2);
  expect(state.mutations[1].metadata).toMatchObject({
    isDefault: false,
    stopIds: [MEDIA_TERMINAL_FIXTURE.scopes[0].id],
  });
  await page.getByRole('button', { name: 'Remover', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar', exact: true }).click();
  await expect(page.getByText('Sem imagens')).toBeVisible();
});
