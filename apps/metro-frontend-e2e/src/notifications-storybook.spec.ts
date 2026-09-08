import { test, expect } from '@playwright/test';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';

const root = resolve(__dirname, '../../../dist/storybook/metro-frontend');
const captures = resolve(__dirname, '../../../.impeccable/review/notifications');
const mime: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.avif': 'image/avif' };

test.beforeEach(async ({ page }) => {
  // Serve only built test assets via Playwright interception. No server process,
  // network credentials, live backend, or user's browser profile is involved.
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== 'http://localhost:4400') return route.abort();
    const file = resolve(root, `.${decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)}`);
    if (!file.startsWith(`${root}/`)) return route.abort();
    try {
      await route.fulfill({ body: await readFile(file), contentType: mime[extname(file)] ?? 'application/octet-stream' });
    } catch {
      await route.fulfill({ status: 404, body: 'Missing built story asset' });
    }
  });
});

test('shows cloud triggers on desktop and mobile', async ({ page }) => {
  await mkdir(captures, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/iframe.html?id=pages-notifications--aviso-configurado&viewMode=story');
  await expect(page.getByRole('heading', { name: 'Notificações', exact: true })).toBeVisible();
  await expect(page.getByText('Minha ida para a faculdade', { exact: true })).toBeVisible();
  await page.screenshot({ animations: 'disabled', path: resolve(captures, 'desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('heading', { name: 'Notificações', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ animations: 'disabled', path: resolve(captures, 'mobile.png'), fullPage: true });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.screenshot({ animations: 'disabled', path: resolve(captures, 'mobile-dark.png'), fullPage: true });
});

test('edits multiple days and time ranges without losing existing selections', async ({ page }) => {
  await mkdir(captures, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/iframe.html?id=pages-notifications--aviso-configurado&viewMode=story');
  await page.getByRole('button', { name: 'Editar Minha ida para a faculdade' }).click();
  await expect(page.getByLabel('Nome do aviso')).toHaveValue('Minha ida para a faculdade');
  await page.getByRole('button', { name: 'sábado', exact: true }).click();
  await expect(page.getByRole('button', { name: 'sábado', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'segunda-feira', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Adicionar faixa' }).click();
  await expect(page.getByLabel('Início', { exact: true })).toHaveCount(2);
  await page.getByLabel('Início', { exact: true }).nth(1).fill('17:00');
  await page.getByLabel('Fim', { exact: true }).nth(1).fill('19:00');
  await page.screenshot({ animations: 'disabled', path: resolve(captures, 'editor-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ animations: 'disabled', path: resolve(captures, 'editor-mobile.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(page.getByLabel('Nome do aviso')).toHaveCount(0);
});

test('saves, pauses and removes a cloud-backed trigger through the UI', async ({ page }) => {
  await page.goto('/iframe.html?id=pages-notifications--aviso-configurado&viewMode=story');
  await page.getByRole('button', { name: 'Editar Minha ida para a faculdade' }).click();
  await page.getByLabel('Nome do aviso').fill('Ida atualizada');
  await page.getByRole('button', { name: 'Salvar aviso', exact: true }).click();
  await expect(page.getByText('Ida atualizada', { exact: true })).toBeVisible();
  await page.getByRole('switch', { name: 'Desativar Ida atualizada' }).click();
  await expect(page.getByRole('switch', { name: 'Ativar Ida atualizada' })).toBeVisible();
  await page.getByRole('button', { name: 'Excluir Ida atualizada' }).click();
  await expect(page.getByText('Ida atualizada', { exact: true })).toHaveCount(0);
});

test('shows arrival lead choices and hides irrelevant smart and throttle controls', async ({ page }) => {
  await page.goto('/iframe.html?id=pages-notifications--aviso-configurado&viewMode=story');
  await page.getByRole('button', { name: 'Editar Minha ida para a faculdade' }).click();
  await page.getByLabel('Tipo de aviso', { exact: true }).click();
  await page.getByRole('option', { name: 'Próximos trens', exact: true }).click();
  await expect(page.locator('.cdk-overlay-pane')).toHaveCount(0);
  await expect(page.getByLabel('Avisar quando faltar até')).toBeVisible();
  await expect(page.getByText('Intervalo mínimo', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('switch', { name: 'Ativar aviso antecipado' })).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ animations: 'disabled', path: resolve(captures, 'arrivals-mobile.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('explains sign-in and permission-denied states', async ({ page }) => {
  await page.goto('/iframe.html?id=pages-notifications--sem-login&viewMode=story');
  await expect(page.getByRole('heading', { name: 'Entre para configurar avisos' })).toBeVisible();
  await page.goto('/iframe.html?id=pages-notifications--permissao-bloqueada&viewMode=story');
  await expect(page.getByText(/bloquead/i).first()).toBeVisible();
});
