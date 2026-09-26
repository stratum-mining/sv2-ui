import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { chmod, constants, lstat, mkdtemp, open, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { promisify } from 'node:util';
import { JDC_AUTHORITY_PUBLIC_KEY } from '@sv2-ui/shared';
import {
  getServiceConfigDrift,
  getSetupValidationError,
  prepareServiceConfig,
  reconcileServiceConfigs,
} from './service-config.js';
import type { SetupData } from './types.js';

const JD_DATA: SetupData = {
  miningMode: 'pool',
  mode: 'jd',
  miner_telemetry_cidr: '',
  pool: {
    name: 'Example Pool',
    address: 'pool.example.com',
    port: 34254,
    authority_public_key: JDC_AUTHORITY_PUBLIC_KEY,
    user_identity: 'miner.worker',
  },
  fallbackPools: [],
  bitcoin: {
    core_version: '30',
    network: 'mainnet',
    os: 'linux',
    customDataDir: '',
    socket_path: '/tmp/bitcoin.sock',
  },
  jdc: {
    jdc_signature: 'miner-tag',
    coinbase_reward_address: '1BoatSLRHtKNngkdXEeobR76b53LETtpyT',
  },
  translator: {
    enable_vardiff: true,
    aggregate_channels: false,
    min_hashrate: 100_000_000_000_000,
    shares_per_minute: 6,
    downstream_extranonce2_size: 4,
  },
};

test('reconciles a legacy JDC config with the required Bitcoin Core IPC version', async () => {
  const configDir = await mkdtemp(path.join(os.tmpdir(), 'sv2-ui-config-'));
  try {
    await writeFile(
      path.join(configDir, 'jdc.toml'),
      '[template_provider_type.BitcoinCoreIpc]\nnetwork = "mainnet"\n',
    );

    const changed = await reconcileServiceConfigs(JD_DATA, configDir);
    const jdcConfig = await readFile(path.join(configDir, 'jdc.toml'), 'utf8');

    assert.deepEqual(changed.sort(), ['jdc.toml', 'translator.toml']);
    assert.match(jdcConfig, /\[template_provider_type\.BitcoinCoreIpc\]\nversion = 30/);
  } finally {
    await rm(configDir, { recursive: true, force: true });
  }
});

test('does not rewrite generated config files that already match', async () => {
  const configDir = await mkdtemp(path.join(os.tmpdir(), 'sv2-ui-config-'));
  try {
    await reconcileServiceConfigs(JD_DATA, configDir);

    assert.deepEqual(await reconcileServiceConfigs(JD_DATA, configDir), []);
    const prepared = prepareServiceConfig(JD_DATA);
    assert.equal(prepared.kind, 'ready');
    if (prepared.kind !== 'ready') assert.fail('Expected a ready configuration');
    assert.deepEqual(
      await getServiceConfigDrift(prepared.files, configDir),
      [],
    );
  } finally {
    await rm(configDir, { recursive: true, force: true });
  }
});

test('migrates an existing matching managed file to the 0o600 mode', async () => {
  const configDir = await mkdtemp(path.join(os.tmpdir(), 'sv2-ui-config-'));
  const managedPath = path.join(configDir, 'translator.toml');

  try {
    await reconcileServiceConfigs(JD_DATA, configDir);
    // Simulate a file written before the owner-only policy existed.
    await chmod(managedPath, 0o644);

    assert.deepEqual(await reconcileServiceConfigs(JD_DATA, configDir), ['translator.toml']);
    assert.equal((await stat(managedPath)).mode & 0o777, 0o600);

    // Contents are untouched, so the mode is not drift.
    const prepared = prepareServiceConfig(JD_DATA);
    assert.equal(prepared.kind, 'ready');
    if (prepared.kind !== 'ready') assert.fail('Expected a ready configuration');
    assert.deepEqual(await getServiceConfigDrift(prepared.files, configDir), []);
  } finally {
    await rm(configDir, { recursive: true, force: true });
  }
});

test('asks the user for a generic setup review when a legacy JD setup cannot render', () => {
  const legacyData = {
    ...JD_DATA,
    bitcoin: {
      ...JD_DATA.bitcoin!,
      core_version: null,
    },
  };

  const prepared = prepareServiceConfig(legacyData);

  assert.equal(prepared.kind, 'needs-setup-review');
  if (prepared.kind !== 'needs-setup-review') assert.fail('Expected setup review');
  assert.deepEqual(prepared.issues, [{
    code: 'saved-setup-needs-review',
    title: 'Review your setup',
    message: 'Review your setup before mining can continue. An update may require confirming a few settings; your saved settings have been kept.',
  }]);
});

test('asks for setup review when JD reward address is missing', () => {
  const missingRewardAddress = {
    ...JD_DATA,
    jdc: {
      ...JD_DATA.jdc!,
      coinbase_reward_address: '',
    },
  };

  assert.match(
    getSetupValidationError(missingRewardAddress) ?? '',
    /block reward address/i,
  );
  assert.equal(prepareServiceConfig(missingRewardAddress).kind, 'needs-setup-review');
});

test('asks for setup review when JD signature would break generated TOML', () => {
  const unsafeSignature = {
    ...JD_DATA,
    jdc: {
      ...JD_DATA.jdc!,
      jdc_signature: 'miner"tag',
    },
  };

  assert.match(
    getSetupValidationError(unsafeSignature) ?? '',
    /miner signature/i,
  );
  assert.equal(prepareServiceConfig(unsafeSignature).kind, 'needs-setup-review');
});

test('rejects an authority public key wrapped in quotes (must be canonical)', () => {
  const quotedKey = {
    ...JD_DATA,
    pool: {
      ...JD_DATA.pool!,
      authority_public_key: `'${JD_DATA.pool!.authority_public_key}'`,
    },
  };

  assert.match(
    getSetupValidationError(quotedKey) ?? '',
    /public key is invalid/i,
  );
  assert.equal(prepareServiceConfig(quotedKey).kind, 'needs-setup-review');
});

test('rejects miner telemetry CIDRs containing embedded newlines', () => {
  const unsafeCidr = {
    ...JD_DATA,
    miner_telemetry_cidr: '192.168.1.\n0/24',
  };

  assert.notEqual(getSetupValidationError(unsafeCidr), null);
  assert.equal(prepareServiceConfig(unsafeCidr).kind, 'needs-setup-review');
});

test('rejects miner telemetry CIDRs using hex octets', () => {
  const unsafeCidr = {
    ...JD_DATA,
    miner_telemetry_cidr: '192.168.0x10.0/24',
  };

  assert.notEqual(getSetupValidationError(unsafeCidr), null);
});

test('rejects miner telemetry CIDRs using scientific notation', () => {
  const unsafeCidr = {
    ...JD_DATA,
    miner_telemetry_cidr: '192.168.1e2.0/24',
  };

  assert.notEqual(getSetupValidationError(unsafeCidr), null);
});

test('rejects miner telemetry CIDRs using signed octets', () => {
  const unsafeCidr = {
    ...JD_DATA,
    miner_telemetry_cidr: '+192.168.1.0/24',
  };

  assert.notEqual(getSetupValidationError(unsafeCidr), null);
});

test('rejects miner telemetry CIDRs with noncanonical leading zeros', () => {
  const unsafeCidr = {
    ...JD_DATA,
    miner_telemetry_cidr: '192.168.001.000/024',
  };

  assert.notEqual(getSetupValidationError(unsafeCidr), null);
});

test('rejects a valid IP with a noncanonical prefix', () => {
  const unsafeCidr = {
    ...JD_DATA,
    miner_telemetry_cidr: '192.168.1.0/024',
  };

  assert.notEqual(getSetupValidationError(unsafeCidr), null);
});

test('preparation uses safe defaults before rendering', () => {
  const legacyWithSafeDefaults = {
    ...JD_DATA,
    miner_telemetry_cidr: undefined,
    translator: {
      ...JD_DATA.translator!,
      shares_per_minute: undefined,
      downstream_extranonce2_size: undefined,
    },
  } as unknown as SetupData;

  const prepared = prepareServiceConfig(legacyWithSafeDefaults);
  assert.equal(prepared.kind, 'ready');
  assert.equal(prepared.data.translator?.shares_per_minute, 6);
  assert.equal(prepared.data.translator?.downstream_extranonce2_size, 4);
});

test('detects and removes an obsolete generated JDC config when switching to no-JD mode', async () => {
  const configDir = await mkdtemp(path.join(os.tmpdir(), 'sv2-ui-config-'));
  const noJdData: SetupData = {
    ...JD_DATA,
    mode: 'no-jd',
    bitcoin: null,
    jdc: null,
  };

  try {
    await reconcileServiceConfigs(JD_DATA, configDir);
    const prepared = prepareServiceConfig(noJdData);
    assert.equal(prepared.kind, 'ready');
    if (prepared.kind !== 'ready') assert.fail('Expected a ready configuration');
    assert.deepEqual(
      await getServiceConfigDrift(prepared.files, configDir),
      ['translator.toml', 'jdc.toml'],
    );

    assert.deepEqual(await reconcileServiceConfigs(noJdData, configDir), ['translator.toml', 'jdc.toml']);
    await assert.rejects(readFile(path.join(configDir, 'jdc.toml'), 'utf8'), { code: 'ENOENT' });
    assert.deepEqual(await getServiceConfigDrift(prepared.files, configDir), []);
  } finally {
    await rm(configDir, { recursive: true, force: true });
  }
});

test('does not block while inspecting a FIFO at a managed config path', async () => {
  const configDir = await mkdtemp(path.join(os.tmpdir(), 'sv2-ui-config-'));
  const managedPath = path.join(configDir, 'translator.toml');
  let timeoutId: NodeJS.Timeout | undefined;

  try {
    await promisify(execFile)('mkfifo', ['-m', '666', managedPath]);

    const timedOut = new Promise<'timed-out'>((resolve) => {
      timeoutId = setTimeout(() => resolve('timed-out'), 250);
      timeoutId.unref();
    });
    const outcome = await Promise.race([
      getServiceConfigDrift([{
        filename: 'translator.toml',
        contents: 'trusted configuration',
      }], configDir),
      timedOut,
    ]);

    if (outcome === 'timed-out') {
      // A spurious timeout on a stalled runner means the reader has already
      // closed. Open the writer with O_NONBLOCK so this branch can never wedge
      // a libuv worker and hang the whole test process; ENXIO means there is
      // no blocked reader to release.
      try {
        const writer = await open(managedPath, constants.O_WRONLY | constants.O_NONBLOCK);
        await writer.writeFile('attacker-controlled input');
        await writer.close();
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENXIO') throw error;
      }
      assert.fail('drift inspection blocked while opening an attacker-created FIFO');
    }

    assert.deepEqual(outcome, ['translator.toml']);
  } finally {
    clearTimeout(timeoutId);
    await rm(configDir, { recursive: true, force: true });
  }
});

test('reports a symlink at a managed config path as drift even when it resolves to matching contents', async () => {
  const configDir = await mkdtemp(path.join(os.tmpdir(), 'sv2-ui-config-'));
  const managedPath = path.join(configDir, 'translator.toml');

  try {
    await writeFile(path.join(configDir, 'linked-target'), 'trusted configuration');
    await symlink(path.join(configDir, 'linked-target'), managedPath);

    assert.deepEqual(
      await getServiceConfigDrift([{
        filename: 'translator.toml',
        contents: 'trusted configuration',
      }], configDir),
      ['translator.toml'],
    );
  } finally {
    await rm(configDir, { recursive: true, force: true });
  }
});

test('reports a Unix socket at a managed config path as drift without failing', async () => {
  const configDir = await mkdtemp(path.join(os.tmpdir(), 'sv2-ui-config-'));
  const managedPath = path.join(configDir, 'translator.toml');
  const server = net.createServer();

  try {
    await new Promise<void>((resolve) => server.listen(managedPath, resolve));

    assert.deepEqual(
      await getServiceConfigDrift([{
        filename: 'translator.toml',
        contents: 'trusted configuration',
      }], configDir),
      ['translator.toml'],
    );
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(configDir, { recursive: true, force: true });
  }
});

test('replaces a symlink at a managed config path with a regular file', async () => {
  const configDir = await mkdtemp(path.join(os.tmpdir(), 'sv2-ui-config-'));
  const managedPath = path.join(configDir, 'translator.toml');

  try {
    await writeFile(path.join(configDir, 'linked-target'), 'attacker controlled');
    await symlink(path.join(configDir, 'linked-target'), managedPath);

    const changed = await reconcileServiceConfigs(JD_DATA, configDir);

    const finalStat = await lstat(managedPath);
    assert.ok(finalStat.isFile(), 'reconcile must replace the planted symlink with a regular file');
    assert.equal(finalStat.mode & 0o777, 0o600);
    assert.ok(changed.includes('translator.toml'));
  } finally {
    await rm(configDir, { recursive: true, force: true });
  }
});

test('replaces a FIFO at a managed config path with a regular file', async () => {
  const configDir = await mkdtemp(path.join(os.tmpdir(), 'sv2-ui-config-'));
  const managedPath = path.join(configDir, 'translator.toml');

  try {
    await promisify(execFile)('mkfifo', ['-m', '666', managedPath]);

    const changed = await reconcileServiceConfigs(JD_DATA, configDir);

    const finalStat = await stat(managedPath);
    assert.ok(finalStat.isFile(), 'reconcile must replace the planted FIFO with a regular file');
    assert.equal(finalStat.mode & 0o777, 0o600);
    assert.ok(changed.includes('translator.toml'));
  } finally {
    await rm(configDir, { recursive: true, force: true });
  }
});
