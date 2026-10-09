import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Router } from 'wouter';

import { Shell } from './Shell.js';

test('does not present an unverified configured name as the connected pool identity', () => {
  const queryClient = new QueryClient();
  const html = renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <Router ssrPath="/">
        <Shell
          connectionStatus="connected"
          poolName="Braiins Pool"
          activePoolAddress="attacker.example"
          activePoolPort={3333}
          activePoolAuthorityPublicKey="9auqWEzQDVyd2oe1JVGFLMLHZtCo2FFqZwtKA5gd9xbuEu7PH72"
        >
          <div>dashboard</div>
        </Shell>
      </Router>
    </QueryClientProvider>,
  );

  assert.equal(
    html.includes('Connected to Braiins Pool'),
    false,
    'a display name from configuration must not be presented as an authenticated ' +
      'pool identity when address, port, and authority key do not match the preset',
  );
});

test('presents a recognized pool name when address, port, and authority key match', () => {
  const queryClient = new QueryClient();
  const html = renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <Router ssrPath="/">
        <Shell
          connectionStatus="connected"
          poolName="Braiins Pool"
          activePoolAddress="stratum.braiins.com"
          activePoolPort={3333}
          activePoolAuthorityPublicKey="9awtMD5KQgvRUh2yFbjVeT7b6hjipWcAsQHd6wEhgtDT9soosna"
        >
          <div>dashboard</div>
        </Shell>
      </Router>
    </QueryClientProvider>,
  );

  assert.equal(
    html.includes('Connected to Braiins Pool'),
    true,
    'a recognized pool should display its authenticated name',
  );
});

test('keeps the pool and explains SV1 reconnecting while the stack is degraded', () => {
  const queryClient = new QueryClient();
  const html = renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <Router ssrPath="/">
        <Shell
          connectionStatus="degraded"
          connectionLabel="Sovereign Solo"
          uptime={125}
        >
          <div>dashboard</div>
        </Shell>
      </Router>
    </QueryClientProvider>,
  );

  assert.match(html, /Sovereign Solo/);
  assert.match(html, /SV1 reconnecting/);
  assert.doesNotMatch(html, /Disconnected/);
});
