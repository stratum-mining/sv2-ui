import assert from 'node:assert/strict';
import test from 'node:test';

import { requestDashboardClearOnSetup, takeDashboardClearOnSetup } from './dashboardState.js';

function withSessionStorage(run: () => void) {
  const store = new Map<string, string>();
  const sessionStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value); },
    removeItem: (key: string) => { store.delete(key); },
  };
  const globals = globalThis as { window?: unknown };
  const previous = globals.window;
  globals.window = { sessionStorage };
  try {
    run();
  } finally {
    globals.window = previous;
  }
}

test('a wizard run opened without Reconfigure does not clear the dashboard history', () => {
  withSessionStorage(() => {
    assert.equal(takeDashboardClearOnSetup(), false);
  });
});

test('the clear request from Reconfigure applies to one wizard run only', () => {
  withSessionStorage(() => {
    requestDashboardClearOnSetup();
    assert.equal(takeDashboardClearOnSetup(), true);
    assert.equal(takeDashboardClearOnSetup(), false);
  });
});
