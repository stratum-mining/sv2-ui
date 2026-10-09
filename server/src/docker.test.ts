import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import { PassThrough } from 'node:stream';
import Docker from 'dockerode';
import Modem from 'docker-modem';

import {
  containerLogsPath,
  DOCKER_CALL_TIMEOUT_MS,
  getBitcoinRpcProbeTransports,
  getDockerConnectionInfo,
  normalizeDockerError,
  getStackStatus,
  restartTranslator,
  startJdc,
  startTranslator,
  streamContainerLogText,
} from './docker.js';
import { formatMergedLogLine, type MergedLogLine } from './logs/export.js';
import { DockerConnectionError, isMissingContainerError } from './docker-errors.js';
import type { SetupData } from './types.js';

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
  // Note: We return false for '/.dockerenv' to test the non-Docker environment message.
  t.mock.method(fs, 'existsSync', (p: string | Buffer | URL) => String(p) !== '/.dockerenv');

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

test('normalizeDockerError formats SSH failures with proper hints', () => {
  const err = new Error('ssh connection failed');
  Object.assign(err, { level: 'client-authentication' });

  const result = normalizeDockerError(err);
  assert.match(result.message, /\[client-authentication\]/);
  assert.match(result.message, /Ensure the SSH user, key, and host are correct/);
});

test('normalizeDockerError appends container hints when inside docker', (t) => {
  // Mock fs.existsSync to return true only for /.dockerenv
  t.mock.method(fs, 'existsSync', (p: fs.PathLike) => p === '/.dockerenv');

  const err = new Error('connect ECONNREFUSED');
  (err as NodeJS.ErrnoException).code = 'ECONNREFUSED';

  // The local socket default applies, which triggers the 'isSocket' true branch
  const result = normalizeDockerError(err);
  assert.match(result.message, /Ensure Docker Engine or Docker Desktop is running/);
  assert.match(result.message, /Also ensure the socket volume is mounted into this container/);
});

test('normalizeDockerError suggests checking DOCKER_SOCKET_PATH or DOCKER_HOST when no sockets are found', (t) => {
  // Ensure no other sockets are found
  t.mock.method(fs, 'existsSync', (_p: fs.PathLike) => false);
  
  const err = new Error('connect ENOENT');
  (err as NodeJS.ErrnoException).code = 'ENOENT';
  
  const result = normalizeDockerError(err);
  assert.match(result.message, /Or check your DOCKER_SOCKET_PATH \/ DOCKER_HOST endpoint\./);
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

test('getStackStatus rejects with DockerConnectionError on HTML proxy 404', async (t) => {
  const err = new Error('HTTP 404 Not Found');
  Object.assign(err, { statusCode: 404 });

  t.mock.method(Docker.prototype, 'getContainer', () => {
    return {
      inspect: async () => { throw err; }
    };
  });

  await assert.rejects(
    async () => await getStackStatus('jd'),
    (error: Error) => error instanceof DockerConnectionError && error.message.includes('not a Docker daemon')
  );
});

test('normalizeDockerError passes through Docker-shaped 404s unchanged', () => {
  const err = new Error('HTTP code 404 from docker');
  Object.assign(err, { statusCode: 404, json: { message: 'manifest for some-image:latest not found' } });
  
  const result = normalizeDockerError(err);
  assert.equal(result, err);
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

test('getStackStatus rejects with a standard Error when inspect throws 500', async (t) => {
  const err = new Error('HTTP code 500 from docker');
  Object.assign(err, { statusCode: 500, reason: 'server error' });

  t.mock.method(Docker.prototype, 'getContainer', () => {
    return {
      inspect: async () => { throw err; }
    };
  });

  await assert.rejects(
    async () => await getStackStatus('jd'),
    (error: Error) => {
      assert.strictEqual(error.message, 'HTTP code 500 from docker');
      assert.strictEqual(error instanceof DockerConnectionError, false);
      return true;
    }
  );
});

test('normalizeDockerError maps ABORT_ERR to timeout message', () => {
  const err = new Error('The operation was aborted');
  (err as NodeJS.ErrnoException).code = 'ABORT_ERR';

  const result = normalizeDockerError(err);
  assert.ok(result instanceof DockerConnectionError);
  assert.match(result.message, /^Docker did not respond within 10 s at/);
});

test('normalizeDockerError maps proxy 404 to DockerConnectionError', () => {
  const err = new Error('HTTP 404 from Nginx');
  Object.assign(err, { statusCode: 404 });

  const result = normalizeDockerError(err);
  assert.ok(result instanceof DockerConnectionError);
  assert.match(result.message, /is not a Docker daemon \(HTTP 404\)/);
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
  let stop: (() => void) | null = null;
  return {
    chunks,
    // Stands in for the browser aborting the download: the response closes
    // while the read may still be opening.
    closeSink: () => {
      const registered = stop;
      stop = null;
      registered?.();
    },
    sink: {
      // Rendered here the way the merged writer does, so these assertions read
      // as the text that would reach the file.
      write: (line: MergedLogLine) => {
        chunks.push(formatMergedLogLine(line) + '\n');
        return true;
      },
      onDrain: () => undefined,
      onClose: (registered: () => void) => {
        stop = registered;
      },
    },
  };
}

// The export dials the logs endpoint directly (container.logs() can only
// return a stream while following), so the fake daemon is the container's
// modem, which is where dockerode itself issues the request.
function mockLogStream(
  t: { mock: { method: (object: unknown, name: string, impl: () => unknown) => unknown } },
  raw: PassThrough,
  options: { tty?: boolean; startedAt?: string | null; onDial?: (opts: Record<string, unknown>) => void } = {}
): void {
  t.mock.method(Docker.prototype, 'getContainer', () => ({
    id: 'container-id',
    inspect: async () => ({
      State: { StartedAt: options.startedAt === undefined ? '2026-01-01T00:00:00.000000000Z' : options.startedAt },
      Config: { Tty: options.tty ?? false },
    }),
    modem: {
      dial: (
        dialOptions: Record<string, unknown>,
        callback: (error: Error | null, stream: unknown) => void
      ) => {
        options.onDial?.(dialOptions);
        callback(null, raw);
      },
    },
  }));
}

function mockLogContainer(
  t: { mock: { method: (object: unknown, name: string, impl: () => unknown) => unknown } },
  raw: PassThrough
): void {
  mockLogStream(t, raw);
}

test('streams a container log history as formatted text', async (t) => {
  const raw = new PassThrough();
  let dialOptions: Record<string, unknown> | null = null;
  mockLogStream(t, raw, { onDial: (options) => { dialOptions = options; } });

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

  // follow must stay off: the daemon only closes a non-followed log
  // response, and that `end` is the export's completion signal.
  const query = dialOptions?.options as Record<string, unknown>;
  assert.equal(dialOptions?.isStream, true);
  assert.equal(query.follow, false);
  assert.equal(query.timestamps, true);
  assert.equal(query.since, Math.floor(new Date('2026-01-01T00:00:00.000000000Z').getTime() / 1000));
  assert.equal(query.until, undefined);
});

test('sends the log options in the URL the daemon actually receives', () => {
  // docker-modem appends `options` as a querystring only when the path
  // already contains '?'; otherwise the request goes out with no parameters
  // at all and the daemon rejects it with 400 "must specify at least one of
  // 'stdout' or 'stderr'". A fake modem cannot catch that, so check the URL
  // the real modem would build from the path we hand it.
  const modem = new Modem({ socketPath: '/var/run/docker.sock' });
  const path = containerLogsPath('container-id');

  assert.match(path, /\?$/, 'the modem drops the querystring without a "?"');
  assert.equal(
    `${path}${modem.buildQuerystring({
      stdout: true,
      stderr: true,
      follow: false,
      timestamps: true,
      since: 1,
    })}`,
    '/containers/container-id/logs?stdout=true&stderr=true&follow=false&timestamps=true&since=1'
  );
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
  assert.match(chunks[chunks.length - 1], /^\[log export for translator truncated at 100 bytes\]\n$/);
  assert.equal(chunks.join('').includes('second line'), false);
  assert.equal(raw.destroyed, true);
});

test('completes an export when the daemon closes the log stream', async (t) => {
  const raw = new PassThrough();
  mockLogContainer(t, raw);

  const { chunks, sink } = createLogSink();
  const pending = streamContainerLogText('translator', { maxBytes: 1_000_000, sink });
  raw.write(dockerFrame('stdout', '2026-01-01T00:00:00.000000000Z backlog line\n'));
  raw.end();

  const stats = await pending;

  assert.equal(stats.truncated, false);
  assert.deepEqual(chunks, [
    '2026-01-01T00:00:00.000000000Z [translator] [stdout] backlog line\n',
  ]);
  assert.equal(raw.destroyed, true);
});

test('keeps the last line when the daemon never terminates it', async (t) => {
  const raw = new PassThrough();
  mockLogContainer(t, raw);

  const { chunks, sink } = createLogSink();
  const pending = streamContainerLogText('translator', { maxBytes: 1_000_000, sink });
  // A crash message is the classic case: the final write carries no newline.
  raw.write(dockerFrame('stdout', '2026-01-01T00:00:00.000000000Z terminated\n'));
  raw.write(dockerFrame('stderr', 'panic: boom'));
  raw.end();

  const stats = await pending;

  assert.equal(stats.truncated, false);
  assert.deepEqual(chunks, [
    '2026-01-01T00:00:00.000000000Z [translator] [stdout] terminated\n',
    '[translator] [stderr] panic: boom\n',
  ]);
});

test('waits for a slow daemon instead of exporting an empty history', async (t) => {
  const raw = new PassThrough();
  mockLogContainer(t, raw);

  const { chunks, sink } = createLogSink();
  const pending = streamContainerLogText('translator', { maxBytes: 1_000_000, sink });

  let settled = false;
  void pending.then(() => { settled = true; });

  // Nothing has arrived yet. Treating the silence as "done" here is what
  // silently produced a header-only export that still reported success.
  await new Promise<void>((resolve) => setTimeout(resolve, 1_200));
  assert.equal(settled, false);

  raw.write(dockerFrame('stdout', '2026-01-01T00:00:00.000000000Z late line\n'));
  raw.end();

  const stats = await pending;
  assert.equal(stats.truncated, false);
  assert.deepEqual(chunks, [
    '2026-01-01T00:00:00.000000000Z [translator] [stdout] late line\n',
  ]);
});

test('a slow client delays the export instead of truncating it', async (t) => {
  const raw = new PassThrough();
  mockLogContainer(t, raw);

  const chunks: string[] = [];
  let resume: (() => void) | null = null;
  let firstWrite = true;
  const sink = {
    // The first write reports backpressure, as a slow HTTP client would.
    write: (line: MergedLogLine) => {
      chunks.push(formatMergedLogLine(line) + '\n');
      if (firstWrite) {
        firstWrite = false;
        return false;
      }
      return true;
    },
    onDrain: (fn: () => void) => { resume = fn; },
    onClose: () => undefined,
  };

  const pending = streamContainerLogText('translator', { maxBytes: 1_000_000, sink });
  raw.write(dockerFrame('stdout', '2026-01-01T00:00:00.000000000Z one\n'));
  raw.write(dockerFrame('stdout', '2026-01-01T00:00:00.000000000Z two\n'));

  await new Promise<void>((resolve) => setTimeout(resolve, 1_500));
  // Still waiting for the writer: backpressure must not end the export, and
  // nothing may be reported as truncated.
  let settled = false;
  void pending.then(() => { settled = true; });
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(settled, false);

  raw.write(dockerFrame('stdout', '2026-01-01T00:00:00.000000000Z three\n'));
  raw.end();
  resume?.();

  const stats = await pending;
  assert.equal(stats.truncated, false);
  assert.equal(raw.destroyed, true);
});

test('exports TTY container output as stdout lines without frame demuxing', async (t) => {
  const raw = new PassThrough();
  let dialOptions: Record<string, unknown> | null = null;
  mockLogStream(t, raw, {
    tty: true,
    startedAt: null,
    onDial: (options) => { dialOptions = options; },
  });

  const { chunks, sink } = createLogSink();
  const pending = streamContainerLogText('translator', { maxBytes: 1_000_000, sink });

  // TTY output carries no frame headers.
  raw.write('2026-01-01T00:00:00.000000000Z raw tty output\n');
  raw.end();

  await pending;

  assert.deepEqual(chunks, [
    '2026-01-01T00:00:00.000000000Z [translator] [stdout] raw tty output\n',
  ]);
  assert.equal((dialOptions?.options as Record<string, unknown>).since, undefined);
});

test('keeps multi-byte characters intact across TTY chunk boundaries', async (t) => {
  const raw = new PassThrough();
  mockLogStream(t, raw, { tty: true, startedAt: null });

  const { chunks, sink } = createLogSink();
  const pending = streamContainerLogText('translator', { maxBytes: 1_000_000, sink });

  // The two-byte 'é' is split across two network chunks.
  const text = Buffer.from('2026-01-01T00:00:00.000000000Z café\n', 'utf-8');
  const splitAt = text.indexOf(0xc3) + 1;
  raw.write(text.subarray(0, splitAt));
  raw.write(text.subarray(splitAt));
  raw.end();

  await pending;

  assert.deepEqual(chunks, [
    '2026-01-01T00:00:00.000000000Z [translator] [stdout] café\n',
  ]);
});

test('bounds how long opening a log stream may take', async (t) => {
  // A Docker connection that accepts the request and then goes quiet: neither
  // inspect nor the dial answers. Without a bound on the open the download
  // stays pending forever, and nothing else shares this request to release it.
  let dialed = false;
  t.mock.method(Docker.prototype, 'getContainer', () => ({
    inspect: async () => ({
      State: { StartedAt: '2026-01-01T00:00:00.000000000Z' },
      Config: { Tty: false },
    }),
    modem: {
      dial: () => {
        dialed = true;
      },
    },
  }));

  t.mock.timers.enable({ apis: ['setTimeout'] });
  const pending = streamContainerLogText('translator', {
    maxBytes: 1_000_000,
    sink: createLogSink().sink,
  });
  t.mock.timers.tick(DOCKER_CALL_TIMEOUT_MS + 1);

  const error = await pending.then(
    () => null,
    (thrown: Error) => thrown
  );

  assert.ok(error, 'expected the open to be abandoned rather than hang');
  assert.match(error.message, /Failed to open log stream for translator container/);
  assert.match(String(error.cause), /did not open the log stream/);
  assert.equal(dialed, true, 'the dial was attempted, it just never answered');
});

test('carries an abort signal into the inspect and the dial', async (t) => {
  const raw = new PassThrough();
  let inspectOptions: Record<string, unknown> | null = null;
  let dialOptions: Record<string, unknown> | null = null;
  t.mock.method(Docker.prototype, 'getContainer', () => ({
    inspect: async (options: Record<string, unknown>) => {
      inspectOptions = options;
      return { State: { StartedAt: null }, Config: { Tty: false } };
    },
    modem: {
      dial: (
        options: Record<string, unknown>,
        callback: (error: Error | null, stream: unknown) => void
      ) => {
        dialOptions = options;
        callback(null, raw);
      },
    },
  }));

  const pending = streamContainerLogText('translator', {
    maxBytes: 1_000_000,
    sink: createLogSink().sink,
  });
  raw.end();
  await pending;

  assert.ok(inspectOptions?.abortSignal instanceof AbortSignal);
  // docker-modem only reads abortSignal from the top level of the dial options;
  // inside `options` it is deleted (to keep it out of the query string) and
  // otherwise ignored.
  assert.ok(dialOptions?.abortSignal instanceof AbortSignal);
});

test('releases the export when the client goes away before the stream opens', async (t) => {
  const raw = new PassThrough();
  let dialed = false;
  t.mock.method(Docker.prototype, 'getContainer', () => ({
    // An inspect that never answers, standing in for a Docker connection that
    // hangs after the request is accepted.
    inspect: () => new Promise(() => undefined),
    modem: {
      dial: (
        _options: Record<string, unknown>,
        callback: (error: Error | null, stream: unknown) => void
      ) => {
        dialed = true;
        callback(null, raw);
      },
    },
  }));

  const { chunks, sink, closeSink } = createLogSink();
  const pending = streamContainerLogText('translator', { maxBytes: 1_000_000, sink });
  // The browser aborts the download while the read is still opening. The close
  // is registered before the open precisely so this reaches the read.
  closeSink();

  const error = await pending.then(
    () => null,
    (thrown: Error) => thrown
  );

  assert.ok(error, 'expected the abandoned open to reject');
  assert.match(error.message, /Failed to open log stream for translator container/);
  assert.match(String(error.cause), /cancelled by the client/);
  assert.equal(dialed, false, 'no stream should have been dialed');
  assert.equal(chunks.length, 0);
});

test('keeps missing-container errors recognizable through the stream wrapper', async (t) => {
  const dockerError = Object.assign(new Error('No such container: sv2-translator'), {
    statusCode: 404,
    reason: 'no such container',
    json: { message: 'No such container: sv2-translator' },
  });
  t.mock.method(Docker.prototype, 'getContainer', () => ({
    inspect: async () => ({ State: { StartedAt: '2026-01-01T00:00:00Z' }, Config: { Tty: false } }),
    modem: {
      dial: (
        _options: Record<string, unknown>,
        callback: (error: Error | null) => void
      ) => callback(dockerError),
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
  t.mock.method(Docker.prototype, 'info', (async () => ({
    LoggingDriver: 'json-file',
  })) as never);
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

test('mining containers keep the operator log driver when it is not json-file', async (t) => {
  const created: Array<Record<string, unknown>> = [];
  t.mock.method(Docker.prototype, 'getContainer', () => {
    throw new Error('no such container');
  });
  // A journald host: naming json-file here would silently move the mining
  // containers out of the operator's log pipeline and apply rotation options
  // the driver does not understand.
  t.mock.method(Docker.prototype, 'info', (async () => ({
    LoggingDriver: 'journald',
  })) as never);
  t.mock.method(Docker.prototype, 'createContainer', ((options: Record<string, unknown>) => {
    created.push(options);
    return Promise.resolve({ start: async () => undefined });
  }) as never);

  await startTranslator('/tmp/translator.toml', 'image:translator');

  assert.equal(created.length, 1);
  assert.equal((created[0].HostConfig as { LogConfig?: unknown }).LogConfig, undefined);
});

test('restartTranslator recreates only the Translator and leaves JDC running', async (t) => {
  const touched: string[] = [];
  const created: Array<Record<string, unknown>> = [];
  t.mock.method(Docker.prototype, 'ping', (async () => 'OK') as never);
  t.mock.method(Docker.prototype, 'getImage', (() => ({ inspect: async () => ({}) })) as never);
  t.mock.method(Docker.prototype, 'getContainer', (name: string) => {
    touched.push(name);
    throw new Error('no such container');
  });
  t.mock.method(Docker.prototype, 'info', (async () => ({
    LoggingDriver: 'json-file',
  })) as never);
  t.mock.method(Docker.prototype, 'createContainer', ((options: Record<string, unknown>) => {
    created.push(options);
    return Promise.resolve({ start: async () => undefined });
  }) as never);

  await restartTranslator({ mode: 'jd' } as SetupData, '/tmp/sv2-config');

  assert.deepEqual(touched, ['sv2-translator']);
  assert.deepEqual(created.map((options) => options.name), ['sv2-translator']);
});
