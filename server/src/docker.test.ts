import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import Docker from 'dockerode';

import { getBitcoinRpcProbeTransports, getDockerConnectionInfo, normalizeDockerError, getStackStatus } from './docker.js';
import { DockerConnectionError } from './docker-errors.js';

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
  const err = new TypeError('Cannot read properties of undefined (reading \'id\')');
  const result = normalizeDockerError(err);
  assert.equal(result, err);
});

test('normalizeDockerError passes through docker daemon HTTP errors', () => {
  const err = Object.assign(new Error('Internal Server Error'), { statusCode: 500 });
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

  let callCount = 0;
  t.mock.method(Docker.prototype, 'getContainer', () => {
    return {
      inspect: async () => { callCount++; throw err; }
    };
  });

  await assert.rejects(
    async () => { await getStackStatus('no-jd'); },
    (error: Error) => error instanceof DockerConnectionError && error.message.includes('Docker is not reachable')
  );
  assert.equal(callCount, 1);
});

test('getStackStatus returns null on 404 (missing container)', async (t) => {
  const err = new Error('HTTP code 404 from docker');
  Object.assign(err, { statusCode: 404, reason: 'no such container', json: { message: 'No such container: jd' } });

  t.mock.method(Docker.prototype, 'getContainer', () => {
    return {
      inspect: async () => { throw err; }
    };
  });

  const status = await getStackStatus('jd');
  assert.equal(status.translator, null);
  assert.equal(status.jdc, null);
});

test('Docker connection metadata never exposes URL credentials', () => {
  const previousHost = process.env.DOCKER_HOST;
  const previousSocketPath = process.env.DOCKER_SOCKET_PATH;
  const password = 'docker-password-must-stay-secret';

  try {
    delete process.env.DOCKER_SOCKET_PATH;
    process.env.DOCKER_HOST = `https://docker-user:${password}@127.0.0.1:2376`;

    const serializedConnection = JSON.stringify(getDockerConnectionInfo());

    assert.doesNotMatch(serializedConnection, new RegExp(password));
    assert.match(serializedConnection, /docker-user/, 'the username stays for a faithful display');
  } finally {
    if (previousHost === undefined) delete process.env.DOCKER_HOST;
    else process.env.DOCKER_HOST = previousHost;

    if (previousSocketPath === undefined) delete process.env.DOCKER_SOCKET_PATH;
    else process.env.DOCKER_SOCKET_PATH = previousSocketPath;

    // Re-resolve the cached connection against the restored environment.
    getDockerConnectionInfo();
  }
});
