import { expect, test } from '@playwright/test';

test.describe('configuração de notificações', () => {
  test('mantém a configuração protegida para quem não entrou', async ({ page }) => {
    await page.addInitScript(() => {
      const browserWindow = window as unknown as {
        Notification?: {
          permission?: string;
          requestPermission?: () => Promise<string>;
        };
        permissionRequested?: boolean;
      };
      const nativeNotification = browserWindow.Notification;
      browserWindow.permissionRequested = false;
      Object.defineProperty(browserWindow, 'Notification', {
        configurable: true,
        value: {
          permission: nativeNotification?.permission ?? 'default',
          requestPermission: () => {
            browserWindow.permissionRequested = true;
            return nativeNotification?.requestPermission?.() ?? Promise.resolve('granted');
          },
        },
      });
    });

    await page.goto('/notifications');

    await expect(
      page.getByRole('heading', { name: 'Entre para configurar avisos' }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Fazer login com o Google' }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => (window as unknown as { permissionRequested?: boolean }).permissionRequested,
      ),
    ).toBe(false);
  });

  test('liga o menu à página de notificações', async ({ page }) => {
    await page.goto('/menu');

    const notificationsLink = page.getByRole('link', { name: 'Notificações' });
    await expect(notificationsLink).toHaveAttribute('href', /notifications/);
    await notificationsLink.click();
    await expect(page).toHaveTitle(/Notificações \| Transporte Metropolitano/);
  });
});
