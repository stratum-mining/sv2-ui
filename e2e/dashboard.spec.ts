import { testStatus } from './fixtures/api';
import { expect, test } from './fixtures';

test.describe('dashboard', () => {
  test('renders the running no-JD dashboard and filters workers', async ({ page, mockApi }) => {
    await mockApi({ status: testStatus });

    await page.goto('/');

    await expect(page.getByText('Total Hashrate', { exact: true })).toBeVisible();
    await expect(page.getByText('Active Workers', { exact: true })).toBeVisible();
    await expect(page.getByText('Share Acceptance', { exact: true })).toBeVisible();
    await expect(page.getByText('Best Difficulty', { exact: true })).toBeVisible();
    await expect(page.getByText('test-worker', { exact: true })).toBeVisible();
    await expect(page.getByText('Connected to Test Pool', { exact: true })).toBeVisible();

    const search = page.getByPlaceholder('Search workers or connections...');
    await search.fill('does-not-exist');
    await expect(page.getByText('No workers connected', { exact: true })).toBeVisible();

    await search.fill('worker-1');
    await expect(page.getByText('test-worker', { exact: true })).toBeVisible();
  });

  test('offers to start configured but stopped services', async ({ page, mockApi }) => {
    const api = await mockApi({
      status: {
        ...testStatus,
        running: false,
        shouldBeRunning: false,
        containers: {
          translator: {
            ...testStatus.containers.translator!,
            status: 'stopped',
          },
          jdc: null,
        },
      },
      translatorHealth: false,
      controlResponses: {
        '/api/restart': { body: { success: true } },
      },
    });

    await page.goto('/');

    await expect(page.getByText('Mining services are stopped.', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Start Mining' }).click();
    await expect.poll(() => api.requestsFor('/api/restart', 'POST').length).toBe(1);
  });

  test('displays a restart error when stopped services cannot start', async ({ page, mockApi }) => {
    await mockApi({
      status: {
        ...testStatus,
        running: false,
        shouldBeRunning: false,
        containers: {
          translator: {
            ...testStatus.containers.translator!,
            status: 'stopped',
          },
          jdc: null,
        },
      },
      translatorHealth: false,
      controlResponses: {
        '/api/restart': {
          status: 500,
          body: { success: false, error: 'Docker is not reachable' },
        },
      },
    });

    await page.goto('/');
    await page.getByRole('button', { name: 'Start Mining' }).click();

    await expect(page.getByText('Docker is not reachable', { exact: true })).toBeVisible();
  });
});
