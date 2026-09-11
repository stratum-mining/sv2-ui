import type { SetupData } from '../src/components/setup/types';
import { expect, test } from './fixtures';

test.describe('setup wizard', () => {
  test('redirects an unconfigured application to setup', async ({ page, mockApi }) => {
    await mockApi();

    await page.goto('/');

    await expect(page).toHaveURL(/\/setup$/);
    await expect(
      page.getByText("Choose how you'll mine bitcoin", { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Solo' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Pool' })).toBeVisible();
  });

  test('completes pool mining with pool-provided templates', async ({ page, mockApi }) => {
    const api = await mockApi({
      setupResponse: { body: { success: true } },
    });

    await page.goto('/');
    await page.getByRole('button', { name: 'Pool' }).click();

    await expect(
      page.getByRole('heading', { name: 'Block Template Selection' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Pool Templates' }).click();

    await expect(page.getByRole('heading', { name: 'Select Pools' })).toBeVisible();
    const continueButton = page.getByRole('button', { name: 'Continue' });
    await expect(continueButton).toBeDisabled();

    await page.getByRole('button', { name: 'Braiins Pool' }).click();
    await expect(continueButton).toBeEnabled();
    await continueButton.click();

    await expect(page.getByRole('heading', { name: 'Add Pool Username' })).toBeVisible();
    await page.getByLabel('Pool username').fill('test-worker');
    await page.getByRole('button', { name: 'Continue' }).click();

    await expect(page.getByRole('heading', { name: 'Lowest Worker Hashrate' })).toBeVisible();
    await page.getByRole('button', { name: 'Continue' }).click();

    await expect(page.getByRole('heading', { name: 'Review & Start' })).toBeVisible();
    await expect(page.getByText('Pool Templates')).toBeVisible();
    await expect(page.getByText('Braiins Pool', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Start Mining' }).click();

    await expect(page.getByRole('heading', { name: 'Client is running!' })).toBeVisible();

    const setupRequests = api.requestsFor('/api/setup', 'POST');
    expect(setupRequests).toHaveLength(1);
    expect(setupRequests[0]?.body as SetupData).toMatchObject({
      miningMode: 'pool',
      mode: 'no-jd',
      pool: {
        user_identity: 'test-worker',
      },
      translator: {
        min_hashrate: 100_000_000_000_000,
      },
    });
  });
});
