import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import Docker from 'dockerode';

import { getBitcoinRpcProbeTransports, normalizeDockerError, getStackStatus, DockerConnectionError } from './docker.js';

test('Bitcoin RPC probing tries host loopback before Docker host gateway', () => {
  assert.deepEqual(getBitcoinRpcProbeTransports(), [
    {
      name: 'host-loopback',
      host: '127.0.0.1',
      networkMode: 'host',
    },
    {
      name: 'docker-host-gateway',
      host: 'host.docker.internal',
      networkMode: 'bridge',
      extraHosts: ['host.docker.internal:host-gateway'],
    },
  ]);
});

test('normalizeDockerError handles non-Error objects', () => {
  const result = normalizeDockerError('Just a string');
  assert.equal(result.message, 'Just a string');
});

test('normalizeDockerError passes through unrelated errors', () => {
  const err = new Error('EADDRINUSE');
  (err as NodeJS.ErrnoException).code = 'EADDRINUSE';
  const result = normalizeDockerError(err);
  assert.equal(result, err);
});

test('normalizeDockerError formats ECONNREFUSED with no available sockets', (t) => {
  t.mock.method(fs, 'existsSync', () => false);
  const err = new Error('connect ECONNREFUSED');
  (err as NodeJS.ErrnoException).code = 'ECONNREFUSED';

  const result = normalizeDockerError(err);

  assert.match(result.message, /^Docker is not reachable/);
  assert.match(result.message, /Ensure Docker Engine or Docker Desktop is running/);
});

test('normalizeDockerError formats ECONNREFUSED with available sockets and filters current endpoint', (t) => {
  // Mock existsSync to always return true, meaning all paths are technically "available".
  // The filtering logic inside normalizeDockerError should successfully exclude the *current*
  // default endpoint from the "Other available sockets" list.
  t.mock.method(fs, 'existsSync', () => true);

  const err = new Error('connect ECONNREFUSED');
  (err as NodeJS.ErrnoException).code = 'ECONNREFUSED';

  const result = normalizeDockerError(err);

  assert.match(result.message, /^Docker is not reachable/);
  assert.match(result.message, /Ensure Docker Engine or Docker Desktop is running/);
  assert.match(result.message, /Other available sockets found:/);
  
  // The current endpoint should not be in the list of *other* available sockets
  const otherSockets = result.message.split('Other available sockets found:')[1];
  assert.ok(!otherSockets.includes('/var/run/docker.sock'));
  assert.ok(otherSockets.includes('.docker'));
});

test('normalizeDockerError formats EACCES to hint at permissions', () => {
  const err = new Error('connect EACCES');
  (err as NodeJS.ErrnoException).code = 'EACCES';

  const result = normalizeDockerError(err);

  assert.match(result.message, /^Permission denied when accessing Docker/);
  assert.match(result.message, /Check file permissions or ensure your user is in the 'docker' group/);
});

test('getStackStatus throws normalized error on ECONNREFUSED', async (t) => {
  const err = new Error('connect ECONNREFUSED');
  (err as NodeJS.ErrnoException).code = 'ECONNREFUSED';

  t.mock.method(Docker.prototype, 'getContainer', () => {
    return {
      inspect: async () => { throw err; }
    };
  });

  await assert.rejects(
    async () => { await getStackStatus('no-jd'); },
    (error: Error) => error instanceof DockerConnectionError
  );
});

test('getStackStatus returns null on 404 (missing container)', async (t) => {
  const err = new Error('No such container');
  (err as Error & { statusCode?: number }).statusCode = 404;

  t.mock.method(Docker.prototype, 'getContainer', () => {
    return {
      inspect: async () => { throw err; }
    };
  });

  const status = await getStackStatus('jd');
  assert.equal(status.translator, null);
  assert.equal(status.jdc, null);
});
