import { expect, test, type Page, type Route } from '@playwright/test';
// E2E intentionally imports frontend-owned fixture data so browser tests and
// frontend unit/story tests exercise the same transit and itinerary replies.
/* eslint-disable @nx/enforce-module-boundaries */
import {
  SPTRANS_ITINERARY,
  SPTRANS_NOTICES,
  SPTRANS_PUBLISHED,
} from '../../metro-frontend/src/app/bus-itinerary/bus-itinerary.fixtures';
import {
  OMNIBOX_GRAPHQL_SEARCH_RESPONSE,
  OMNIBOX_NEARBY_RESULTS,
  OMNIBOX_SEARCH_RESULTS,
} from '../../metro-frontend/src/app/omnibox/omnibox.fixtures';
/* eslint-enable @nx/enforce-module-boundaries */

interface GraphQLRequest {
  query?: string;
  variables?: {
    input?: { query?: string };
  };
}

type SearchOverride = (
  query: string,
  route: Route,
) => Promise<boolean> | boolean;

async function installTransitGraphQL(
  page: Page,
  searchOverride?: SearchOverride,
): Promise<void> {
  await page.route('**/api/graphql', async (route) => {
    const request = route.request().postDataJSON() as GraphQLRequest;
    const query = request.query ?? '';
    const searchQuery =
      request.variables?.input?.query?.trim().toLowerCase() ?? '';

    if (query.includes('search(input: $input)')) {
      if (searchOverride && (await searchOverride(searchQuery, route))) return;
      const results = searchQuery.includes('favoritos')
        ? []
        : OMNIBOX_SEARCH_RESULTS;
      await route.fulfill({
        json: { ...OMNIBOX_GRAPHQL_SEARCH_RESPONSE, data: { search: results } },
      });
      return;
    }

    if (query.includes('nearbyStops(input: $input)')) {
      await route.fulfill({
        json: {
          data: { nearbyStops: OMNIBOX_NEARBY_RESULTS },
        },
      });
      return;
    }

    if (query.includes('busPublishedRouteInformation')) {
      await route.fulfill({
        json: { data: { busPublishedRouteInformation: SPTRANS_PUBLISHED } },
      });
      return;
    }

    if (query.includes('busRouteItinerary')) {
      await route.fulfill({
        json: { data: { busRouteItinerary: SPTRANS_ITINERARY } },
      });
      return;
    }

    if (query.includes('busOperationalNotices')) {
      await route.fulfill({
        json: {
          data: {
            busOperationalNotices: SPTRANS_NOTICES,
          },
        },
      });
      return;
    }

    if (query.includes('query GetBusStop')) {
      await route.fulfill({
        json: {
          data: {
            busStop: {
              id: '340015325',
              stopId: '340015325',
              name: 'Av. Paulista, 1000',
              description: 'Em frente ao MASP',
              latitude: -23.5614,
              longitude: -46.656,
              isSubwayStation: false,
              agencies: ['bus'],
              routeShortNames: ['477A'],
              sourceAgency: 'SPTRANS',
              sourceId: '340015325',
            },
          },
        },
      });
      return;
    }

    if (query.includes('query GetRoutesForStop')) {
      await route.fulfill({
        json: {
          data: {
            routesForStop: [
              {
                id: 'sptrans:477A-10',
                routeId: '477A-10',
                shortName: '477A',
                longName: 'Sacomã – Pinheiros',
                color: '0066CC',
                textColor: 'FFFFFF',
                sourceAgency: 'SPTRANS',
                sourceId: '477A-10',
                supportsRealtime: true,
                fares: [{ price: 5, currency: 'BRL' }],
              },
            ],
          },
        },
      });
      return;
    }

    await route.fulfill({ json: { data: {} } });
  });
}

async function openOmnibox(page: Page): Promise<void> {
  await page.goto('/sp/menu');
  const menuSearch = page.getByRole('searchbox', {
    name: 'Buscar linhas, paradas e páginas',
    exact: true,
  });
  await menuSearch.focus();

  const searchDialog = page.getByRole('dialog', { name: 'Buscar no site' });
  await expect(searchDialog).toHaveCount(0);
  await menuSearch.pressSequentially('p');
  await expect(searchDialog).toBeVisible();
}

test('preserves Typesense order and opens itinerary day and direction details', async ({
  page,
}) => {
  await installTransitGraphQL(page);
  await openOmnibox(page);
  await page
    .getByRole('searchbox', {
      name: 'Linhas, paradas e páginas',
      exact: true,
    })
    .fill('paulista');

  const resultTitles = page.locator('.result-card .result-title');
  await expect(resultTitles).toHaveText([
    'Sacomã – Pinheiros',
    'Av. Paulista, 1000',
    'Consolação',
    'Estação 35 · Jardim Europa',
  ]);

  await page.setViewportSize({ width: 1440, height: 1000 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.setViewportSize({ width: 1440, height: 1000 });

  await page
    .locator('.result-card')
    .filter({ hasText: 'Sacomã – Pinheiros' })
    .click();
  await expect(page).toHaveURL(/\/sp\/busca\/bus-route\/477A-10\?q=paulista/);
  const itinerary = page.locator('.detail');
  await expect(page.getByRole('searchbox', { name: 'Linhas, paradas e páginas' })).toHaveValue('paulista');
  await expect(itinerary.locator('.route-heading')).toContainText('477A-10');

  await itinerary.getByRole('combobox', { name: 'Dia de operação' }).click();
  await page.getByRole('option', { name: 'Sábado' }).click();
  await itinerary.getByRole('combobox', { name: 'Sentido' }).click();
  await page.getByRole('option', { name: 'Pinheiros' }).click();
  await itinerary
    .getByRole('button', { name: /Ver .* horários de partida/ })
    .click();
  await expect(itinerary.locator('#exact-departures')).toContainText('05:30');

  await itinerary.getByRole('combobox', { name: 'Sentido' }).click();
  await page.getByRole('option', { name: 'Sacomã' }).click();
  await expect(itinerary.locator('#exact-departures')).toContainText('06:00');
  await expect(itinerary.locator('#exact-departures')).not.toContainText(
    '05:30',
  );
});

test('opens arrival details from a bus stop result', async ({ page }) => {
  await installTransitGraphQL(page);
  await openOmnibox(page);
  await page
    .getByRole('searchbox', {
      name: 'Linhas, paradas e páginas',
      exact: true,
    })
    .fill('paulista');
  await page
    .locator('.result-card')
    .filter({ hasText: 'Av. Paulista, 1000' })
    .click();

  await expect(page).toHaveURL(/\/sp\/busca\/bus-stop\/340015325\?q=paulista/);
  const stopDetail = page.locator('.detail');
  await expect(stopDetail.getByText('Previsão de chegada')).toBeVisible();
  await expect(stopDetail.getByText('Ponto de ônibus')).toBeVisible();
  await page.reload();
  await expect(stopDetail.getByText('Previsão de chegada')).toBeVisible();
  await expect(stopDetail.getByRole('link', { name: 'Ver no mapa' })).toHaveAttribute('href', /busStops=340015325/);
});

test('forwards rapid menu typing into the dialog and searches the final query', async ({
  page,
}) => {
  const searchQueries: string[] = [];
  await installTransitGraphQL(page, (query) => {
    searchQueries.push(query);
    return false;
  });
  await page.goto('/sp/menu');

  const menuSearch = page.getByRole('searchbox', {
    name: 'Buscar linhas, paradas e páginas',
    exact: true,
  });
  await menuSearch.focus();
  await page.keyboard.type('paulista');

  const dialogSearch = page.getByRole('searchbox', {
    name: 'Linhas, paradas e páginas',
    exact: true,
  });
  await expect(dialogSearch).toHaveValue('paulista');
  await expect(page.locator('.menu-search .search-trigger')).toHaveCSS(
    'visibility',
    'hidden',
  );
  await expect(page.locator('.result-card .result-title').first()).toHaveText(
    'Sacomã – Pinheiros',
  );
  expect(searchQueries.at(-1)).toBe('paulista');
});

test('nearby results retain nearest first ordering', async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName !== 'chromium',
    'Playwright geolocation mock runs in Chromium.',
  );
  await page.context().grantPermissions(['geolocation']);
  await page.context().setGeolocation({ latitude: -23.56, longitude: -46.66 });
  await installTransitGraphQL(page);
  await openOmnibox(page);
  await page.getByRole('button', { name: 'Perto de mim' }).click();

  await expect(page.getByText(/Mais próximos primeiro/)).toBeVisible();
  await expect(page.locator('.result-card .result-title')).toHaveText([
    'Av. Paulista, 1000',
    'Consolação',
  ]);
});

test('keeps local page navigation available and closes the dialog on selection', async ({
  page,
}) => {
  await installTransitGraphQL(page);
  await openOmnibox(page);
  await page
    .getByRole('searchbox', {
      name: 'Linhas, paradas e páginas',
      exact: true,
    })
    .fill('favoritos');
  const pageResults = page.getByRole('navigation', {
    name: 'Resultados de páginas',
  });
  const favorites = pageResults.getByRole('link', { name: 'Favoritos' });
  await expect(favorites).toBeVisible();
  await favorites.click();

  await expect(page).toHaveURL(/\/sp\/favoritos$/);
  await expect(
    page.getByRole('dialog', { name: 'Buscar no site' }),
  ).toHaveCount(0);
});

test('cancels stale results on clear and retries failed Typesense search', async ({
  page,
}) => {
  let resolveRequestSeen: () => void = () => undefined;
  const delayedRequestSeen = new Promise<void>((resolve) => {
    resolveRequestSeen = resolve;
  });
  let releaseDelayedResponse: () => void = () => undefined;
  const delayedResponse = new Promise<void>((resolve) => {
    releaseDelayedResponse = resolve;
  });
  let failureCount = 0;

  await installTransitGraphQL(page, async (query, route) => {
    if (query === 'paulista') {
      resolveRequestSeen();
      await delayedResponse;
      try {
        await route.fulfill({
          json: { data: { search: OMNIBOX_SEARCH_RESULTS } },
        });
      } catch {
        // Clearing the field cancels the in-flight HttpClient request.
      }
      return true;
    }
    if (query === 'falha') {
      failureCount++;
      if (failureCount === 1) {
        await route.fulfill({
          status: 503,
          json: { errors: [{ message: 'Typesense unavailable' }] },
        });
      } else {
        await route.fulfill({
          json: { data: { search: OMNIBOX_SEARCH_RESULTS } },
        });
      }
      return true;
    }
    return false;
  });

  await openOmnibox(page);
  const input = page.getByRole('searchbox', {
    name: 'Linhas, paradas e páginas',
    exact: true,
  });
  await input.fill('paulista');
  await delayedRequestSeen;
  await page.getByRole('button', { name: 'Limpar busca' }).click();
  releaseDelayedResponse();
  await expect(page.locator('.result-card')).toHaveCount(0);

  await input.fill('falha');
  await expect(page.getByRole('alert')).toContainText(
    'A busca de transporte está indisponível',
  );
  await page.getByRole('button', { name: 'Tentar novamente' }).click();
  await expect(page.locator('.result-card .result-title').first()).toHaveText(
    'Sacomã – Pinheiros',
  );
  expect(failureCount).toBe(2);
});

test('Escape closes search and restores focus to its menu trigger', async ({
  page,
}) => {
  await page.goto('/sp/menu');
  const trigger = page.getByRole('searchbox', {
    name: 'Buscar linhas, paradas e páginas',
    exact: true,
  });
  await trigger.focus();
  await trigger.pressSequentially('p');
  await expect(
    page.getByRole('searchbox', {
      name: 'Linhas, paradas e páginas',
      exact: true,
    }),
  ).toBeFocused();

  await page.keyboard.press('Escape');

  await expect(
    page.getByRole('dialog', { name: 'Buscar no site' }),
  ).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await trigger.pressSequentially('a');
  await expect(
    page.getByRole('dialog', { name: 'Buscar no site' }),
  ).toBeVisible();
});
