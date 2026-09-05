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

test('searches for a bus stop and opens its detail view', async ({ page }) => {
  await page.route('**/graphql', async (route) => {
    const request = route.request().postDataJSON() as { query?: string };
    const query = request.query ?? '';

    if (query.includes('LiteSpecialRailServices')) {
      await route.fulfill({
        json: { data: { railSpecialServices: [] } },
      });
      return;
    }

    if (query.includes('LiteSearch')) {
      await route.fulfill({
        json: {
          data: {
            search: [
              {
                __typename: 'SearchBusStop',
                id: 'stop-1',
                type: 'busStop',
                stop_id: 'stop-1',
                stop_name: 'Terminal Central',
                stop_lat: -23.55,
                stop_lon: -46.63,
                routes: [
                  {
                    id: 'route-100',
                    route_id: 'route-100',
                    route_short_name: '100',
                    route_long_name: 'Terminal Central - Centro',
                    route_type: 3,
                    route_color: '0055aa',
                    route_text_color: 'ffffff',
                  },
                ],
              },
            ],
          },
        },
      });
      return;
    }

    await route.fulfill({ json: { data: {} } });
  });

  await page.goto('/sp/proxima-chegada');
  await page.locator('input[type="search"]').fill('Terminal');
  await page.getByRole('button', { name: 'Buscar' }).click();
  await expect(
    page.locator('.stop-name').filter({ hasText: 'Terminal Central' }),
  ).toBeVisible();

  await page
    .locator('lite-card')
    .filter({ hasText: 'Terminal Central' })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Terminal Central' }),
  ).toBeVisible();
});
