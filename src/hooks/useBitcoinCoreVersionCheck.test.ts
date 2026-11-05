import assert from 'node:assert/strict';
import test from 'node:test';

import { QueryClient, QueryObserver, focusManager } from '@tanstack/react-query';

import {
  usableCoreVersion,
  versionCheckQueryOptions,
  versionCheckState,
} from './useBitcoinCoreVersionCheck';

test('the version is read again when the window regains focus', async (t) => {
  let reads = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    reads += 1;
    return new Response(JSON.stringify({ status: 'ready', version: reads === 1 ? '31' : '30' }));
  });

  const client = new QueryClient();
  client.mount();
  const observer = new QueryObserver(client, versionCheckQueryOptions({
    os: 'macos',
    network: 'mainnet',
    customDataDir: '',
    socketPath: '/data/node.sock',
  }, true));
  const settled = () => new Promise<void>((resolve) => setTimeout(resolve, 20));

  const unsubscribe = observer.subscribe(() => {});
  try {
    await settled();
    assert.deepEqual(observer.getCurrentResult().data, { status: 'ready', version: '31' });

    // The node moved while another window had focus.
    focusManager.setFocused(false);
    focusManager.setFocused(true);
    await settled();

    assert.equal(reads, 2);
    assert.deepEqual(observer.getCurrentResult().data, { status: 'ready', version: '30' });
  } finally {
    unsubscribe();
    focusManager.setFocused(undefined);
    client.unmount();
    client.clear();
  }
});

test('a remembered version only counts while the socket check is passing', () => {
  const ready = { phase: 'ready', version: '32' } as const;

  assert.equal(usableCoreVersion(ready, true), '32');
  assert.equal(usableCoreVersion(ready, false), null);
  assert.equal(usableCoreVersion({ phase: 'checking' }, true), null);
});

test('checking until the first answer arrives', () => {
  assert.deepEqual(versionCheckState(undefined, true), { phase: 'checking' });
  assert.deepEqual(versionCheckState(undefined, false), { phase: 'checking' });
});

test('a settled answer gives the version', () => {
  assert.deepEqual(
    versionCheckState({ status: 'ready', version: '32' }, false),
    { phase: 'ready', version: '32' },
  );
});

test('rechecking a version does not let Continue go ahead on the old answer', () => {
  assert.deepEqual(
    versionCheckState({ status: 'ready', version: '32' }, true),
    { phase: 'checking' },
  );
});

test('a node that is starting stays on screen while it is rechecked', () => {
  assert.deepEqual(versionCheckState({ status: 'starting' }, true), { phase: 'starting' });
  assert.deepEqual(versionCheckState({ status: 'starting' }, false), { phase: 'starting' });
});

test('a failure stays on screen while it is retried', () => {
  const failed = { status: 'failed', title: 't', message: 'm' } as const;
  const expected = { phase: 'failed', title: 't', message: 'm' };

  assert.deepEqual(versionCheckState(failed, false), expected);
  assert.deepEqual(versionCheckState(failed, true), expected);
});

test('no answer from the backend is a failure, not a pass', () => {
  assert.equal(versionCheckState(null, false).phase, 'failed');
  assert.equal(versionCheckState(null, true).phase, 'checking');
});
