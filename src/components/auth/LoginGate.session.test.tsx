import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { JSDOM } from 'jsdom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';

import { AUTH_QUERY_KEY, type AuthState } from '../../hooks/useAuth.js';

// react-dom decides whether it has a DOM when it is first imported, so the
// globals have to exist before it loads: hence the dynamic imports below.
const dom = new JSDOM('', { url: 'http://localhost/' }).window;
// jsdom has no layout, hence no media queries; the theme falls back to one.
dom.matchMedia = () => ({ matches: false }) as MediaQueryList;
Object.assign(globalThis, {
  window: dom,
  document: dom.document,
  localStorage: dom.localStorage,
  IS_REACT_ACT_ENVIRONMENT: true,
});

const { act } = await import('react');
const { createRoot } = await import('react-dom/client');
const { LoginGate } = await import('./LoginGate.js');

const SETUP_KEY = 'initial-setup-recovery-key';
const ROTATED_KEY = 'rotated-recovery-key';

/**
 * Mounts the gate against a stand-in for the auth API. `server` is what
 * `GET /api/auth/state` answers, so a test ends the session by editing it and
 * refetching, the way a logout in another tab or an expiry reaches the page.
 */
async function mountGate(t: TestContext, server: AuthState) {
  t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL) => {
    const path = String(input);
    if (path === '/api/auth/setup-password') {
      Object.assign(server, { passwordSet: true, authenticated: true, recoveryKeySet: true });
      return Response.json({ success: true, recoveryKey: SETUP_KEY });
    }
    if (path === '/api/auth/recover') {
      return Response.json({ success: true, recoveryKey: ROTATED_KEY });
    }
    assert.equal(path, '/api/auth/state');
    return Response.json(server);
  });

  // No garbage-collection timers, which would keep the test process alive.
  const queryClient = new QueryClient({
    defaultOptions: { queries: { gcTime: Infinity }, mutations: { gcTime: Infinity } },
  });
  queryClient.setQueryData(AUTH_QUERY_KEY, { ...server });

  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  t.after(() => {
    act(() => root.unmount());
    container.remove();
  });

  // Lets the query and mutation callbacks that follow an action run.
  const settle = () => act(() => new Promise<void>((resolve) => setTimeout(resolve, 20)));

  await act(async () => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <Router hook={memoryLocation({ path: '/' }).hook}>
          <LoginGate>
            <div>dashboard</div>
          </LoginGate>
        </Router>
      </QueryClientProvider>,
    );
  });

  const field = (id: string) => {
    const input = container.querySelector<HTMLInputElement>(`#${id}`);
    assert.ok(input, `expected a #${id} field`);
    return input;
  };

  return {
    text: () => container.textContent ?? '',
    field,
    async fill(id: string, value: string) {
      const input = field(id);
      await act(async () => {
        // React tracks the value it last wrote, so the change has to go
        // through the element's own setter to be seen as user input.
        Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value')!.set!.call(input, value);
        input.dispatchEvent(new window.Event('input', { bubbles: true }));
      });
    },
    async click(label: string) {
      const button = [...container.querySelectorAll('button')].find((b) => b.textContent === label);
      assert.ok(button, `expected a "${label}" button`);
      await act(async () => button.click());
      await settle();
    },
    async refetchAuthState() {
      await act(() => queryClient.refetchQueries({ queryKey: AUTH_QUERY_KEY }));
      await settle();
    },
  };
}

test('the initial-setup recovery key leaves the page when the session ends', async (t) => {
  const server: AuthState = { passwordSet: false, authenticated: false, recoveryKeySet: false, needsSetup: false };
  const gate = await mountGate(t, server);

  await gate.fill('new-password', 'operator-password');
  await gate.fill('confirm-password', 'operator-password');
  await gate.click('Create password');
  assert.match(gate.text(), new RegExp(SETUP_KEY), 'setup shows the key so the operator can save it');

  // A logout in another tab, or the session expiring.
  server.authenticated = false;
  await gate.refetchAuthState();
  assert.match(gate.text(), /Unlock sv2-ui/);
  assert.doesNotMatch(gate.text(), new RegExp(SETUP_KEY));

  // Gone from the page state too: logging back in does not bring it back.
  server.authenticated = true;
  await gate.refetchAuthState();
  assert.match(gate.text(), /dashboard/);
  assert.doesNotMatch(gate.text(), new RegExp(SETUP_KEY));
});

test('the initial-setup recovery key stays up while the session lasts', async (t) => {
  const server: AuthState = { passwordSet: false, authenticated: false, recoveryKeySet: false, needsSetup: false };
  const gate = await mountGate(t, server);

  await gate.fill('new-password', 'operator-password');
  await gate.fill('confirm-password', 'operator-password');
  await gate.click('Create password');

  // The server returns the key only once: a refetch must not dismiss it.
  await gate.refetchAuthState();
  assert.match(gate.text(), new RegExp(SETUP_KEY));
  assert.doesNotMatch(gate.text(), /dashboard/);

  await gate.click("I've saved it");
  assert.match(gate.text(), /dashboard/);
  assert.doesNotMatch(gate.text(), new RegExp(SETUP_KEY));
});

test('cancelling the forgot-password form drops what was typed', async (t) => {
  const gate = await mountGate(t, { passwordSet: true, authenticated: false, recoveryKeySet: true, needsSetup: false });

  await gate.click('Forgot password?');
  await gate.fill('recovery-key', 'typed-recovery-key');
  await gate.fill('new-password', 'operator-password');
  await gate.fill('confirm-password', 'operator-password');
  assert.equal(gate.field('recovery-key').value, 'typed-recovery-key');
  await gate.click('Cancel');
  assert.match(gate.text(), /Unlock sv2-ui/);

  await gate.click('Forgot password?');
  assert.equal(gate.field('recovery-key').value, '');
  assert.equal(gate.field('new-password').value, '');
  assert.equal(gate.field('confirm-password').value, '');
});

test('leaving a completed password reset drops the new recovery key', async (t) => {
  const gate = await mountGate(t, { passwordSet: true, authenticated: false, recoveryKeySet: true, needsSetup: false });

  await gate.click('Forgot password?');
  await gate.fill('recovery-key', 'typed-recovery-key');
  await gate.fill('new-password', 'operator-password');
  await gate.fill('confirm-password', 'operator-password');
  await gate.click('Reset password');
  assert.match(gate.text(), new RegExp(ROTATED_KEY), 'the reset shows the new key so the operator can save it');

  await gate.click('Log in');
  assert.match(gate.text(), /Unlock sv2-ui/);
  assert.doesNotMatch(gate.text(), new RegExp(ROTATED_KEY));

  await gate.click('Forgot password?');
  assert.doesNotMatch(gate.text(), new RegExp(ROTATED_KEY));
  assert.equal(gate.field('recovery-key').value, '');
  assert.equal(gate.field('new-password').value, '');
  assert.equal(gate.field('confirm-password').value, '');
});
