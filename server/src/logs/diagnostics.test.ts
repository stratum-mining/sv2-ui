import assert from 'node:assert/strict';
import test from 'node:test';

import { getLogDiagnostics, readCollatedLogLines, type LogProvider } from './diagnostics.js';
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
  assert.equal(response.partial, true);
});

test('does not report a fully stopped stack as partial', async () => {
  const response = await getLogDiagnostics(
    'no-jd',
    true,
    async () => {
      throw createMissingContainerError('sv2-translator');
    }
  );

  assert.equal(response.partial, false, 'every container missing is complete knowledge');
  assert.deepEqual(response.diagnostics, []);
});

test('reports a read of every container as not partial', async () => {
  const response = await getLogDiagnostics('jd', true, async () => [SAMPLE_JDC_LINE]);

  assert.equal(response.partial, false);
  assert.deepEqual(response.diagnostics, []);
});

test('reports an unconfigured stack as not partial', async () => {
  const response = await getLogDiagnostics(null, false, async () => []);

  assert.equal(response.partial, false);
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

test('coalesces raw-log snapshots that share a provider and tail', async () => {
  const tails: Array<number | undefined> = [];
  let readCount = 0;
  let releaseReads!: () => void;
  const readGate = new Promise<void>((resolve) => {
    releaseReads = resolve;
  });
  // One stable provider, as /api/logs/raw now passes: the snapshot key is
  // (provider, mode, tail), so a burst coalesces instead of issuing a Docker
  // read per request.
  const readLogs: LogProvider = async (_container, options) => {
    tails.push(options?.tail);
    readCount += 1;
    await readGate;
    return [];
  };

  const requests = Array.from(
    { length: 16 },
    () => readCollatedLogLines('jd', readLogs, 200)
  );

  try {
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(readCount, 2, 'one read per container in the mode');
  } finally {
    releaseReads();
    await Promise.all(requests);
  }

  assert.deepEqual(tails, [200, 200]);
});

test('does not coalesce snapshots that request different tails', async () => {
  let readCount = 0;
  let releaseReads!: () => void;
  const readGate = new Promise<void>((resolve) => {
    releaseReads = resolve;
  });
  const readLogs: LogProvider = async () => {
    readCount += 1;
    await readGate;
    return [];
  };

  const requests = [
    readCollatedLogLines('jd', readLogs, 200),
    readCollatedLogLines('jd', readLogs, 500),
  ];

  try {
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(readCount, 4, 'each distinct tail needs its own snapshot');
  } finally {
    releaseReads();
    await Promise.all(requests);
  }
});
