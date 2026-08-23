import { test, expect } from '@playwright/test';

test('navigates from the regional hub to transit search', async ({ page }) => {
  await page.goto('/');

  await expect(
    page.getByRole('heading', { name: 'Transporte Metropolitano' }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Próxima chegada' }).click();
  await expect(page).toHaveURL(/\/sp\/proxima-chegada$/);
  await expect(
    page.getByRole('heading', { name: 'Próximo trem ou ônibus' }),
  ).toBeVisible();
});
