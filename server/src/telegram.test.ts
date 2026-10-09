import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';

import {
  collectPaginatedMonitoringItems,
  formatTelegramStatus,
  formatPoolName,
  formatWorkerName,
  mapWithConcurrency,
  getSingleMinerChannelIds,
  getTelegramWorkerCount,
  TelegramApiError,
  TelegramConfigError,
  TelegramService,
  toTelegramApiError,
  toTelegramMiningChannel,
} from './telegram.js';
import { TELEGRAM_SUMMARY_INTERVALS } from '@sv2-ui/shared';
import type { TelegramActivitySnapshot } from './telegram.js';

const BOT_TOKEN = '123456:AAE-test_token-0123456789abcdef';
const BOT = {
  id: 123456,
  is_bot: true,
  first_name: 'SV2 alerts',
  username: 'sv2_alerts_bot',
};

type FetchCall = {
  method: string;
  url: string;
  body: Record<string, unknown>;
};

function createTelegramFetch(initialResults: Record<string, unknown[]> = {}) {
  const calls: FetchCall[] = [];
  const results = new Map(
    Object.entries(initialResults).map(([method, values]) => [method, [...values]])
  );

  const fetchImplementation = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = url.split('/').at(-1) ?? '';
    const body = init?.body
      ? JSON.parse(String(init.body)) as Record<string, unknown>
      : {};
    calls.push({ method, url, body });

    const queued = results.get(method);
    const result = queued?.length
      ? queued.shift()
      : method === 'getUpdates'
        ? []
        : { message_id: calls.length };
    if (result instanceof Error) throw result;

    return new Response(JSON.stringify({
      ok: true,
      result,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  return {
    calls,
    fetchImplementation,
    enqueue(method: string, ...values: unknown[]) {
      const queued = results.get(method) ?? [];
      queued.push(...values);
      results.set(method, queued);
    },
    callsFor(method: string) {
      return calls.filter((call) => call.method === method);
    },
  };
}

async function createSettingsFile(t: TestContext): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'sv2-telegram-test-'));
  t.after(async () => {
    await fs.rm(directory, { recursive: true, force: true });
  });
  return path.join(directory, 'telegram.json');
}

function snapshot(
  update: Partial<TelegramActivitySnapshot> = {}
): TelegramActivitySnapshot {
  return {
    running: true,
    poolName: 'Primary pool',
    recordKey: 'no-jd:Primary pool',
    activePoolIndex: 0,
    hashrate: 125_000_000_000_000,
    workers: 3,
    sharesSubmitted: 42,
    sharesAccepted: 40,
    sharesRejected: 2,
    channels: [{
      key: 'translator:server:extended:1:miner-one',
      userIdentity: 'miner-one',
      blocksFound: 0,
      bestDifficulty: 1250,
    }],
    ...update,
  };
}

test('collects every monitoring page using the reported total', async () => {
  const offsets: number[] = [];
  const items = await collectPaginatedMonitoringItems(async (offset, limit) => {
    offsets.push(offset);
    const total = 205;
    const pageLength = Math.min(limit, total - offset);
    return {
      total,
      items: Array.from({ length: pageLength }, (_, index) => offset + index),
    };
  });

  assert.deepEqual(offsets, [0, 100, 200]);
  assert.equal(items?.length, 205);
  assert.equal(items?.at(-1), 204);
});

test('returns no partial monitoring snapshot when a later page fails', async () => {
  const items = await collectPaginatedMonitoringItems(async (offset) => (
    offset === 0
      ? { total: 101, items: Array.from({ length: 100 }, (_, index) => index) }
      : null
  ));

  assert.equal(items, null);
});

test('counts workers like the dashboard', () => {
  // Translator only: the SV1 miners.
  assert.equal(getTelegramWorkerCount(false, 4, 0), 4);
  // JD mode: SV1 miners behind the translator plus direct SV2 channels. JDC's
  // own channel count would show an aggregated translator as one worker.
  assert.equal(getTelegramWorkerCount(true, 3, 2), 5);
  assert.equal(getTelegramWorkerCount(true, 3, null), null);
  assert.equal(getTelegramWorkerCount(true, undefined, 2), null);
});

test('names a translator channel only when one miner uses it', () => {
  // Not aggregated: every miner has its own upstream channel.
  assert.deepEqual(
    [...getSingleMinerChannelIds([{ channel_id: 7 }, { channel_id: 8 }])].sort(),
    [7, 8],
  );
  // Aggregated: miners get local channel ids, none matching the shared
  // upstream channel, so that channel is never named.
  const aggregated = getSingleMinerChannelIds([{ channel_id: 1 }, { channel_id: 2 }]);
  assert.equal(aggregated.has(42), false);
  // A channel id shared by several miners is not named either.
  assert.equal(getSingleMinerChannelIds([{ channel_id: 7 }, { channel_id: 7 }]).has(7), false);
  assert.equal(getSingleMinerChannelIds([{ channel_id: null }, {}]).size, 0);

  const channel = { channel_id: 42, user_identity: 'acct.translator-proxy', blocks_found: 0, best_diff: 1 };
  assert.equal(toTelegramMiningChannel('translator:server', 'extended', channel, false)?.userIdentity, null);
  assert.equal(
    toTelegramMiningChannel('translator:server', 'extended', channel, true)?.userIdentity,
    'acct.translator-proxy',
  );
});

test('leaves the worker out of alerts for a shared channel', async (t) => {
  const { service, telegram } = await pairService(t);
  const shared = (blocksFound: number, bestDifficulty: number) => snapshot({
    channels: [{
      key: 'translator:server:extended:42:acct.translator-proxy',
      userIdentity: null,
      blocksFound,
      bestDifficulty,
    }],
  });

  await service.poll(async () => shared(0, 1250));
  await service.poll(async () => shared(0, 9000));
  const bestDifficulty = String(telegram.callsFor('sendMessage').at(-1)?.body.text);
  assert.match(bestDifficulty, /^🏆 New best difficulty!/);
  assert.doesNotMatch(bestDifficulty, /Worker:/);

  await service.poll(async () => shared(1, 9000));
  const block = String(telegram.callsFor('sendMessage').at(-1)?.body.text);
  assert.match(block, /^🎉 Block found!/);
  assert.doesNotMatch(block, /Worker:/);
});

async function pairService(
  t: TestContext,
  telegram = createTelegramFetch({ getMe: [BOT] })
) {
  const settingsFile = await createSettingsFile(t);
  const service = new TelegramService(settingsFile, telegram.fetchImplementation);
  const connected = await service.connectBot(BOT_TOKEN);
  const pairingCode = new URL(connected.pairingUrl ?? '').searchParams.get('start');
  telegram.enqueue('getUpdates', [{
    update_id: 77,
    message: {
      message_id: 4,
      text: `/start ${pairingCode}`,
      chat: {
        id: 987,
        type: 'private',
        first_name: 'Miner',
        username: 'miner_one',
      },
    },
  }]);
  await service.pairChat();
  return { service, settingsFile, telegram };
}

test('formats a compact mining summary with block and difficulty data', () => {
  assert.equal(
    formatTelegramStatus(snapshot()),
    [
      '⛏ SV2 mining status',
      'Status: Running',
      'Pool: Primary pool',
      'Hashrate: 125 TH/s',
      'Workers: 3',
      'Shares: 42 submitted · 40 accepted · 2 rejected',
      'Blocks found: 0',
      'Best difficulty: 1,250',
    ].join('\n')
  );
});

test('pairs a private chat with the three critical alerts enabled by default', async (t) => {
  const { service, settingsFile, telegram } = await pairService(t);
  const paired = await service.getSettings();

  assert.equal(paired.paired, true);
  assert.equal(paired.enabled, true);
  assert.equal(paired.recipient, '@miner_one');
  assert.equal(paired.pairingUrl, null);
  assert.equal(paired.notifyOnBlockFound, true);
  assert.equal(paired.notifyOnBestDifficulty, true);
  assert.equal(paired.notifyOnPoolChange, true);
  assert.equal(paired.notifyOnStatusChange, false);
  assert.equal(paired.notifyOnWorkerChange, false);
  assert.equal(paired.notifyOnRejectedShares, false);
  assert.equal(paired.summaryIntervalMinutes, 0);
  assert.equal(JSON.stringify(paired).includes(BOT_TOKEN), false);
  assert.match(
    String(telegram.callsFor('sendMessage').at(-1)?.body.text),
    /Block found, new best difficulty, and pool failover/
  );

  const savedMode = (await fs.stat(settingsFile)).mode & 0o777;
  assert.equal(savedMode, 0o600);
});

test('does not pair a chat until the matching Start command arrives', async (t) => {
  const settingsFile = await createSettingsFile(t);
  const telegram = createTelegramFetch({
    getMe: [BOT],
    getUpdates: [[]],
  });
  const service = new TelegramService(settingsFile, telegram.fetchImplementation);
  await service.connectBot(BOT_TOKEN);

  await assert.rejects(
    service.pairChat(),
    (error: unknown) =>
      error instanceof TelegramConfigError &&
      error.message.includes('press Start')
  );
});

test('establishes a baseline and announces only a new block', async (t) => {
  const { service, telegram } = await pairService(t);

  await service.poll(async () => snapshot());
  assert.equal(telegram.callsFor('sendMessage').length, 1);

  await service.poll(async () => snapshot({ channels: null }));
  assert.equal(telegram.callsFor('sendMessage').length, 1);

  await service.poll(async () => snapshot({
    channels: [{
      key: 'translator:server:extended:1:miner-one',
      userIdentity: 'miner-one',
      blocksFound: 1,
      bestDifficulty: 99_000,
    }],
  }));

  const alert = String(telegram.callsFor('sendMessage').at(-1)?.body.text);
  assert.match(alert, /^🎉 Block found!/);
  assert.match(alert, /Worker: miner-one/);
  assert.doesNotMatch(alert, /New best difficulty/);

  await service.poll(async () => snapshot({
    channels: [{
      key: 'translator:server:extended:1:miner-one',
      userIdentity: 'miner-one',
      blocksFound: 1,
      bestDifficulty: 99_000,
    }],
  }));
  assert.equal(telegram.callsFor('sendMessage').length, 2);
});

test('announces a new best difficulty on an existing channel', async (t) => {
  const { service, telegram } = await pairService(t);

  await service.poll(async () => snapshot());
  await service.poll(async () => snapshot({
    channels: [{
      key: 'translator:server:extended:1:miner-one',
      userIdentity: 'miner-one',
      blocksFound: 0,
      bestDifficulty: 2500,
    }],
  }));

  const alert = String(telegram.callsFor('sendMessage').at(-1)?.body.text);
  assert.match(alert, /^🏆 New best difficulty!/);
  assert.match(alert, /Difficulty: 2,500/);
});

test('detects failover across a temporary unknown pool state', async (t) => {
  const { service, telegram } = await pairService(t);

  await service.poll(async () => snapshot());
  await service.poll(async () => snapshot({
    poolName: null,
    activePoolIndex: null,
  }));
  assert.equal(telegram.callsFor('sendMessage').length, 1);

  await service.poll(async () => snapshot({
    poolName: 'Fallback pool',
    activePoolIndex: 1,
  }));
  const alert = String(telegram.callsFor('sendMessage').at(-1)?.body.text);
  assert.match(alert, /^🔁 Pool failover/);
  assert.match(alert, /From: Primary pool/);
  assert.match(alert, /To: Fallback pool/);
});

test('detects failover between custom pools with the same name', async (t) => {
  const { service, telegram } = await pairService(t);

  await service.poll(async () => snapshot({ poolName: 'Custom Pool' }));
  await service.poll(async () => snapshot({
    poolName: 'Custom Pool',
    activePoolIndex: 1,
  }));

  const alert = String(telegram.callsFor('sendMessage').at(-1)?.body.text);
  assert.match(alert, /^🔁 Pool failover/);
  assert.match(alert, /From: Custom Pool \(Primary\)/);
  assert.match(alert, /To: Custom Pool \(Fallback 1\)/);
});

test('configures alerts with the bot settings keyboard', async (t) => {
  const { service, telegram } = await pairService(t);

  telegram.enqueue('getUpdates', [{
    update_id: 78,
    message: {
      message_id: 8,
      text: '/settings',
      chat: { id: 987, type: 'private', first_name: 'Miner' },
    },
  }]);
  await service.poll(async () => snapshot());

  const settingsMessage = telegram.callsFor('sendMessage').at(-1);
  assert.match(String(settingsMessage?.body.text), /SV2 Telegram alerts/);
  assert.ok(settingsMessage?.body.reply_markup);

  telegram.enqueue('getUpdates', [
    {
      update_id: 79,
      callback_query: {
        id: 'callback-1',
        data: 'sv2:toggle:block',
        message: {
          message_id: 9,
          chat: { id: 987, type: 'private', first_name: 'Miner' },
        },
      },
    },
    {
      update_id: 80,
      callback_query: {
        id: 'callback-2',
        data: 'sv2:toggle:best',
        message: {
          message_id: 9,
          chat: { id: 987, type: 'private', first_name: 'Miner' },
        },
      },
    },
  ]);
  await service.poll(async () => snapshot());

  const settings = await service.getSettings();
  assert.equal(settings.notifyOnBlockFound, false);
  assert.equal(settings.notifyOnBestDifficulty, false);
  assert.equal(telegram.callsFor('answerCallbackQuery').length, 2);
  assert.equal(telegram.callsFor('editMessageText').length, 2);
  assert.equal(
    (telegram.callsFor('getUpdates').at(-1)?.body.offset),
    79
  );
});

test('keeps bot commands active when notifications are disabled', async (t) => {
  const { service, telegram } = await pairService(t);
  await service.updateSettings({ enabled: false });
  telegram.enqueue('getUpdates', [{
    update_id: 78,
    message: {
      message_id: 10,
      text: '/status',
      chat: { id: 987, type: 'private', first_name: 'Miner' },
    },
  }]);

  await service.poll(async () => snapshot());
  assert.match(
    String(telegram.callsFor('sendMessage').at(-1)?.body.text),
    /SV2 mining status/
  );
});

test('migrates the original proof-of-concept settings', async (t) => {
  const settingsFile = await createSettingsFile(t);
  await fs.writeFile(settingsFile, JSON.stringify({
    version: 1,
    botToken: BOT_TOKEN,
    botUsername: 'sv2_alerts_bot',
    botName: 'SV2 alerts',
    pairingCode: null,
    chatId: 987,
    recipient: '@miner_one',
    enabled: true,
    notifyOnStatusChange: true,
    summaryIntervalMinutes: 60,
  }));

  const service = new TelegramService(
    settingsFile,
    createTelegramFetch().fetchImplementation
  );
  const settings = await service.getSettings();
  assert.equal(settings.notifyOnBlockFound, true);
  assert.equal(settings.notifyOnBestDifficulty, true);
  assert.equal(settings.notifyOnPoolChange, true);
  assert.equal(settings.notifyOnStatusChange, true);
  assert.equal(settings.summaryIntervalMinutes, 60);
});

test('never forwards a Telegram 401 or 404 as an auth failure of this API', () => {
  for (const upstreamStatus of [401, 404]) {
    const error = toTelegramApiError(upstreamStatus, 'Unauthorized');
    assert.equal(error.statusCode, 400);
    assert.match(error.message, /bot token/);
  }

  assert.equal(toTelegramApiError(409, 'Conflict').statusCode, 409);
  assert.equal(toTelegramApiError(429, 'Too Many Requests').statusCode, 429);
  assert.equal(toTelegramApiError(500, undefined).statusCode, 502);
});

test('reports a revoked bot token as a bad request', async (t) => {
  const settingsFile = await createSettingsFile(t);
  const fetchImplementation = (async () => new Response(JSON.stringify({
    ok: false,
    error_code: 401,
    description: 'Unauthorized',
  }), { status: 401 })) as typeof fetch;
  const service = new TelegramService(settingsFile, fetchImplementation);

  await assert.rejects(
    service.connectBot(BOT_TOKEN),
    (error: unknown) => error instanceof TelegramApiError && error.statusCode === 400,
  );
});

test('stores the bot token owner-only and replaces a planted symlink', async (t) => {
  const settingsFile = await createSettingsFile(t);
  const outside = path.join(path.dirname(settingsFile), 'outside.json');
  await fs.writeFile(outside, '{}');
  await fs.symlink(outside, settingsFile);

  const service = new TelegramService(
    settingsFile,
    createTelegramFetch({ getMe: [BOT] }).fetchImplementation,
  );
  await service.connectBot(BOT_TOKEN);

  const stat = await fs.lstat(settingsFile);
  assert.equal(stat.isFile(), true);
  assert.equal(stat.mode & 0o777, 0o600);
  assert.equal(await fs.readFile(outside, 'utf8'), '{}');
});

test('ignores a symlinked settings file on load', async (t) => {
  const settingsFile = await createSettingsFile(t);
  const { settingsFile: realFile } = await pairService(t);
  await fs.symlink(realFile, settingsFile);

  const service = new TelegramService(settingsFile, createTelegramFetch().fetchImplementation);
  const settings = await service.getSettings();
  assert.equal(settings.connected, false);
});

test('does not treat an unreachable Docker daemon as mining stopping', async (t) => {
  const { service, telegram } = await pairService(t);
  await service.updateSettings({ notifyOnStatusChange: true });
  const sentBefore = telegram.callsFor('sendMessage').length;

  await service.poll(async () => snapshot());
  await service.poll(async () => snapshot({
    unavailable: true,
    running: false,
    channels: null,
  }));
  await service.poll(async () => snapshot());

  assert.equal(telegram.callsFor('sendMessage').length, sentBefore);
  assert.match(
    formatTelegramStatus(snapshot({ unavailable: true, running: false })),
    /Status: Unknown/,
  );
});

test('throttles activity snapshots but still answers bot commands', async (t) => {
  const settingsFile = await createSettingsFile(t);
  const telegram = createTelegramFetch({ getMe: [BOT] });
  const service = new TelegramService(settingsFile, telegram.fetchImplementation, {
    activityIntervalMs: 60_000,
  });
  const connected = await service.connectBot(BOT_TOKEN);
  const pairingCode = new URL(connected.pairingUrl ?? '').searchParams.get('start');
  telegram.enqueue('getUpdates', [{
    update_id: 1,
    message: {
      message_id: 1,
      text: `/start ${pairingCode}`,
      chat: { id: 987, type: 'private', username: 'miner_one' },
    },
  }]);
  await service.pairChat();

  let snapshots = 0;
  const provider = async () => {
    snapshots += 1;
    return snapshot();
  };

  await service.poll(provider);
  await service.poll(provider);
  assert.equal(snapshots, 1);

  telegram.enqueue('getUpdates', [{
    update_id: 2,
    message: {
      message_id: 2,
      text: '/help',
      chat: { id: 987, type: 'private', username: 'miner_one' },
    },
  }]);
  const sentBefore = telegram.callsFor('sendMessage').length;
  await service.poll(provider);
  assert.equal(snapshots, 1);
  assert.equal(telegram.callsFor('sendMessage').length, sentBefore + 1);
});

test('drops baselines for channels that are gone', async (t) => {
  const { service, telegram } = await pairService(t);
  const channel = (key: string, blocksFound: number) => ({
    key,
    userIdentity: key,
    blocksFound,
    bestDifficulty: 10,
  });

  await service.poll(async () => snapshot({ channels: [channel('old', 0)] }));
  await service.poll(async () => snapshot({ channels: [channel('new', 0)] }));
  const sentBefore = telegram.callsFor('sendMessage').length;

  // A key that disappeared has no baseline any more, so it is re-baselined
  // instead of being compared against stale data.
  await service.poll(async () => snapshot({ channels: [channel('new', 0), channel('old', 3)] }));
  assert.equal(telegram.callsFor('sendMessage').length, sentBefore);

  await service.poll(async () => snapshot({ channels: [channel('new', 1), channel('old', 3)] }));
  assert.match(String(telegram.callsFor('sendMessage').at(-1)?.body.text), /Block found!\nPool: Primary pool\nWorker: new/);
});

test('stops paginating on an invalid total, a short page, or too many items', async () => {
  let calls = 0;
  const invalidTotal = await collectPaginatedMonitoringItems(async () => {
    calls += 1;
    return { total: Number.NaN, items: Array.from({ length: 100 }, () => 1) };
  });
  assert.equal(invalidTotal, null);
  assert.equal(calls, 1);

  calls = 0;
  const ignoresOffset = await collectPaginatedMonitoringItems(async () => {
    calls += 1;
    return { total: 1_000_000_000, items: Array.from({ length: 100 }, () => 1) };
  }, 100, 1_000);
  assert.equal(ignoresOffset, null);
  assert.equal(calls, 11);

  const shortPage = await collectPaginatedMonitoringItems(async () => (
    { total: 1_000, items: [1, 2, 3] }
  ));
  assert.deepEqual(shortPage, [1, 2, 3]);
});

test('limits concurrent monitoring requests', async () => {
  let active = 0;
  let maxActive = 0;
  const results = await mapWithConcurrency([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 3, async (value) => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active -= 1;
    return value * 2;
  });

  assert.equal(maxActive, 3);
  assert.deepEqual(results, [2, 4, 6, 8, 10, 12, 14, 16, 18, 20]);
});

test('sanitizes untrusted worker names', () => {
  assert.equal(
    formatWorkerName('rig\n\n🔴 SV2 mining stopped\r\nUpdate now'),
    'rig 🔴 SV2 mining stopped Update now',
  );
  assert.equal(formatWorkerName('‮evil‬'), 'evil');
  assert.equal(formatWorkerName('   '), 'unnamed');
  assert.equal(Array.from(formatWorkerName('x'.repeat(500))).length, 128);
  // A full address.worker identity is shown as is, like on the dashboard.
  const identity = `bc1p${'x'.repeat(58)}.NerdAxe`;
  assert.equal(formatWorkerName(identity), identity);
});

test('a disconnect during pairing is not undone when pairing finishes', async (t) => {
  const settingsFile = await createSettingsFile(t);
  const telegram = createTelegramFetch({ getMe: [BOT] });
  let releaseSend: () => void = () => undefined;
  const sendGate = new Promise<void>((resolve) => {
    releaseSend = resolve;
  });
  const fetchImplementation = (async (input: string | URL | Request, init?: RequestInit) => {
    if (String(input).endsWith('/sendMessage')) await sendGate;
    return telegram.fetchImplementation(input, init);
  }) as typeof fetch;

  const service = new TelegramService(settingsFile, fetchImplementation);
  const connected = await service.connectBot(BOT_TOKEN);
  const pairingCode = new URL(connected.pairingUrl ?? '').searchParams.get('start');
  telegram.enqueue('getUpdates', [{
    update_id: 5,
    message: {
      message_id: 1,
      text: `/start ${pairingCode}`,
      chat: { id: 987, type: 'private', username: 'miner_one' },
    },
  }]);

  const pairing = service.pairChat();
  await new Promise((resolve) => setTimeout(resolve, 10));
  await service.disconnect();
  releaseSend();

  await assert.rejects(pairing, TelegramConfigError);
  assert.equal((await service.getSettings()).connected, false);
  await assert.rejects(fs.access(settingsFile));
});

test('a disconnect always lands after queued settings writes', async (t) => {
  const { service, settingsFile } = await pairService(t);

  const updates = [
    service.updateSettings({ notifyOnWorkerChange: true }),
    service.updateSettings({ notifyOnRejectedShares: true }),
  ];
  await service.disconnect();
  await Promise.all(updates);

  await assert.rejects(fs.access(settingsFile));
  const reloaded = new TelegramService(settingsFile, createTelegramFetch().fetchImplementation);
  assert.equal((await reloaded.getSettings()).connected, false);
});

test('messages from strangers do not rewrite the settings file', async (t) => {
  const { service, settingsFile, telegram } = await pairService(t);
  // The first check saves the pool's best-difficulty record; take it first.
  await service.poll(async () => snapshot());
  const before = await fs.stat(settingsFile);

  telegram.enqueue('getUpdates', Array.from({ length: 100 }, (_, index) => ({
    update_id: 1_000 + index,
    message: {
      message_id: index,
      text: '/status',
      chat: { id: 5_000 + index, type: 'private' },
    },
  })));
  const sentBefore = telegram.calls.length;
  await service.poll(async () => snapshot());

  const after = await fs.stat(settingsFile);
  assert.equal(after.ino, before.ino);
  assert.equal(after.mtimeMs, before.mtimeMs);
  // Only the getUpdates call itself; strangers get no reply.
  assert.equal(telegram.calls.length - sentBefore, 1);

  // The offset still advanced in memory.
  await service.poll(async () => snapshot());
  assert.equal(telegram.callsFor('getUpdates').at(-1)?.body.offset, 1_100);
});

test('a rejected alert is dropped and does not block later alerts', async (t) => {
  const telegram = createTelegramFetch({ getMe: [BOT] });
  let rejectNextSend = false;
  let failNextSendTransiently = false;
  const fetchImplementation = (async (input: string | URL | Request, init?: RequestInit) => {
    if (String(input).endsWith('/sendMessage')) {
      if (rejectNextSend) {
        rejectNextSend = false;
        return new Response(JSON.stringify({
          ok: false,
          error_code: 400,
          description: 'Bad Request: message is too long',
        }), { status: 400 });
      }
      if (failNextSendTransiently) {
        failNextSendTransiently = false;
        throw new Error('network down');
      }
    }
    return telegram.fetchImplementation(input, init);
  }) as typeof fetch;
  // Pair with the plain fetch, then load the same settings file into a
  // service that uses the failure-injecting fetch.
  const { settingsFile } = await pairService(t, telegram);
  const flaky = new TelegramService(settingsFile, fetchImplementation);

  const block = (blocksFound: number) => snapshot({
    channels: [{
      key: 'translator:server:extended:1:miner-one',
      userIdentity: 'miner-one',
      blocksFound,
      bestDifficulty: 1250,
    }],
  });

  await flaky.poll(async () => block(0));
  rejectNextSend = true;
  await flaky.poll(async () => block(1));
  const sendsAfterRejection = telegram.callsFor('sendMessage').length;

  // The rejected alert is not retried, and the next block is delivered.
  await flaky.poll(async () => block(2));
  assert.equal(telegram.callsFor('sendMessage').length, sendsAfterRejection + 1);
  assert.match(String(telegram.callsFor('sendMessage').at(-1)?.body.text), /Channel total: 2/);

  // A transient failure keeps the alert queued and sends it exactly once later.
  failNextSendTransiently = true;
  await flaky.poll(async () => block(3));
  await flaky.poll(async () => block(3));
  const texts = telegram.callsFor('sendMessage').map((call) => String(call.body.text));
  assert.equal(texts.filter((text) => /Channel total: 3/.test(text)).length, 1);
});

test('pairing finds the /start message behind a flood of other updates', async (t) => {
  const settingsFile = await createSettingsFile(t);
  const telegram = createTelegramFetch({ getMe: [BOT] });
  const service = new TelegramService(settingsFile, telegram.fetchImplementation);
  const connected = await service.connectBot(BOT_TOKEN);
  const pairingCode = new URL(connected.pairingUrl ?? '').searchParams.get('start');

  telegram.enqueue(
    'getUpdates',
    Array.from({ length: 100 }, (_, index) => ({
      update_id: index + 1,
      message: { message_id: index, text: 'spam', chat: { id: 1, type: 'private' } },
    })),
    [{
      update_id: 101,
      message: {
        message_id: 101,
        text: `/start ${pairingCode}`,
        chat: { id: 987, type: 'private', username: 'miner_one' },
      },
    }],
  );

  const paired = await service.pairChat();
  assert.equal(paired.paired, true);
  assert.deepEqual(
    telegram.callsFor('getUpdates').map((call) => call.body.offset),
    [0, 101],
  );
});

test('rejects a malformed bot token before calling Telegram', async (t) => {
  const settingsFile = await createSettingsFile(t);
  const telegram = createTelegramFetch({ getMe: [BOT] });
  const service = new TelegramService(settingsFile, telegram.fetchImplementation);

  await assert.rejects(service.connectBot('123/../../evil'), TelegramConfigError);
  assert.equal(telegram.calls.length, 0);
});

test('shows fixed messages for Telegram errors and keeps the detail for logs only', () => {
  const rejected = toTelegramApiError(400, 'Bad Request: message is too long\n<b>x</b>');
  assert.equal(rejected.statusCode, 400);
  assert.equal(rejected.message, 'Telegram rejected the request.');
  assert.equal(rejected.detail, 'Bad Request: message is too long <b>x</b>');

  // A blocked bot cannot be fixed by retrying, so it is not a transient error.
  const blocked = toTelegramApiError(403, 'Forbidden: bot was blocked by the user');
  assert.equal(blocked.statusCode, 400);
  assert.match(blocked.message, /Unblock the bot/);

  const upstream = toTelegramApiError(502, 'Bad Gateway');
  assert.equal(upstream.statusCode, 502);
  assert.doesNotMatch(upstream.message, /Bad Gateway/);
});

test('shares one item budget across every paginated monitoring read', async () => {
  const budget = { remainingItems: 250 };
  const fullPages = async () => ({ total: 1_000, items: Array.from({ length: 100 }, () => 1) });

  const first = await collectPaginatedMonitoringItems(
    async () => ({ total: 100, items: Array.from({ length: 100 }, () => 1) }),
    100,
    5_000,
    budget,
  );
  assert.equal(first?.length, 100);
  assert.equal(budget.remainingItems, 150);

  // Each read is under its own per-endpoint cap, but together they exceed the
  // shared budget, so the second one gives up.
  assert.equal(await collectPaginatedMonitoringItems(fullPages, 100, 5_000, budget), null);
  assert.ok(budget.remainingItems < 0);
});

test('formats pool names on a single line', () => {
  assert.equal(formatPoolName('Pool\nPool failover\nTo: evil'), 'Pool Pool failover To: evil');
  assert.equal(formatPoolName('  '), 'Unnamed pool');
  assert.equal(Array.from(formatPoolName('p'.repeat(200))).length, 64);
});

function failingTelegram(
  telegram: ReturnType<typeof createTelegramFetch>,
  failure: { current: null | { method: string; status: number; description: string } | 'network' },
) {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const method = String(input).split('/').at(-1);
    const current = failure.current;
    if (current === 'network') throw new Error('network down');
    if (current && (current.method === '*' || current.method === method)) {
      return new Response(JSON.stringify({
        ok: false,
        error_code: current.status,
        description: current.description,
      }), { status: current.status });
    }
    return telegram.fetchImplementation(input, init);
  }) as typeof fetch;
}

test('a revoked token is shown in settings and retried with backoff', async (t) => {
  const telegram = createTelegramFetch({ getMe: [BOT] });
  const { settingsFile } = await pairService(t, telegram);
  const failure: Parameters<typeof failingTelegram>[1] = { current: null };
  let now = 1_000_000;
  const service = new TelegramService(settingsFile, failingTelegram(telegram, failure), {
    now: () => now,
  });
  assert.equal((await service.getSettings()).deliveryError, null);

  failure.current = { method: '*', status: 401, description: 'Unauthorized' };
  await service.poll(async () => snapshot());
  assert.match((await service.getSettings()).deliveryError ?? '', /rejected the bot token/);

  // Backing off: no Telegram calls until the retry time.
  const callsBefore = telegram.calls.length;
  now += 60_000;
  await service.poll(async () => snapshot());
  assert.equal(telegram.calls.length, callsBefore);

  // After the retry delay a working token clears the warning.
  failure.current = null;
  now += 5 * 60_000;
  await service.poll(async () => snapshot());
  assert.equal((await service.getSettings()).deliveryError, null);
});

test('a blocked bot is shown until a message gets through again', async (t) => {
  const telegram = createTelegramFetch({ getMe: [BOT] });
  const { settingsFile } = await pairService(t, telegram);
  const failure: Parameters<typeof failingTelegram>[1] = { current: null };
  const service = new TelegramService(settingsFile, failingTelegram(telegram, failure));

  failure.current = { method: 'sendMessage', status: 403, description: 'Forbidden: bot was blocked by the user' };
  await assert.rejects(service.sendTestMessage());
  assert.match((await service.getSettings()).deliveryError ?? '', /Unblock the bot/);

  // Reading updates still works while blocked, but does not clear the warning.
  await service.poll(async () => snapshot());
  assert.match((await service.getSettings()).deliveryError ?? '', /Unblock the bot/);

  failure.current = null;
  await service.sendTestMessage();
  assert.equal((await service.getSettings()).deliveryError, null);
});

test('a brief network outage is not reported, a long one is', async (t) => {
  const telegram = createTelegramFetch({ getMe: [BOT] });
  const { settingsFile } = await pairService(t, telegram);
  const failure: Parameters<typeof failingTelegram>[1] = { current: 'network' };
  let now = 1_000_000;
  const service = new TelegramService(settingsFile, failingTelegram(telegram, failure), {
    now: () => now,
  });

  await service.poll(async () => snapshot());
  assert.equal((await service.getSettings()).deliveryError, null);

  now += 3 * 60_000;
  await service.poll(async () => snapshot());
  assert.match((await service.getSettings()).deliveryError ?? '', /cannot reach Telegram/);

  failure.current = null;
  await service.poll(async () => snapshot());
  assert.equal((await service.getSettings()).deliveryError, null);
});

test('rejects null and mistyped settings instead of ignoring them', async (t) => {
  const { service } = await pairService(t);

  await assert.rejects(
    service.updateSettings({ notifyOnBlockFound: null } as never),
    TelegramConfigError,
  );
  await assert.rejects(
    service.updateSettings({ summaryIntervalMinutes: null } as never),
    TelegramConfigError,
  );
  // Unknown keys are still ignored.
  await service.updateSettings({ notifyOnWorkerChange: true, chatId: 1 } as never);
  assert.equal((await service.getSettings()).notifyOnWorkerChange, true);
});

function channelSnapshot(
  channels: Array<[key: string, bestDifficulty: number]>,
  update: Partial<TelegramActivitySnapshot> = {},
): TelegramActivitySnapshot {
  return snapshot({
    channels: channels.map(([key, bestDifficulty]) => ({
      key,
      userIdentity: key,
      blocksFound: 0,
      bestDifficulty,
    })),
    ...update,
  });
}

function bestDifficultyAlerts(telegram: ReturnType<typeof createTelegramFetch>): string[] {
  return telegram.callsFor('sendMessage')
    .map((call) => String(call.body.text))
    .filter((text) => text.startsWith('🏆'));
}

test('changing a setting keeps the best-difficulty record', async (t) => {
  const { service, telegram } = await pairService(t);

  await service.poll(async () => channelSnapshot([['a', 5000]]));
  await service.updateSettings({ notifyOnWorkerChange: true });
  await service.poll(async () => channelSnapshot([['a', 5000], ['b', 900]]));
  assert.equal(bestDifficultyAlerts(telegram).length, 0);

  await service.poll(async () => channelSnapshot([['a', 5000], ['b', 7000]]));
  const [alert] = bestDifficultyAlerts(telegram);
  assert.match(alert, /Difficulty: 7,000/);
  assert.match(alert, /Previous best: 5,000/);
});

test('the record survives a restart and a stack restart', async (t) => {
  const telegram = createTelegramFetch({ getMe: [BOT] });
  const { service, settingsFile } = await pairService(t, telegram);
  await service.poll(async () => channelSnapshot([['old', 5000]]));

  // SV2 UI restarts: a new service loads the same file. The mining stack
  // restarted too, so channels are new and start low.
  const restarted = new TelegramService(settingsFile, telegram.fetchImplementation);
  await restarted.poll(async () => channelSnapshot([['new', 0]]));
  await restarted.poll(async () => channelSnapshot([['new', 900]]));
  assert.equal(bestDifficultyAlerts(telegram).length, 0);

  // A brand new channel that beats the record right away is announced.
  await restarted.poll(async () => channelSnapshot([['new', 900], ['newer', 6000]]));
  assert.match(bestDifficultyAlerts(telegram)[0], /Previous best: 5,000/);
});

test('each pool keeps its own record, like the dashboard', async (t) => {
  const { service, telegram } = await pairService(t);
  const primary = { poolName: 'Primary pool', recordKey: 'no-jd:Primary pool', activePoolIndex: 0 };
  const fallback = { poolName: 'Fallback pool', recordKey: 'no-jd:Fallback pool', activePoolIndex: 1 };

  await service.poll(async () => channelSnapshot([['a', 5000]], primary));
  // First time on the fallback: its record starts from what is there now.
  await service.poll(async () => channelSnapshot([['a', 5000]], fallback));
  await service.poll(async () => channelSnapshot([['a', 6000]], fallback));
  assert.match(bestDifficultyAlerts(telegram)[0], /Previous best: 5,000/);

  // Back on the primary: 6000 was reached on the fallback, so it raises the
  // primary's record silently instead of being announced again.
  await service.poll(async () => channelSnapshot([['a', 6000]], primary));
  assert.equal(bestDifficultyAlerts(telegram).length, 1);
});

test('no best-difficulty alert while the pool is unknown', async (t) => {
  const { service, telegram } = await pairService(t);

  await service.poll(async () => channelSnapshot([['a', 5000]]));
  await service.poll(async () => channelSnapshot(
    [['a', 9000]],
    { poolName: null, recordKey: null, activePoolIndex: null },
  ));
  assert.equal(bestDifficultyAlerts(telegram).length, 0);
});

test('drops malformed saved records instead of the whole file', async (t) => {
  const { settingsFile } = await pairService(t);
  const saved = JSON.parse(await fs.readFile(settingsFile, 'utf8'));
  await fs.writeFile(settingsFile, JSON.stringify({
    ...saved,
    bestDifficultyRecords: [['no-jd:Primary pool', 5000], ['bad', 'x'], 'junk'],
  }));

  const service = new TelegramService(settingsFile, createTelegramFetch().fetchImplementation);
  assert.equal((await service.getSettings()).paired, true);
});

async function pairServiceWithClock(t: TestContext, clock: { now: number }) {
  const telegram = createTelegramFetch({ getMe: [BOT] });
  const { settingsFile } = await pairService(t, telegram);
  const service = new TelegramService(settingsFile, telegram.fetchImplementation, {
    now: () => clock.now,
  });
  return { service, telegram };
}

function alertsStartingWith(telegram: ReturnType<typeof createTelegramFetch>, prefix: string): string[] {
  return telegram.callsFor('sendMessage')
    .map((call) => String(call.body.text))
    .filter((text) => text.startsWith(prefix));
}

test('every rejected-share increase is reported right away', async (t) => {
  const clock = { now: 1_000_000 };
  const { service, telegram } = await pairServiceWithClock(t, clock);
  await service.updateSettings({ notifyOnRejectedShares: true });

  for (const sharesRejected of [2, 5, 9]) {
    clock.now += 30_000;
    await service.poll(async () => snapshot({ sharesRejected }));
  }

  const alerts = alertsStartingWith(telegram, '⚠️');
  assert.equal(alerts.length, 2);
  assert.match(alerts[0], /New rejected shares: 3/);
  assert.match(alerts[1], /New rejected shares: 4\nTotal rejected: 9/);
});

test('a mining restart resets the rejected-share count without an alert', async (t) => {
  const clock = { now: 1_000_000 };
  const { service, telegram } = await pairServiceWithClock(t, clock);
  await service.updateSettings({ notifyOnRejectedShares: true });

  await service.poll(async () => snapshot({ sharesRejected: 40 }));
  clock.now += 30_000;
  await service.poll(async () => snapshot({ sharesRejected: 0 }));
  clock.now += 30_000;
  await service.poll(async () => snapshot({ sharesRejected: 1 }));
  const alerts = alertsStartingWith(telegram, '⚠️');
  assert.equal(alerts.length, 1);
  assert.match(alerts[0], /New rejected shares: 1/);
});

test('every worker change is reported, including a miner that keeps dropping', async (t) => {
  const clock = { now: 1_000_000 };
  const { service, telegram } = await pairServiceWithClock(t, clock);
  await service.updateSettings({ notifyOnWorkerChange: true });
  const workerAlerts = () => telegram.callsFor('sendMessage')
    .map((call) => String(call.body.text))
    .filter((text) => text.includes('Connected workers:'));

  await service.poll(async () => snapshot({ workers: 5 }));
  for (const workers of [4, 5, 4, 5]) {
    clock.now += 30_000;
    await service.poll(async () => snapshot({ workers }));
  }

  const alerts = workerAlerts();
  assert.equal(alerts.length, 4);
  assert.equal(alerts[0], '🟠 Worker disconnected\nConnected workers: 4');
  assert.equal(alerts[1], '🟢 Worker connected\nConnected workers: 5');
});

test('turning an alert on does not report changes from before', async (t) => {
  const clock = { now: 1_000_000 };
  const { service, telegram } = await pairServiceWithClock(t, clock);

  await service.poll(async () => snapshot({ workers: 5 }));
  clock.now += 30_000;
  await service.poll(async () => snapshot({ workers: 2 }));
  await service.updateSettings({ notifyOnWorkerChange: true });
  clock.now += 30_000;
  await service.poll(async () => snapshot({ workers: 2 }));
  assert.equal(
    telegram.callsFor('sendMessage').filter((call) => String(call.body.text).includes('Workers:')).length,
    0,
  );
});

test('the summary interval only takes the shared options', async (t) => {
  const { service } = await pairService(t);

  await assert.rejects(service.updateSettings({ summaryIntervalMinutes: 120 }), TelegramConfigError);
  for (const minutes of TELEGRAM_SUMMARY_INTERVALS) {
    assert.equal((await service.updateSettings({ summaryIntervalMinutes: minutes })).summaryIntervalMinutes, minutes);
  }
});

test('the /settings summary button cycles through the shared options', async (t) => {
  const { service, telegram } = await pairService(t);
  const seen: number[] = [];

  for (let index = 0; index < TELEGRAM_SUMMARY_INTERVALS.length; index += 1) {
    telegram.enqueue('getUpdates', [{
      update_id: 100 + index,
      callback_query: {
        id: `summary-${index}`,
        data: 'sv2:toggle:summary',
        message: { message_id: 9, chat: { id: 987, type: 'private', first_name: 'Miner' } },
      },
    }]);
    await service.poll(async () => snapshot());
    seen.push((await service.getSettings()).summaryIntervalMinutes);
  }

  assert.deepEqual(seen, [...TELEGRAM_SUMMARY_INTERVALS.slice(1), TELEGRAM_SUMMARY_INTERVALS[0]]);
  assert.match(String(telegram.callsFor('editMessageText').at(-1)?.body.text), /Summary: Off/);
});

test('an old summary value outside the options loads as off', async (t) => {
  const { settingsFile } = await pairService(t);
  const saved = JSON.parse(await fs.readFile(settingsFile, 'utf8'));
  await fs.writeFile(settingsFile, JSON.stringify({ ...saved, summaryIntervalMinutes: 120 }));

  const service = new TelegramService(settingsFile, createTelegramFetch().fetchImplementation);
  assert.equal((await service.getSettings()).summaryIntervalMinutes, 0);
});

test('losing every worker and the recovery get their own titles', async (t) => {
  const clock = { now: 1_000_000 };
  const { service, telegram } = await pairServiceWithClock(t, clock);
  await service.updateSettings({ notifyOnWorkerChange: true });
  const workerAlerts = () => telegram.callsFor('sendMessage')
    .map((call) => String(call.body.text))
    .filter((text) => text.includes('Connected workers:'));

  await service.poll(async () => snapshot({ workers: 3 }));
  clock.now += 30_000;
  await service.poll(async () => snapshot({ workers: 2 }));
  clock.now += 30_000;
  await service.poll(async () => snapshot({ workers: 0 }));
  clock.now += 30_000;
  await service.poll(async () => snapshot({ workers: 3 }));

  const alerts = workerAlerts();
  assert.equal(alerts.length, 3);
  assert.equal(alerts[1], '🔴 All workers disconnected\nConnected workers: 0');
  assert.equal(alerts[2], '🟢 Workers back online\nConnected workers: 3');
});

test('after a restart, miners reconnecting are reported', async (t) => {
  const clock = { now: 1_000_000 };
  const { service, telegram } = await pairServiceWithClock(t, clock);
  await service.updateSettings({ notifyOnWorkerChange: true });

  await service.poll(async () => snapshot({ workers: 5 }));
  // Stopped, then starting with no miners connected yet, then miners back.
  for (const update of [
    { running: false, workers: null },
    { running: true, workers: 0 },
    { running: true, workers: 5 },
  ]) {
    clock.now += 30_000;
    await service.poll(async () => snapshot(update));
  }

  const alerts = telegram.callsFor('sendMessage')
    .map((call) => String(call.body.text))
    .filter((text) => text.includes('Connected workers:'));
  assert.deepEqual(alerts.map((text) => text.split('\n')[0]), ['🟢 Workers back online']);
});

test('the summary is still sent on time when alerts keep firing', async (t) => {
  const clock = { now: 1_000_000 };
  const { service, telegram } = await pairServiceWithClock(t, clock);
  await service.updateSettings({ notifyOnWorkerChange: true, summaryIntervalMinutes: 15 });
  const summaries = () => telegram.callsFor('sendMessage')
    .filter((call) => String(call.body.text).startsWith('⛏ SV2 mining status'));

  await service.poll(async () => snapshot({ workers: 5 }));
  // A worker change every minute for 15 minutes.
  for (let minute = 1; minute <= 15; minute += 1) {
    clock.now += 60_000;
    await service.poll(async () => snapshot({ workers: minute % 2 === 0 ? 5 : 4 }));
  }

  assert.equal(summaries().length, 1);
});

function startUpdate(updateId: number, code: string | null) {
  return {
    update_id: updateId,
    message: {
      message_id: updateId,
      text: `/start ${code}`,
      chat: { id: 987, type: 'private', username: 'miner_one' },
    },
  };
}

test('a pairing link expires after 15 minutes and a new one is shown', async (t) => {
  const clock = { now: 1_000_000 };
  const settingsFile = await createSettingsFile(t);
  const telegram = createTelegramFetch({ getMe: [BOT] });
  const service = new TelegramService(settingsFile, telegram.fetchImplementation, {
    now: () => clock.now,
  });
  const codeOf = (url: string | null) => new URL(url ?? '').searchParams.get('start');

  const firstCode = codeOf((await service.connectBot(BOT_TOKEN)).pairingUrl);
  clock.now += 14 * 60_000;
  assert.equal(codeOf((await service.getSettings()).pairingUrl), firstCode);

  clock.now += 2 * 60_000;
  const secondCode = codeOf((await service.getSettings()).pairingUrl);
  assert.notEqual(secondCode, firstCode);

  // The old link no longer pairs, the new one does.
  telegram.enqueue('getUpdates', [startUpdate(1, firstCode)]);
  await assert.rejects(service.pairChat(), TelegramConfigError);
  telegram.enqueue('getUpdates', [startUpdate(2, secondCode)]);
  assert.equal((await service.pairChat()).paired, true);
});

test('an expired code is replaced even if pairing is checked first', async (t) => {
  const clock = { now: 1_000_000 };
  const settingsFile = await createSettingsFile(t);
  const telegram = createTelegramFetch({ getMe: [BOT] });
  const service = new TelegramService(settingsFile, telegram.fetchImplementation, {
    now: () => clock.now,
  });
  const code = new URL((await service.connectBot(BOT_TOKEN)).pairingUrl ?? '').searchParams.get('start');

  clock.now += 16 * 60_000;
  telegram.enqueue('getUpdates', [startUpdate(1, code)]);
  await assert.rejects(service.pairChat(), TelegramConfigError);
  assert.equal((await service.getSettings()).paired, false);
});

test('a saved pairing code without an expiry is replaced on load', async (t) => {
  const settingsFile = await createSettingsFile(t);
  const telegram = createTelegramFetch({ getMe: [BOT] });
  const connected = await new TelegramService(settingsFile, telegram.fetchImplementation)
    .connectBot(BOT_TOKEN);
  const saved = JSON.parse(await fs.readFile(settingsFile, 'utf8'));
  delete saved.pairingCodeExpiresAt;
  await fs.writeFile(settingsFile, JSON.stringify(saved));

  const reloaded = new TelegramService(settingsFile, telegram.fetchImplementation);
  assert.notEqual((await reloaded.getSettings()).pairingUrl, connected.pairingUrl);
});

test('pairing explains a /start sent without the pairing code', async (t) => {
  const settingsFile = await createSettingsFile(t);
  const telegram = createTelegramFetch({ getMe: [BOT] });
  const service = new TelegramService(settingsFile, telegram.fetchImplementation);
  await service.connectBot(BOT_TOKEN);

  // What Telegram sends when the bot is opened from search or BotFather.
  telegram.enqueue('getUpdates', [{
    update_id: 1,
    message: { message_id: 1, text: '/start', chat: { id: 987, type: 'private' } },
  }]);
  await assert.rejects(service.pairChat(), /without the pairing code.*Open Telegram button/);

  await assert.rejects(service.pairChat(), /No \/start from the pairing link yet/);
});

test('a first miner connecting to an empty farm is reported', async (t) => {
  const clock = { now: 1_000_000 };
  const { service, telegram } = await pairServiceWithClock(t, clock);
  await service.updateSettings({ notifyOnWorkerChange: true });

  await service.poll(async () => snapshot({ workers: 0 }));
  clock.now += 30_000;
  await service.poll(async () => snapshot({ workers: 0 }));
  clock.now += 30_000;
  await service.poll(async () => snapshot({ workers: 1 }));

  const alerts = telegram.callsFor('sendMessage')
    .map((call) => String(call.body.text))
    .filter((text) => text.includes('Connected workers:'));
  assert.equal(alerts.length, 1);
  assert.match(alerts[0], /Connected workers: 1/);
});

test('worker alerts name the workers that connected or disconnected', async (t) => {
  const clock = { now: 1_000_000 };
  const { service, telegram } = await pairServiceWithClock(t, clock);
  await service.updateSettings({ notifyOnWorkerChange: true });
  const sentBefore = telegram.callsFor('sendMessage').length;
  const poll = async (workerNames: string[]) => {
    clock.now += 5_000;
    await service.poll(async () => snapshot({ workers: workerNames.length, workerNames }));
  };

  await poll(['addr.NerdAxe']);
  await poll(['addr.NerdAxe', 'addr.BitAxe']);
  await poll(['addr.BitAxe']);
  // One miner swapped for another: the total stays the same, both are named.
  await poll(['addr.Rig2']);
  await poll(['a', 'b', 'c']);
  await poll([]);

  assert.deepEqual(sentTexts(telegram, sentBefore), [
    '🟢 Worker connected\nWorker: addr.BitAxe\nConnected workers: 2',
    '🟠 Worker disconnected\nWorker: addr.NerdAxe\nConnected workers: 1',
    '🟠 Worker disconnected\nWorker: addr.BitAxe\nConnected workers: 1',
    '🟢 Worker connected\nWorker: addr.Rig2\nConnected workers: 1',
    '🟠 Worker disconnected\nWorker: addr.Rig2\nConnected workers: 3',
    '🟢 3 workers connected\n• a\n• b\n• c\nConnected workers: 3',
    '🔴 All workers disconnected\n• a\n• b\n• c\nConnected workers: 0',
  ]);
});

function sentTexts(telegram: ReturnType<typeof createTelegramFetch>, sentBefore: number): string[] {
  return telegram.callsFor('sendMessage').slice(sentBefore).map((call) => String(call.body.text));
}

test('a new primary after a restart is not reported as a failover', async (t) => {
  const { service, telegram } = await pairService(t);
  await service.updateSettings({ notifyOnStatusChange: true });
  const sentBefore = telegram.callsFor('sendMessage').length;

  await service.poll(async () => snapshot({ poolName: 'Old pool', activePoolIndex: 0, stackId: 'a' }));
  // Reconfigured with a new primary; the restart happened between two checks.
  await service.poll(async () => snapshot({ poolName: 'New pool', activePoolIndex: 0, stackId: 'b' }));
  // Reset and set up again: a stopped check in between.
  await service.poll(async () => snapshot({ running: false, poolName: null, activePoolIndex: null, stackId: null }));
  await service.poll(async () => snapshot({ poolName: 'Other pool', activePoolIndex: 0, stackId: 'c' }));

  const sent = sentTexts(telegram, sentBefore);
  assert.equal(sent.filter((text) => text.startsWith('🔁 Pool failover')).length, 0);
  assert.deepEqual(sent.map((text) => text.split('\n')[0]), [
    '🔄 SV2 mining restarted',
    '🔴 SV2 mining stopped',
    '🟢 SV2 mining started',
  ]);
});

test('a failover on the same running stack is still reported', async (t) => {
  const { service, telegram } = await pairService(t);
  const sentBefore = telegram.callsFor('sendMessage').length;

  await service.poll(async () => snapshot({ poolName: 'Primary pool', activePoolIndex: 0, stackId: 'a' }));
  await service.poll(async () => snapshot({ poolName: 'Fallback pool', activePoolIndex: 1, stackId: 'a' }));

  assert.match(sentTexts(telegram, sentBefore)[0], /^🔁 Pool failover\nFrom: Primary pool\nTo: Fallback pool/);
});

test('shutting down SV2 UI reports that mining stopped, only if it was running', async (t) => {
  const { service, telegram } = await pairService(t);
  await service.updateSettings({ notifyOnStatusChange: true });
  const sentBefore = telegram.callsFor('sendMessage').length;

  // No check yet, then stopped: nothing to report.
  await service.notifyShutdown();
  await service.poll(async () => snapshot({ running: false }));
  await service.notifyShutdown();
  await service.poll(async () => snapshot({ running: true }));
  await service.notifyShutdown();
  await service.updateSettings({ notifyOnStatusChange: false });
  await service.notifyShutdown();

  assert.deepEqual(sentTexts(telegram, sentBefore).map((text) => text.split('\n')[0]), [
    '🟢 SV2 mining started',
    '⏹ SV2 UI is shutting down — mining stopped',
  ]);
});

test('a Docker restart is reported, and the stack restart after it', async (t) => {
  const { service, telegram } = await pairService(t);
  await service.updateSettings({ notifyOnStatusChange: true });
  const sentBefore = telegram.callsFor('sendMessage').length;
  const dockerDown = snapshot({
    unavailable: true,
    dockerUnreachable: true,
    running: false,
    poolName: null,
    activePoolIndex: null,
    channels: null,
  });

  await service.poll(async () => snapshot({ stackId: 'a' }));
  await service.poll(async () => dockerDown);
  await service.poll(async () => dockerDown);
  // Docker is back and SV2 UI already started the stack again.
  await service.poll(async () => snapshot({ stackId: 'b' }));

  assert.deepEqual(sentTexts(telegram, sentBefore).map((text) => text.split('\n')[0]), [
    '⚠️ SV2 UI can\'t reach Docker',
    '✅ SV2 UI can reach Docker again',
    '🔄 SV2 mining restarted',
  ]);
});
