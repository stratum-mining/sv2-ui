import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  getImageSelectionForSetup,
  SV2_APP_IMAGES,
} from './compatibility.js';
import type { SetupData } from './types.js';

const BASE_SETUP_DATA: SetupData = {
  miningMode: 'pool',
  mode: 'jd',
  pool: {
    name: 'Custom Pool',
    address: 'pool.example.com',
    port: 34254,
    authority_public_key: 'authority-key',
  },
  bitcoin: {
    core_version: '31.0',
    network: 'testnet4',
    os: 'linux',
    customDataDir: '',
    socket_path: '/tmp/bitcoin.sock',
  },
  jdc: {
    user_identity: 'miner.worker1',
    jdc_signature: 'custom-miner-tag',
    coinbase_reward_address: 'tb1qexample',
  },
  translator: {
    user_identity: 'miner.worker1',
    enable_vardiff: true,
    aggregate_channels: false,
    min_hashrate: 100_000_000_000_000,
    shares_per_minute: 12.5,
    downstream_extranonce2_size: 8,
  },
};

test('no-JD setup selects the no-JD Translator image without Bitcoin Core', () => {
  const selection = getImageSelectionForSetup({
    ...BASE_SETUP_DATA,
    mode: 'no-jd',
    bitcoin: null,
    jdc: null,
  });

  assert.equal(selection.mode, 'no-jd');
  assert.equal(selection.translator, SV2_APP_IMAGES.translatorNoJd);
});

test('JD setup rejects a missing Bitcoin Core version', () => {
  assert.throws(
    () => getImageSelectionForSetup({
      ...BASE_SETUP_DATA,
      bitcoin: {
        ...BASE_SETUP_DATA.bitcoin!,
        core_version: null,
      },
    }),
    /Unsupported or missing Bitcoin Core version/
  );
});

test('JD setup selects images through the matching Bitcoin Core profile', () => {
  const bitcoinCore302 = getImageSelectionForSetup({
    ...BASE_SETUP_DATA,
    bitcoin: {
      ...BASE_SETUP_DATA.bitcoin!,
      core_version: '30.2',
    },
  });

  assert.equal(bitcoinCore302.mode, 'jd');
  assert.equal(bitcoinCore302.profile.id, 'bitcoin-core-30.2');
  assert.equal(bitcoinCore302.jdc, SV2_APP_IMAGES.byBitcoinCore['30.2'].jdc);
  assert.equal(bitcoinCore302.translator, SV2_APP_IMAGES.byBitcoinCore['30.2'].translator);

  const bitcoinCore310 = getImageSelectionForSetup(BASE_SETUP_DATA);

  assert.equal(bitcoinCore310.mode, 'jd');
  assert.equal(bitcoinCore310.profile.id, 'bitcoin-core-31.0');
  assert.equal(bitcoinCore310.jdc, SV2_APP_IMAGES.byBitcoinCore['31.0'].jdc);
  assert.equal(bitcoinCore310.translator, SV2_APP_IMAGES.byBitcoinCore['31.0'].translator);
});
