import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import { PassThrough } from 'node:stream';
import Docker from 'dockerode';

import {
  getBitcoinRpcProbeTransports,
  getDockerConnectionInfo,
  normalizeDockerError,
  getStackStatus,
  startJdc,
  startTranslator,
  streamContainerLogText,
} from './docker.js';
import { DockerConnectionError, isMissingContainerError } from './docker-errors.js';

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

test('a malformed DOCKER_HOST does not leak credentials through the thrown error', () => {
  const previousHost = process.env.DOCKER_HOST;
  const previousSocketPath = process.env.DOCKER_SOCKET_PATH;
  const password = 'docker-password-must-stay-secret';

  try {
    delete process.env.DOCKER_SOCKET_PATH;
    process.env.DOCKER_HOST = `https://docker-user:${password}@127.0.0.1:notaport`;

    let thrown: unknown;
    try {
      getDockerConnectionInfo();
    } catch (error) {
      thrown = error;
    }

    assert.ok(thrown instanceof Error, 'expected the malformed DOCKER_HOST to be rejected');
    // The whole serialized error is checked so neither the message nor any
    // extra property (ERR_INVALID_URL attaches the raw URL as `input`) can
    // carry the credential.
    assert.doesNotMatch(JSON.stringify(thrown), new RegExp(password));
  } finally {
    if (previousHost === undefined) delete process.env.DOCKER_HOST;
    else process.env.DOCKER_HOST = previousHost;

    if (previousSocketPath === undefined) delete process.env.DOCKER_SOCKET_PATH;
    else process.env.DOCKER_SOCKET_PATH = previousSocketPath;

    // Re-resolve the cached connection against the restored environment.
    getDockerConnectionInfo();
  }
});

function dockerFrame(stream: 'stdout' | 'stderr', payload: string): Buffer {
  const payloadBuffer = Buffer.from(payload, 'utf8');
  const header = Buffer.alloc(8);
  header.writeUInt8(stream === 'stderr' ? 2 : 1, 0);
  header.writeUInt32BE(payloadBuffer.length, 4);
  return Buffer.concat([header, payloadBuffer]);
}

function createLogSink() {
  const chunks: string[] = [];
  return {
    chunks,
    sink: {
      write: (text: string) => {
        chunks.push(text);
        return true;
      },
      onDrain: () => undefined,
      onClose: () => undefined,
    },
  };
}

function mockLogContainer(
  t: { mock: { method: (object: unknown, name: string, impl: () => unknown) => unknown } },
  raw: PassThrough
): void {
  t.mock.method(Docker.prototype, 'getContainer', () => ({
    inspect: async () => ({ State: { StartedAt: '2026-01-01T00:00:00.000000000Z' }, Config: { Tty: false } }),
    logs: async () => raw,
  }));
}

test('streams a container log history as formatted text', async (t) => {
  const raw = new PassThrough();
  let logOptions: Record<string, unknown> | null = null;
  t.mock.method(Docker.prototype, 'getContainer', () => ({
    inspect: async () => ({ State: { StartedAt: '2026-01-01T00:00:00.000000000Z' }, Config: { Tty: false } }),
    logs: async (options: Record<string, unknown>) => {
      logOptions = options;
      return raw;
    },
  }));

  const { chunks, sink } = createLogSink();
  const pending = streamContainerLogText('translator', { maxBytes: 1_000_000, sink });

  // Frames arrive incrementally; the second frame completes the first line.
  raw.write(dockerFrame('stdout', '2026-01-01T00:00:00.000000000Z transla'));
  raw.write(dockerFrame('stdout', 'tor up\n'));
  raw.write(dockerFrame('stderr', 'boom\n'));
  raw.end();

  const stats = await pending;

  assert.deepEqual(chunks, [
    '2026-01-01T00:00:00.000000000Z [translator] [stdout] translator up\n',
    '[translator] [stderr] boom\n',
  ]);
  assert.equal(stats.bytes, chunks.join('').length);
  assert.equal(stats.truncated, false);

  assert.equal(logOptions?.follow, true);
  assert.equal(logOptions?.timestamps, true);
  assert.equal(logOptions?.since, Math.floor(new Date('2026-01-01T00:00:00.000000000Z').getTime() / 1000));
  assert.equal(typeof logOptions?.until, 'number');
});

test('stops reading and reports truncation once the byte cap is reached', async (t) => {
  const raw = new PassThrough();
  const { chunks, sink } = createLogSink();

  mockLogContainer(t, raw);
  const pending = streamContainerLogText('translator', { maxBytes: 100, sink });

  raw.write(dockerFrame('stdout', '2026-01-01T00:00:00.000000000Z first line\n'));
  raw.write(dockerFrame('stdout', '2026-01-01T00:00:00.000000000Z second line\n'));
  raw.end();

  const stats = await pending;

  assert.equal(stats.truncated, true);
  assert.match(chunks[0], /first line\n$/);
  assert.match(chunks[chunks.length - 1], /^\[log export truncated at 100 bytes\]\n$/);
  assert.equal(chunks.join('').includes('second line'), false);
  assert.equal(raw.destroyed, true);
});

test('completes an export when a running container goes quiet after the backlog', async (t) => {
  const raw = new PassThrough();
  mockLogContainer(t, raw);

  const { chunks, sink } = createLogSink();
  // A running container's follow stream stays open and never emits `end`
  // (the daemon only filters on `until`); the export must finish on idle.
  const pending = streamContainerLogText('translator', { maxBytes: 1_000_000, sink });
  raw.write(dockerFrame('stdout', '2026-01-01T00:00:00.000000000Z backlog line\n'));

  const stats = await pending;

  assert.equal(stats.truncated, false);
  assert.deepEqual(chunks, [
    '2026-01-01T00:00:00.000000000Z [translator] [stdout] backlog line\n',
  ]);
  assert.equal(raw.destroyed, true);
});

test('exports TTY container output as stdout lines without frame demuxing', async (t) => {  const raw = new PassThrough();
  let logOptions: Record<string, unknown> | null = null;
  t.mock.method(Docker.prototype, 'getContainer', () => ({
    inspect: async () => ({ State: { StartedAt: null }, Config: { Tty: true } }),
    logs: async (options: Record<string, unknown>) => {
      logOptions = options;
      return raw;
    },
  }));

  const { chunks, sink } = createLogSink();
  const pending = streamContainerLogText('translator', { maxBytes: 1_000_000, sink });

  // TTY output carries no frame headers.
  raw.write('2026-01-01T00:00:00.000000000Z raw tty output\n');
  raw.end();

  await pending;

  assert.deepEqual(chunks, [
    '2026-01-01T00:00:00.000000000Z [translator] [stdout] raw tty output\n',
  ]);
  assert.equal(logOptions?.since, undefined);
});

test('keeps missing-container errors recognizable through the stream wrapper', async (t) => {
  const dockerError = Object.assign(new Error('No such container: sv2-translator'), {
    statusCode: 404,
    reason: 'no such container',
    json: { message: 'No such container: sv2-translator' },
  });
  t.mock.method(Docker.prototype, 'getContainer', () => ({
    inspect: async () => ({ State: { StartedAt: '2026-01-01T00:00:00Z' }, Config: { Tty: false } }),
    logs: async () => {
      throw dockerError;
    },
  }));

  const error = await streamContainerLogText('translator', {
    maxBytes: 1_000_000,
    sink: createLogSink().sink,
  }).then(
    () => null,
    (thrown: Error) => thrown
  );

  assert.ok(error, 'expected the stream open to be rejected');
  assert.equal(isMissingContainerError(error), true);
  assert.match(error.message, /Failed to open log stream for translator container/);
});

test('mining containers are created with bounded json-file log rotation', async (t) => {
  const created: Array<Record<string, unknown>> = [];
  // removeContainer only needs the failure to surface; it is tolerated.
  t.mock.method(Docker.prototype, 'getContainer', () => {
    throw new Error('no such container');
  });
  t.mock.method(Docker.prototype, 'createContainer', ((options: Record<string, unknown>) => {
    created.push(options);
    return Promise.resolve({ start: async () => undefined });
  }) as never);

  await startTranslator('/tmp/translator.toml', 'image:translator');
  await startJdc('/tmp/jdc.toml', '/tmp/node.sock', 'testnet', 'image:jdc');

  assert.equal(created.length, 2);
  for (const options of created) {
    assert.deepEqual((options.HostConfig as { LogConfig?: unknown }).LogConfig, {
      Type: 'json-file',
      Config: { 'max-size': '10m', 'max-file': '3' },
    });
  }
});
