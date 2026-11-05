import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { bitcoinRpcValidatorScript } from './bitcoin-rpc-validator.js';

test('rpc validator succeeds with valid RPC responses', async () => {
  const dataDir = mkdtempSync(path.join(tmpdir(), 'rpc-validator-success-'));
  writeFileSync(path.join(dataDir, '.cookie'), 'rpcuser:rpcpassword\n');

  const responses: Record<string, object> = {
    getblockchaininfo: { chain: 'main', initialblockdownload: false },
    getnetworkinfo: { version: 290000 },
  };

  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      const parsed = JSON.parse(body);
      const data = responses[parsed.method];
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ jsonrpc: '1.0', id: parsed.id, result: data, error: null }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');

  try {
    const execution = await new Promise<{ error: Error | null; stdout: string }>((resolve) => {
      execFile(
        process.execPath,
        [
          '-e',
          bitcoinRpcValidatorScript,
          dataDir,
          'mainnet',
          '127.0.0.1',
          String(address.port),
        ],
        { timeout: 5000 },
        (error, stdout) => resolve({ error, stdout: stdout ?? '' }),
      );
    });

    assert.equal(execution.error, null, 'validator should succeed with valid RPC responses');
    const result = JSON.parse(execution.stdout);
    assert.equal(result.chain, 'main');
    assert.equal(result.initialblockdownload, false);
    assert.equal(result.version, 290000);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test('rpc validator aborts an oversized response body', async () => {
  const dataDir = mkdtempSync(path.join(tmpdir(), 'rpc-validator-size-'));
  writeFileSync(path.join(dataDir, '.cookie'), 'rpcuser:rpcpassword\n');

  const responseSize = 8 * 1024 * 1024;
  const chunk = Buffer.alloc(64 * 1024, 'x');
  let sentBytes = 0;

  const server = http.createServer((req, res) => {
    req.resume();
    req.on('end', () => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.on('error', () => {});

      const writeMore = () => {
        while (sentBytes < responseSize) {
          sentBytes += chunk.length;
          if (!res.write(chunk)) {
            res.once('drain', writeMore);
            return;
          }
        }
        res.end();
      };
      writeMore();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');

  try {
    const execution = await new Promise<{ error: Error | null; stderr: string }>((resolve) => {
      execFile(
        process.execPath,
        [
          '-e',
          bitcoinRpcValidatorScript,
          dataDir,
          'mainnet',
          '127.0.0.1',
          String(address.port),
        ],
        { timeout: 5000, maxBuffer: 16 * 1024 * 1024 },
        (error, _stdout, stderr) => resolve({ error, stderr }),
      );
    });

    assert.ok(execution.error, 'the invalid RPC response must be rejected');
    assert.ok(
      sentBytes < responseSize,
      'validator consumed the complete oversized response instead of aborting it',
    );
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test('rpc validator enforces an absolute request deadline', async () => {
  const dataDir = mkdtempSync(path.join(tmpdir(), 'rpc-validator-deadline-'));
  writeFileSync(path.join(dataDir, '.cookie'), 'rpcuser:rpcpassword\n');

  const server = http.createServer((req, res) => {
    req.resume();
    req.on('end', () => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.write(' ');
      const drip = setInterval(() => res.write(' '), 100);
      res.on('close', () => clearInterval(drip));
      res.on('error', () => clearInterval(drip));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');

  try {
    const error = await new Promise<Error & { killed?: boolean }>((resolve, reject) => {
      execFile(
        process.execPath,
        [
          '-e',
          bitcoinRpcValidatorScript,
          dataDir,
          'mainnet',
          '127.0.0.1',
          String(address.port),
        ],
        { timeout: 12_000 },
        (childError) => {
          if (childError) resolve(childError);
          else reject(new Error('validator unexpectedly accepted an incomplete response'));
        },
      );
    });

    assert.equal(
      error.killed,
      false,
      'validator stayed alive until the test runner killed it instead of enforcing its own deadline',
    );
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    rmSync(dataDir, { recursive: true, force: true });
  }
});

async function probeWithConf(options: {
  conf?: string;
  network?: 'mainnet' | 'testnet4';
  /** Whether the node listens on the port named in `conf`, or on the default. */
  listensOn: 'conf-port' | 'default-port';
}): Promise<{ ok: boolean; output: string }> {
  const network = options.network ?? 'mainnet';
  const dataDir = mkdtempSync(path.join(tmpdir(), 'rpc-validator-port-'));
  const cookieDir = network === 'testnet4' ? path.join(dataDir, 'testnet4') : dataDir;
  mkdirSync(cookieDir, { recursive: true });
  writeFileSync(path.join(cookieDir, '.cookie'), 'rpcuser:rpcpassword\n');

  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      const { id, method } = JSON.parse(body);
      const result = method === 'getnetworkinfo'
        ? { version: 320100 }
        : { chain: 'main', initialblockdownload: false };
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ jsonrpc: '1.0', id, result, error: null }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');

  // Whichever port the node isn't on points nowhere, so a probe that asks the
  // wrong one fails instead of passing by accident.
  const closedPort = '1';
  const nodePort = String(address.port);
  const confPort = options.listensOn === 'conf-port' ? nodePort : closedPort;
  const defaultPort = options.listensOn === 'default-port' ? nodePort : closedPort;

  if (options.conf !== undefined) {
    writeFileSync(path.join(dataDir, 'bitcoin.conf'), options.conf.replaceAll('PORT', confPort));
  }

  try {
    return await new Promise((resolve) => {
      execFile(
        process.execPath,
        ['-e', bitcoinRpcValidatorScript, dataDir, network, '127.0.0.1', defaultPort],
        { timeout: 5000 },
        (error, stdout, stderr) => resolve({ ok: error === null, output: `${stdout}${stderr}` }),
      );
    });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    rmSync(dataDir, { recursive: true, force: true });
  }
}

// Each case below was checked against a real Bitcoin Core 32.1 node.
for (const [label, conf, network] of [
  ['a global rpcport on mainnet', 'rpcport=PORT\n', 'mainnet'],
  ['rpcport in [main]', '[main]\nrpcport=PORT\n', 'mainnet'],
  ['main.rpcport', 'main.rpcport=PORT\n', 'mainnet'],
  ['[main] over an earlier global rpcport', 'rpcport=1\n[main]\nrpcport=PORT\n', 'mainnet'],
  ['main.rpcport over a later global rpcport', 'main.rpcport=PORT\nrpcport=1\n', 'mainnet'],
  ['main.rpcport over an earlier global rpcport', 'rpcport=1\nmain.rpcport=PORT\n', 'mainnet'],
  ['the first of two rpcport lines', 'rpcport=PORT\nrpcport=1\n', 'mainnet'],
  ['rpcport with a trailing comment', 'rpcport=PORT # mine\n', 'mainnet'],
  ['rpcport in [testnet4]', '[testnet4]\nrpcport=PORT\n', 'testnet4'],
  ['testnet4.rpcport', 'testnet4.rpcport=PORT\n', 'testnet4'],
  ['rpcbind alongside rpcallowip', 'rpcbind=127.0.0.1:PORT\nrpcallowip=127.0.0.1\n', 'mainnet'],
  ['rpcbind over rpcport', 'rpcbind=127.0.0.1:PORT\nrpcallowip=127.0.0.1\nrpcport=1\n', 'mainnet'],
  ['rpcport when rpcbind names no port', 'rpcbind=127.0.0.1\nrpcallowip=127.0.0.1\nrpcport=PORT\n', 'mainnet'],
  ['[main] rpcbind with a global rpcallowip', 'rpcallowip=127.0.0.1\n[main]\nrpcbind=127.0.0.1:PORT\n', 'mainnet'],
  ['main.rpcbind', 'main.rpcbind=127.0.0.1:PORT\nrpcallowip=127.0.0.1\n', 'mainnet'],
  ['the rpcbind address it can reach', 'rpcbind=127.0.0.2:1\nrpcbind=127.0.0.1:PORT\nrpcallowip=127.0.0.1\n', 'mainnet'],
  ['rpcbind on all addresses', 'rpcbind=0.0.0.0:PORT\nrpcallowip=127.0.0.1\n', 'mainnet'],
  ['[testnet4] rpcbind with a global rpcallowip', 'rpcallowip=127.0.0.1\n[testnet4]\nrpcbind=127.0.0.1:PORT\n', 'testnet4'],
] as const) {
  test(`rpc validator asks the port from ${label}`, async () => {
    const { ok, output } = await probeWithConf({ conf, network, listensOn: 'conf-port' });
    assert.equal(ok, true, output);
    assert.equal(JSON.parse(output).version, 320100);
  });
}

for (const [label, conf, network] of [
  ['no bitcoin.conf', undefined, 'mainnet'],
  ['a bitcoin.conf without rpcport', 'prune=1024\nincludeconf=umbrel-bitcoin.conf\n', 'mainnet'],
  ['a commented-out rpcport', '#rpcport=1\n', 'mainnet'],
  ['a section for another network', '[testnet4]\nrpcport=1\n', 'mainnet'],
  ['the [main] section on testnet4', '[main]\nrpcport=1\n', 'testnet4'],
  ['another network\'s prefixed rpcport', 'testnet4.rpcport=1\n', 'mainnet'],
  ['an out-of-range rpcport', 'rpcport=70000\n', 'mainnet'],
  ['rpcbind without rpcallowip, which Core ignores', 'rpcbind=127.0.0.1:1\n', 'mainnet'],
  ['rpcallowip without rpcbind', 'rpcallowip=127.0.0.1\n', 'mainnet'],
  ['rpcbind for another network', 'rpcallowip=127.0.0.1\n[testnet4]\nrpcbind=127.0.0.1:1\n', 'mainnet'],
  ['rpcallowip for another network', '[main]\nrpcallowip=127.0.0.1\n[testnet4]\nrpcbind=127.0.0.1:1\n', 'testnet4'],
  ['rpcbind that names no port', 'rpcbind=127.0.0.1\nrpcallowip=127.0.0.1\n', 'mainnet'],
] as const) {
  test(`rpc validator keeps the default port with ${label}`, async () => {
    const { ok, output } = await probeWithConf({ conf, network, listensOn: 'default-port' });
    assert.equal(ok, true, output);
    assert.equal(JSON.parse(output).version, 320100);
  });
}
