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
  // The endpoint that was authenticated is shown instead.
  assert.match(html, /Connected to attacker\.example</);
  assert.match(html, /title="attacker\.example:3333"/);
});

test('presents a recognized pool name when address, port, and authority key match', () => {
  const queryClient = new QueryClient();
  const html = renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <Router ssrPath="/">
        <Shell
          connectionStatus="connected"
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

test('says SV1 is offline once the Translator keeps failing', () => {
  const queryClient = new QueryClient();
  const html = renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <Router ssrPath="/">
        <Shell
          connectionStatus="degraded"
          connectionLabel="Sovereign Solo"
          translatorFailing
        >
          <div>dashboard</div>
        </Shell>
      </Router>
    </QueryClientProvider>,
  );

  assert.match(html, /SV1 offline/);
  assert.doesNotMatch(html, /SV1 reconnecting/);
});

test('labels the solo fallback without a degraded note', () => {
  const queryClient = new QueryClient();
  const html = renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <Router ssrPath="/">
        <Shell
          connectionStatus="fallback"
          connectionLabel="Solo Mining (fallback)"
          uptime={125}
        >
          <div>dashboard</div>
        </Shell>
      </Router>
    </QueryClientProvider>,
  );

  assert.match(html, /Solo Mining \(fallback\)/);
  assert.match(html, /bg-amber-500/);
  assert.doesNotMatch(html, /SV1 reconnecting|Disconnected/);
});

test('brackets an IPv6 custom pool address in the endpoint tooltip', () => {
  const queryClient = new QueryClient();
  const html = renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <Router ssrPath="/">
        <Shell
          connectionStatus="connected"
          activePoolAddress="2001:db8::10"
          activePoolPort={3333}
          activePoolAuthorityPublicKey="9auqWEzQDVyd2oe1JVGFLMLHZtCo2FFqZwtKA5gd9xbuEu7PH72"
        >
          <div>dashboard</div>
        </Shell>
      </Router>
    </QueryClientProvider>,
  );

  assert.match(html, /Connected to 2001:db8::10</);
  assert.match(html, /title="\[2001:db8::10\]:3333"/);
});

test('marks a recognized fallback pool by name', () => {
  const queryClient = new QueryClient();
  const html = renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <Router ssrPath="/">
        <Shell
          connectionStatus="fallback"
          activePoolAddress="75.119.150.111"
          activePoolPort={3333}
          activePoolAuthorityPublicKey="9auqWEzQDVyd2oe1JVGFLMLHZtCo2FFqZwtKA5gd9xbuEu7PH72"
          activePoolIndex={1}
        >
          <div>dashboard</div>
        </Shell>
      </Router>
    </QueryClientProvider>,
  );

  assert.match(html, /Connected to SRI Pool \(fallback\)/);
  assert.match(html, /bg-amber-500/);
});

test('marks a custom fallback pool by its address', () => {
  const queryClient = new QueryClient();
  const html = renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <Router ssrPath="/">
        <Shell
          connectionStatus="fallback"
          activePoolAddress="backup.example.com"
          activePoolPort={3333}
          activePoolAuthorityPublicKey="9auqWEzQDVyd2oe1JVGFLMLHZtCo2FFqZwtKA5gd9xbuEu7PH72"
          activePoolIndex={2}
        >
          <div>dashboard</div>
        </Shell>
      </Router>
    </QueryClientProvider>,
  );

  assert.match(html, /Connected to backup\.example\.com \(fallback\)</);
  assert.match(html, /backup\.example\.com:3333/);
});

test('keeps the fallback mark while the Translator restarts', () => {
  const queryClient = new QueryClient();
  const html = renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <Router ssrPath="/">
        <Shell
          connectionStatus="degraded"
          activePoolAddress="75.119.150.111"
          activePoolPort={3333}
          activePoolAuthorityPublicKey="9auqWEzQDVyd2oe1JVGFLMLHZtCo2FFqZwtKA5gd9xbuEu7PH72"
          activePoolIndex={1}
        >
          <div>dashboard</div>
        </Shell>
      </Router>
    </QueryClientProvider>,
  );

  assert.match(html, /Connected to SRI Pool \(fallback\)/);
  assert.match(html, /SV1 reconnecting/);
});
