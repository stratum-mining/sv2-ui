import assert from 'node:assert/strict';
import test from 'node:test';

import { getLogDiagnostics } from './diagnostics.js';
import type { ContainerLogLine, LogContainerRole } from './types.js';

const SAMPLE_JDC_LINE: ContainerLogLine = {
  container: 'jdc',
  stream: 'stderr',
  timestamp: '2026-04-14T12:00:00.000Z',
  message: 'JDC started',
  raw: '2026-04-14T12:00:00.000Z JDC started',
};

function createMissingContainerError(containerName: string): Error {
  const dockerError = Object.assign(new Error(`No such container: ${containerName}`), {
    statusCode: 404,
    reason: 'no such container',
    json: { message: `No such container: ${containerName}` },
  });

  return new Error('Failed to read logs for translator container', {
    cause: dockerError,
  });
}

test('skips missing containers while collecting diagnostics', async () => {
  const response = await getLogDiagnostics(
    'jd',
    true,
    async (container: LogContainerRole) => {
      if (container === 'translator') {
        throw createMissingContainerError('sv2-translator');
      }

      return [SAMPLE_JDC_LINE];
    }
  );

  assert.equal(response.configured, true);
  assert.equal(response.mode, 'jd');
  assert.equal(response.streams.length, 1);
  assert.deepEqual(response.streams[0]?.containers, ['translator', 'jdc']);
  assert.deepEqual(response.diagnostics, []);
});

test('rethrows non-missing-container log failures', async () => {
  await assert.rejects(
    () =>
      getLogDiagnostics('no-jd', true, async () => {
        throw new Error('docker socket disappeared');
      }),
    /docker socket disappeared/
  );
});

test('coalesces simultaneous diagnostics snapshots', async () => {
  let readCount = 0;
  let releaseReads!: () => void;
  const readGate = new Promise<void>((resolve) => {
    releaseReads = resolve;
  });
  const readLogs = async (): Promise<ContainerLogLine[]> => {
    readCount += 1;
    await readGate;
    return [];
  };

  const requests = Array.from(
    { length: 32 },
    () => getLogDiagnostics('jd', true, readLogs)
  );

  try {
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(
      readCount,
      2,
      'concurrent callers should share one two-container Docker log snapshot'
    );
  } finally {
    releaseReads();
    await Promise.all(requests);
  }
});

test('starts a fresh snapshot after a rejected one', async () => {
  let shouldFail = true;
  let readCount = 0;
  const readLogs = async (): Promise<ContainerLogLine[]> => {
    readCount += 1;
    if (shouldFail) {
      throw new Error('docker socket disappeared');
    }

    return [];
  };

  const burst = Array.from({ length: 5 }, () =>
    assert.rejects(() => getLogDiagnostics('jd', true, readLogs), /docker socket disappeared/)
  );
  await Promise.all(burst);

  shouldFail = false;
  const response = await getLogDiagnostics('jd', true, readLogs);
  assert.deepEqual(response.diagnostics, []);
  assert.ok(
    readCount >= 2,
    'the retry must perform its own reads instead of replaying the rejected snapshot'
  );
});

test('does not coalesce snapshots across different providers', async () => {
  let firstCount = 0;
  let secondCount = 0;
  const first = async (): Promise<ContainerLogLine[]> => {
    firstCount += 1;
    return [];
  };
  const second = async (): Promise<ContainerLogLine[]> => {
    secondCount += 1;
    return [];
  };

  await Promise.all([
    getLogDiagnostics('jd', true, first),
    getLogDiagnostics('jd', true, second),
  ]);

  assert.equal(firstCount, 2);
  assert.equal(secondCount, 2);
});
