import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Router } from 'wouter';
import type { VersionInfo } from '@sv2-ui/shared';

import { FAQ } from './FAQ.js';
import { AUTH_QUERY_KEY, type AuthState } from '../hooks/useAuth.js';

const VERSION: VersionInfo = { version: 'v0.8.2', commit: null, sv2AppsVersions: ['v0.9.2'] };
const VERSION_LINE = 'sv2-ui v0.8.2 · sv2-apps v0.9.2';

function render(authenticated: boolean): { html: string; queryKeys: string[] } {
  const queryClient = new QueryClient();
  const auth: AuthState = { passwordSet: true, authenticated, recoveryKeySet: true, needsSetup: false };
  queryClient.setQueryData(AUTH_QUERY_KEY, auth);
  queryClient.setQueryData(['version-info'], VERSION);
  const html = renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <Router ssrPath="/faq">
        <FAQ />
      </Router>
    </QueryClientProvider>,
  );
  const queryKeys = queryClient.getQueryCache().getAll().map((query) => JSON.stringify(query.queryKey));
  return { html, queryKeys };
}

test('the Support page shows the running version to a signed-in operator', () => {
  assert.ok(render(true).html.includes(VERSION_LINE));
});

// "I cannot log in" is a support case, so the line must not depend on a session.
test('the Support page shows the running version to a visitor without a session', () => {
  assert.ok(render(false).html.includes(VERSION_LINE));
});

test('a signed-in operator gets the signed-in navigation and a Log out button', () => {
  const { html } = render(true);
  assert.match(html, /aria-label="Log out"/);
  assert.match(html, />Dashboard</);
});

test('a visitor without a session gets the FAQ without signed-in navigation or connection status', () => {
  const { html } = render(false);
  assert.match(html, /Support &amp; FAQ/);
  assert.match(html, /Back to login/);
  assert.doesNotMatch(html, /Log out/);
  assert.doesNotMatch(html, />Dashboard</);
  assert.doesNotMatch(html, /Disconnected|Uptime/);
});

// The connection status polls endpoints that answer 401 without a session.
test('a visitor without a session queries only public endpoints', () => {
  const { queryKeys } = render(false);
  assert.deepEqual(queryKeys.sort(), [JSON.stringify(AUTH_QUERY_KEY), JSON.stringify(['version-info'])].sort());
});
