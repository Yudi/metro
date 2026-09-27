import { expect, test } from '@playwright/test';

test('renders the project information route and navigation shell', async ({
  page,
}) => {
  await page.goto('/sp/sobre');

  await expect(page).toHaveTitle(/Sobre \| Transporte Metropolitano/);
  await expect(
    page.getByRole('heading', { name: 'Sobre o projeto' }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: /GitHub/i })).toHaveAttribute(
    'href',
    'https://github.com/yudi/metro',
  );
});

test('opens the unified search from the menu', async ({ page }) => {
  await page.goto('/sp/menu');

  await page
    .getByRole('searchbox', {
      name: 'Buscar linhas, paradas e páginas',
      exact: true,
    })
    .focus();

  await expect(
    page.getByRole('dialog', { name: 'Buscar no site' }),
  ).toBeVisible();
  await expect(
    page.getByRole('searchbox', {
      name: 'Linhas, paradas e páginas',
      exact: true,
    }),
  ).toBeFocused();
});
