import assert from 'node:assert/strict';
import test from 'node:test';

import type { Sv2ClientWithChannels } from '../hooks/usePoolData';
import type {
  ExtendedChannelInfo,
  ServerChannelsResponse,
  ServerExtendedChannelInfo,
  ServerStandardChannelInfo,
  StandardChannelInfo,
} from '../types/api';
import { tileMetricEntries, type TileMetricEntry } from './dashboardTileMetrics';

// Fixtures follow the JDC `/clients` + `/clients/{id}/channels` and tProxy
// `/server/channels` payloads, as the dashboard holds them after usePoolData.

function extendedChannel(overrides: Partial<ExtendedChannelInfo>): ExtendedChannelInfo {
  return {
    channel_id: 1,
    user_identity: 'acct.worker',
    nominal_hashrate: 1.2e12,
    stable_hashrate: true,
    target_hex: '00000000ffff0000000000000000000000000000000000000000000000000000',
    requested_max_target_hex: 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
    extranonce_prefix_hex: '0000000100000002',
    full_extranonce_size: 16,
    rollable_extranonce_size: 8,
    expected_shares_per_minute: 6,
    shares_accepted: 120,
    shares_rejected: 0,
    shares_rejected_by_reason: {},
    share_work_sum: 7_864_320,
    last_share_sequence_number: 120,
    best_diff: 0,
    last_batch_accepted: 1,
    last_batch_work_sum: 65_536,
    share_batch_size: 1,
    blocks_found: 0,
    ...overrides,
  };
}

function standardChannel(overrides: Partial<StandardChannelInfo>): StandardChannelInfo {
  return {
    channel_id: 1,
    user_identity: 'acct.worker',
    nominal_hashrate: 1.2e12,
    stable_hashrate: true,
    target_hex: '00000000ffff0000000000000000000000000000000000000000000000000000',
    requested_max_target_hex: 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
    extranonce_prefix_hex: '00000001000000020000000300000004',
    expected_shares_per_minute: 6,
    shares_accepted: 120,
    shares_rejected: 0,
    shares_rejected_by_reason: {},
    share_work_sum: 7_864_320,
    last_share_sequence_number: 120,
    best_diff: 0,
    last_batch_accepted: 1,
    last_batch_work_sum: 65_536,
    share_batch_size: 1,
    blocks_found: 0,
    ...overrides,
  };
}

function serverExtendedChannel(
  overrides: Partial<ServerExtendedChannelInfo>,
): ServerExtendedChannelInfo {
  return {
    channel_id: 1,
    user_identity: 'acct.worker',
    nominal_hashrate: 1.2e12,
    target_hex: '00000000ffff0000000000000000000000000000000000000000000000000000',
    extranonce_prefix_hex: '00000001',
    full_extranonce_size: 16,
    rollable_extranonce_size: 12,
    version_rolling: true,
    shares_acknowledged: 118,
    shares_submitted: 120,
    shares_rejected: 0,
    shares_rejected_by_reason: {},
    acknowledged_work_sum: 7_733_248,
    validated_work_sum: 7_864_320,
    best_diff: 0,
    blocks_found: 0,
    ...overrides,
  };
}

function serverStandardChannel(
  overrides: Partial<ServerStandardChannelInfo>,
): ServerStandardChannelInfo {
  return {
    channel_id: 1,
    user_identity: 'acct.worker',
    nominal_hashrate: 1.2e12,
    target_hex: '00000000ffff0000000000000000000000000000000000000000000000000000',
    extranonce_prefix_hex: '0000000100000002000000030000000400000005',
    shares_acknowledged: 118,
    shares_submitted: 120,
    shares_rejected: 0,
    shares_rejected_by_reason: {},
    acknowledged_work_sum: 7_733_248,
    validated_work_sum: 7_864_320,
    best_diff: 0,
    blocks_found: 0,
    ...overrides,
  };
}

function serverChannels(
  extended: ServerExtendedChannelInfo[],
  standard: ServerStandardChannelInfo[] = [],
): ServerChannelsResponse {
  return {
    offset: 0,
    limit: 100,
    total_extended: extended.length,
    total_standard: standard.length,
    extended_channels: extended,
    standard_channels: standard,
  };
}

// A JD setup with one SV2 miner connected straight to JDC and one SV1 miner
// behind a non-aggregated translator. JDC assigns the translator's upstream
// channel id, so tProxy reports the SV1 miner's channel under the same id
// JDC uses for it on the translator_proxy client.
const sv2Miner: Sv2ClientWithChannels = {
  client_id: 1,
  client_kind: 'miner',
  extended_channels_count: 0,
  standard_channels_count: 1,
  total_hashrate: 1.1e14,
  management_ip: null,
  miner_telemetry_status: 'unmatched',
  miner_telemetry: null,
  extended_channels: [],
  standard_channels: [
    standardChannel({ channel_id: 1, user_identity: 'acct.s21', best_diff: 2_500_000, blocks_found: 1 }),
  ],
};

const translatorProxy: Sv2ClientWithChannels = {
  client_id: 2,
  client_kind: 'translator_proxy',
  extended_channels_count: 1,
  standard_channels_count: 0,
  total_hashrate: 1.2e12,
  management_ip: null,
  miner_telemetry_status: null,
  miner_telemetry: null,
  extended_channels: [
    extendedChannel({ channel_id: 2, user_identity: 'acct.bitaxe', best_diff: 9_000_000, blocks_found: 1 }),
  ],
  standard_channels: [],
};

const translatorUpstream = serverChannels([
  serverExtendedChannel({ channel_id: 2, user_identity: 'acct.bitaxe', best_diff: 9_000_000, blocks_found: 1 }),
]);

function total(entries: TileMetricEntry[]): number {
  return entries.reduce((sum, entry) => sum + entry.value, 0);
}

test('tileMetricEntries: JD mode reads every JDC client, translator_proxy included', () => {
  const sources = {
    isJdMode: true,
    jdcClients: [sv2Miner, translatorProxy],
    translatorServerChannels: translatorUpstream,
  };

  assert.deepEqual(tileMetricEntries(sources, 'blocks_found'), [
    { key: 'jdc:1:standard:1:acct.s21', value: 1 },
    { key: 'jdc:2:extended:2:acct.bitaxe', value: 1 },
  ]);
  assert.deepEqual(tileMetricEntries(sources, 'best_diff'), [
    { key: 'jdc:1:standard:1:acct.s21', value: 2_500_000 },
    { key: 'jdc:2:extended:2:acct.bitaxe', value: 9_000_000 },
  ]);
});

test('tileMetricEntries: JD mode counts a block found by an SV1 miner once', () => {
  const sources = {
    isJdMode: true,
    jdcClients: [{ ...sv2Miner, standard_channels: [standardChannel({ user_identity: 'acct.s21' })] }, translatorProxy],
    translatorServerChannels: translatorUpstream,
  };

  // tProxy also reports the block on its upstream channel; it is not read.
  assert.equal(total(tileMetricEntries(sources, 'blocks_found')), 1);
});

test('tileMetricEntries: JD mode has no entries until JDC clients load', () => {
  const sources = {
    isJdMode: true,
    jdcClients: undefined,
    translatorServerChannels: translatorUpstream,
  };

  assert.deepEqual(tileMetricEntries(sources, 'blocks_found'), []);
  assert.deepEqual(tileMetricEntries(sources, 'best_diff'), []);
});

test('tileMetricEntries: Translator-only mode reads the translator upstream channels', () => {
  const sources = {
    isJdMode: false,
    jdcClients: undefined,
    translatorServerChannels: serverChannels(
      [serverExtendedChannel({ channel_id: 7, user_identity: 'acct.bitaxe', best_diff: 4_000, blocks_found: 0 })],
      [serverStandardChannel({ channel_id: 8, user_identity: 'acct.nerdqaxe', best_diff: 12_000, blocks_found: 1 })],
    ),
  };

  assert.deepEqual(tileMetricEntries(sources, 'blocks_found'), [
    { key: 'translator:server:extended:7:acct.bitaxe', value: 0 },
    { key: 'translator:server:standard:8:acct.nerdqaxe', value: 1 },
  ]);
  assert.deepEqual(tileMetricEntries(sources, 'best_diff'), [
    { key: 'translator:server:extended:7:acct.bitaxe', value: 4_000 },
    { key: 'translator:server:standard:8:acct.nerdqaxe', value: 12_000 },
  ]);
});

test('tileMetricEntries: Translator-only mode has no entries until channels load', () => {
  const sources = { isJdMode: false, jdcClients: undefined, translatorServerChannels: undefined };

  assert.deepEqual(tileMetricEntries(sources, 'blocks_found'), []);
});
