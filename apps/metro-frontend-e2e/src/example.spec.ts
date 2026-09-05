import { test, expect } from '@playwright/test';

test('renders the project information route and navigation shell', async ({
  page,
}) => {
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

test('searches for a bus stop and opens its details', async ({ page }) => {
  await page.route('**/api/graphql', async (route) => {
    const request = route.request().postDataJSON() as { query?: string };
    const query = request.query ?? '';

    if (query.includes('StopSearch')) {
      await route.fulfill({
        json: {
          data: {
            search: [
              {
                __typename: 'SearchBusStop',
                id: 'stop-1',
                type: 'busStop',
                score: 1,
                stop_id: 'stop-1',
                stop_name: 'Terminal Central',
                stop_desc: 'Plataforma central',
                stop_lat: -23.55,
                stop_lon: -46.63,
                routes: [{ route_short_name: '100' }],
                highlights: [],
              },
            ],
          },
        },
      });
      return;
    }

    if (query.includes('GetBatchRoutesForStops')) {
      await route.fulfill({
        json: {
          data: {
            batchRoutesForStops: [
              { stopId: 'stop-1', routeShortNames: ['100'] },
            ],
          },
        },
      });
      return;
    }

    if (query.includes('GetBusStop')) {
      await route.fulfill({
        json: {
          data: {
            busStop: {
              id: 'stop-1',
              stopId: 'stop-1',
              name: 'Terminal Central',
              description: 'Plataforma central',
              latitude: -23.55,
              longitude: -46.63,
              isSubwayStation: false,
              agencies: ['bus'],
              routeShortNames: ['100'],
            },
          },
        },
      });
      return;
    }

    if (query.includes('GetRoutesForStop')) {
      await route.fulfill({
        json: {
          data: {
            routesForStop: [
              {
                id: 'route-100',
                routeId: 'route-100',
                shortName: '100',
                longName: 'Terminal Central - Centro',
                routeType: 3,
                color: '0055aa',
                textColor: 'ffffff',
              },
            ],
          },
        },
      });
      return;
    }

    await route.fulfill({ json: { data: {} } });
  });

  await page.goto('/proxima-chegada');
  await page.getByLabel('Estação ou ponto de ônibus').fill('Terminal');
  await expect(
    page.locator('.result-title').filter({ hasText: 'Terminal Central' }),
  ).toBeVisible();

  await page
    .locator('.result-card')
    .filter({ hasText: 'Terminal Central' })
    .click();
  await expect(
    page.locator('.dialog-header h2').filter({ hasText: 'Terminal Central' }),
  ).toBeVisible();
});
