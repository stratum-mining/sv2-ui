import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getImageSelectionForSetup, getImageTag, getSv2AppsVersions, SV2_APP_IMAGES } from '@sv2-ui/shared';
import type { SetupData } from './types.js';

const BASE_SETUP_DATA: SetupData = {
  miningMode: 'pool',
  mode: 'jd',
  miner_telemetry_cidr: '192.168.1.0/24',
  pool: {
    name: 'Custom Pool',
    address: 'pool.example.com',
    port: 34254,
    authority_public_key: 'authority-key',
    user_identity: 'miner.worker1',
  },
  fallbackPools: [],
  bitcoin: {
    core_version: '31',
    network: 'testnet4',
    os: 'linux',
    customDataDir: '',
    socket_path: '/tmp/bitcoin.sock',
  },
  jdc: {
    jdc_signature: 'custom-miner-tag',
    coinbase_reward_address: 'tb1qexample',
  },
  translator: {
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

test('JD setup selects the current JD image set without Bitcoin Core image branching', () => {
  const bitcoinCore30 = getImageSelectionForSetup({
    ...BASE_SETUP_DATA,
    bitcoin: {
      ...BASE_SETUP_DATA.bitcoin!,
      core_version: '30',
    },
  });

  assert.equal(bitcoinCore30.mode, 'jd');
  assert.equal(bitcoinCore30.jdc, SV2_APP_IMAGES.jd.jdc);
  assert.equal(bitcoinCore30.translator, SV2_APP_IMAGES.jd.translator);

  const bitcoinCore31 = getImageSelectionForSetup(BASE_SETUP_DATA);

  assert.equal(bitcoinCore31.mode, 'jd');
  assert.equal(bitcoinCore31.jdc, SV2_APP_IMAGES.jd.jdc);
  assert.equal(bitcoinCore31.translator, SV2_APP_IMAGES.jd.translator);
});

test('getImageTag reads the tag of a pinned release image without its digest', () => {
  assert.equal(
    getImageTag('stratumv2/translator_sv2:v0.9.2@sha256:096eb6aa2e9d8d59feb347145e08a3a1a044491e013f0ed935f1044d8455b1ef'),
    'v0.9.2',
  );
});

test('getImageTag reads the tag of a development image', () => {
  assert.equal(getImageTag('stratumv2/jd_client_sv2:main'), 'main');
});

test('getSv2AppsVersions reports the tag of every selected image, each once', () => {
  const versions = getSv2AppsVersions();
  assert.equal(new Set(versions).size, versions.length);
  for (const image of [SV2_APP_IMAGES.translatorNoJd, SV2_APP_IMAGES.jd.jdc, SV2_APP_IMAGES.jd.translator]) {
    assert.ok(versions.includes(getImageTag(image)), `missing the tag of ${image}`);
  }
});
