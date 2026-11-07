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

function render(authenticated: boolean): string {
  const queryClient = new QueryClient();
  const auth: AuthState = { passwordSet: true, authenticated, recoveryKeySet: true, needsSetup: false };
  queryClient.setQueryData(AUTH_QUERY_KEY, auth);
  queryClient.setQueryData(['version-info'], VERSION);
  return renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <Router ssrPath="/faq">
        <FAQ />
      </Router>
    </QueryClientProvider>,
  );
}

test('the Support page shows the running version to a signed-in operator', () => {
  assert.ok(render(true).includes(VERSION_LINE));
});

// "I cannot log in" is a support case, so the line must not depend on a session.
test('the Support page shows the running version to a visitor without a session', () => {
  assert.ok(render(false).includes(VERSION_LINE));
});
