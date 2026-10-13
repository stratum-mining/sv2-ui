import type { SetupData } from '../src/components/setup/types';
import { testBitcoinDiscovery } from './fixtures/api';
import { expect, test } from './fixtures';

const MAINNET_REWARD_ADDRESS = '1BoatSLRHtKNngkdXEeobR76b53LETtpyT';

test.describe('Bitcoin Core setup boundary', () => {
  test('completes pool JD setup with mocked discovery and IPC validation', async ({ page, mockApi }) => {
    const api = await mockApi({
      bitcoinDiscovery: testBitcoinDiscovery,
      bitcoinSocket: { valid: true },
      setupResponse: { body: { success: true } },
    });

    await page.goto('/');
    await page.getByRole('button', { name: 'Pool' }).click();
    await page.getByRole('button', { name: 'Custom Templates' }).click();

    await expect(page.getByRole('heading', { name: 'Select Pools' })).toBeVisible();
    await page.getByRole('button', { name: 'SRI Pool' }).click();
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByLabel('Pool username').fill('test-worker');
    await page.getByRole('button', { name: 'Continue' }).click();

    await expect(page.getByText('Bitcoin Core is ready')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('heading', { name: 'Lowest Worker Hashrate' })).toBeVisible({
      timeout: 10_000,
    });

    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByRole('heading', { name: 'Job Declaration' })).toBeVisible();
    await page.getByLabel('Solo Fallback Address').fill(MAINNET_REWARD_ADDRESS);
    await page.getByRole('button', { name: 'Continue' }).click();

    await expect(page.getByRole('heading', { name: 'Review & Start' })).toBeVisible();
    await page.getByRole('button', { name: 'Start Mining' }).click();
    await expect(page.getByRole('heading', { name: 'Client is running!' })).toBeVisible();

    const setupRequest = api.requestsFor('/api/setup', 'POST')[0];
    expect(setupRequest?.body as SetupData).toMatchObject({
      miningMode: 'pool',
      mode: 'jd',
      bitcoin: {
        core_version: '31',
        network: 'mainnet',
        socket_path: '~/.bitcoin/node.sock',
      },
      jdc: {
        coinbase_reward_address: MAINNET_REWARD_ADDRESS,
      },
    });
  });

  test('keeps JD setup actionable when the discovered IPC socket is unavailable', async ({ page, mockApi }) => {
    await mockApi({
      bitcoinDiscovery: testBitcoinDiscovery,
      bitcoinSocket: {
        valid: false,
        error: 'Socket not found at ~/.bitcoin/node.sock',
      },
    });

    await page.goto('/');
    await page.getByRole('button', { name: 'Pool' }).click();
    await page.getByRole('button', { name: 'Custom Templates' }).click();
    await page.getByRole('button', { name: 'SRI Pool' }).click();
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByLabel('Pool username').fill('test-worker');
    await page.getByRole('button', { name: 'Continue' }).click();

    await expect(page.getByText('IPC connection not found')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: 'Configure connection' })).toBeVisible();

    await page.getByRole('button', { name: 'Configure connection' }).click();
    await expect(page.getByRole('heading', { name: 'Bitcoin Core Connection' })).toBeVisible();
    await page.getByLabel('Bitcoin Core version').selectOption('31');

    await expect(page.getByText('Socket not found at ~/.bitcoin/node.sock')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue' })).toBeDisabled();
  });

  test('reports when Bitcoin Core is not detected', async ({ page, mockApi }) => {
    await mockApi({ bitcoinDiscovery: [] });
    await page.goto('/');
    await page.getByRole('button', { name: 'Pool' }).click();
    await page.getByRole('button', { name: 'Custom Templates' }).click();
    await page.getByRole('button', { name: 'SRI Pool' }).click();
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByLabel('Pool username').fill('test-worker');
    await page.getByRole('button', { name: 'Continue' }).click();

    await expect(page.getByText('Bitcoin Core isn’t detected')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Check again' })).toBeVisible();
  });

  test('reports an unsupported Bitcoin Core version', async ({ page, mockApi }) => {
    await mockApi({
      bitcoinDiscovery: [{
        ...testBitcoinDiscovery[0],
        version: 320000,
      }],
    });

    await page.goto('/');
    await page.getByRole('button', { name: 'Pool' }).click();
    await page.getByRole('button', { name: 'Custom Templates' }).click();
    await page.getByRole('button', { name: 'SRI Pool' }).click();
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByLabel('Pool username').fill('test-worker');
    await page.getByRole('button', { name: 'Continue' }).click();

    await expect(page.getByText('Update Bitcoin Core to continue')).toBeVisible();
  });
});
