import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';

import {
  formatTelegramStatus,
  getStatusChangeMessage,
  TelegramConfigError,
  TelegramService,
} from './telegram.js';
import type { TelegramActivitySnapshot } from './telegram.js';

const BOT_TOKEN = '123456:test-token';
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

test('reports only meaningful status changes', () => {
  const stopped = snapshot({
    running: false,
    poolName: null,
    hashrate: null,
    workers: null,
    sharesSubmitted: null,
    sharesAccepted: null,
    sharesRejected: null,
    channels: null,
  });

  assert.match(getStatusChangeMessage(stopped, snapshot()) ?? '', /mining started/);
  assert.match(
    getStatusChangeMessage(snapshot(), snapshot({ poolName: 'Fallback pool' })) ?? '',
    /active pool changed/
  );
  assert.equal(getStatusChangeMessage(snapshot(), snapshot()), null);
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
  await service.poll(async () => snapshot({ poolName: null }));
  assert.equal(telegram.callsFor('sendMessage').length, 1);

  await service.poll(async () => snapshot({ poolName: 'Fallback pool' }));
  const alert = String(telegram.callsFor('sendMessage').at(-1)?.body.text);
  assert.match(alert, /^🔁 Pool failover/);
  assert.match(alert, /From: Primary pool/);
  assert.match(alert, /To: Fallback pool/);
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
