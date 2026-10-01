import { testDiagnostics, testSetupData, testStatus } from './fixtures/api';
import { expect, test } from './fixtures';

const reviewIssue = {
  code: 'saved-setup-needs-review',
  title: 'Review your setup',
  message: 'Review your setup before mining can continue.',
};

const savedStateIssue = {
  code: 'saved-setup-unavailable',
  title: 'Your saved setup needs attention',
  message: 'Your saved setup could not be read. It has not been changed.',
};

test.describe('diagnostics and setup recovery', () => {
  test('renders a service diagnostic banner with its recommendation', async ({ page, mockApi }) => {
    await mockApi({
      status: testStatus,
      translatorHealth: false,
      diagnostics: {
        ...testDiagnostics,
        diagnostics: [{
          code: 'translator-upstream-disconnected',
          severity: 'error',
          title: 'Translator is disconnected',
          message: 'The Translator cannot reach its upstream service.',
          recommendation: 'Check the pool connection and service logs.',
          streamId: 'mining-services',
          containers: ['translator'],
          detectedAt: '2026-01-01T00:00:00.000Z',
          evidence: [],
        }],
      },
    });

    await page.goto('/');

    await expect(page.getByText('Translator is disconnected', { exact: true })).toBeVisible();
    await expect(page.getByText('The Translator cannot reach its upstream service.', { exact: true })).toBeVisible();
    await expect(page.getByText('Check the pool connection and service logs.', { exact: true })).toBeVisible();
  });

  test('opens setup review from a saved configuration issue', async ({ page, mockApi }) => {
    await mockApi({
      status: {
        ...testStatus,
        running: false,
        shouldBeRunning: false,
        configurationIssues: [reviewIssue],
      },
      config: testSetupData,
    });

    await page.goto('/');

    await expect(page.getByText(reviewIssue.title, { exact: true })).toBeVisible();
    await expect(page.getByText(reviewIssue.message, { exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'Continue setup' }).click();

    await expect(page).toHaveURL(/\/setup$/);
    await expect(page.getByRole('heading', { name: 'Block Template Selection' })).toBeVisible();
  });

  test('resets an unreadable saved setup after confirmation', async ({ page, mockApi }) => {
    const api = await mockApi({
      status: {
        ...testStatus,
        running: false,
        shouldBeRunning: false,
        configurationIssues: [savedStateIssue],
      },
      controlResponses: {
        '/api/reset': { body: { success: true } },
      },
    });

    await page.goto('/');
    await expect(page.getByText(savedStateIssue.title, { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Reset setup' }).click();

    const dialog = page.getByRole('dialog', { name: 'Reset setup?' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();

    await page.getByRole('button', { name: 'Reset setup' }).click();
    await dialog.getByRole('button', { name: 'Reset setup' }).click();

    await expect.poll(() => api.requestsFor('/api/reset', 'POST').length).toBe(1);
    await expect(page).toHaveURL(/\/setup$/);
  });

  test('keeps the reset dialog open and displays reset failures', async ({ page, mockApi }) => {
    await mockApi({
      status: {
        ...testStatus,
        running: false,
        shouldBeRunning: false,
        configurationIssues: [savedStateIssue],
      },
      controlResponses: {
        '/api/reset': {
          status: 500,
          body: { success: false, error: 'Could not reset configuration' },
        },
      },
    });

    await page.goto('/');
    await page.getByRole('button', { name: 'Reset setup' }).click();
    const dialog = page.getByRole('dialog', { name: 'Reset setup?' });
    await dialog.getByRole('button', { name: 'Reset setup' }).click();

    await expect(dialog.getByText('Could not reset configuration', { exact: true })).toBeVisible();
    await expect(dialog).toBeVisible();
  });
});
