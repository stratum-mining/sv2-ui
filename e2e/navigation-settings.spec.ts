import { testStatus } from './fixtures/api';
import { expect, test } from './fixtures';

test.describe('navigation and settings', () => {
  test('navigates between dashboard, settings, and support', async ({ page, mockApi }) => {
    await mockApi({ status: testStatus });
    await page.goto('/');

    await page.getByRole('link', { name: 'Settings' }).click();
    await expect(page).toHaveURL(/\/settings$/);
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();

    await page.getByRole('link', { name: 'Support & FAQ' }).click();
    await expect(page).toHaveURL(/\/faq$/);
    await expect(page.getByRole('heading', { name: 'Support & FAQ' })).toBeVisible();

    const question = 'Why is my miner not submitting any shares?';
    await page.getByRole('button', { name: question }).click();
    await expect(page.getByText(/initial difficulty setting/)).toBeVisible();

    await page.getByRole('link', { name: 'Dashboard' }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByText('Total Hashrate', { exact: true })).toBeVisible();
  });

  test('loads logs and exercises appearance settings', async ({ page, mockApi }) => {
    const api = await mockApi({ status: testStatus });
    await page.goto('/settings');

    await page.getByRole('tab', { name: 'Logs' }).click();
    await expect(page.getByText('No log output yet. Services may not be running.', { exact: true })).toBeVisible();
    await expect.poll(() => api.requestsFor('/api/logs/raw', 'GET').length).toBeGreaterThan(0);

    await page.getByRole('tab', { name: 'Appearance' }).click();
    await expect(page.getByText('Customize the logo and primary accent color.', { exact: true })).toBeVisible();

    await page.locator('input[type="file"]').setInputFiles({
      name: 'not-an-image.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('not an image'),
    });
    await expect(page.getByRole('alert')).toHaveText(
      'Please choose an image file (PNG, JPG, SVG, or GIF).',
    );

    const root = page.locator('html');
    const initiallyDark = await root.evaluate((element) => element.classList.contains('dark'));
    await page.getByRole('button', { name: 'Toggle theme' }).click();
    await expect.poll(() => root.evaluate((element) => element.classList.contains('dark')))
      .toBe(!initiallyDark);
  });
});
