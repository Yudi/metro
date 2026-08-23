import { test, expect } from '@playwright/test';

test('renders the project information route and navigation shell', async ({ page }) => {
  await page.goto('/sobre');

  await expect(page).toHaveTitle(/Sobre \| Transporte Metropolitano/);
  await expect(
    page.getByRole('heading', { name: 'Sobre o projeto' }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: /GitHub/i })).toHaveAttribute(
    'href',
    'https://github.com/yudi/metro',
  );
});
