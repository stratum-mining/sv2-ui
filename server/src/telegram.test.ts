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

type FetchCall = {
  url: string;
  body: Record<string, unknown>;
};

function createTelegramFetch(results: unknown[]) {
  const calls: FetchCall[] = [];
  const fetchImplementation = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({
      url: String(input),
      body: init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {},
    });

    const result = results.shift();
    if (result instanceof Error) throw result;

    return new Response(JSON.stringify({
      ok: true,
      result,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  return { calls, fetchImplementation };
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
    ...update,
  };
}

test('formats a compact mining summary', () => {
  assert.equal(
    formatTelegramStatus(snapshot()),
    [
      '⛏ SV2 mining status',
      'Status: Running',
      'Pool: Primary pool',
      'Hashrate: 125 TH/s',
      'Workers: 3',
      'Shares: 42 submitted · 40 accepted · 2 rejected',
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
  });

  assert.match(getStatusChangeMessage(stopped, snapshot()) ?? '', /mining started/);
  assert.match(
    getStatusChangeMessage(snapshot(), snapshot({ poolName: 'Fallback pool' })) ?? '',
    /active pool changed/
  );
  assert.equal(getStatusChangeMessage(snapshot(), snapshot()), null);
});

test('verifies a bot and pairs the private chat from a one-time deep link', async (t) => {
  const settingsFile = await createSettingsFile(t);
  const telegram = createTelegramFetch([
    {
      id: 123456,
      is_bot: true,
      first_name: 'SV2 alerts',
      username: 'sv2_alerts_bot',
    },
  ]);
  const service = new TelegramService(settingsFile, telegram.fetchImplementation);
  const connected = await service.connectBot(BOT_TOKEN);
  const pairingCode = new URL(connected.pairingUrl ?? '').searchParams.get('start');
  assert.ok(pairingCode);
  assert.equal(JSON.stringify(connected).includes(BOT_TOKEN), false);

  const pairingTelegram = createTelegramFetch([
    [{
      update_id: 77,
      message: {
        text: `/start ${pairingCode}`,
        chat: {
          id: 987,
          type: 'private',
          first_name: 'Miner',
          username: 'miner_one',
        },
      },
    }],
    { message_id: 5 },
  ]);
  const reloadedService = new TelegramService(settingsFile, pairingTelegram.fetchImplementation);
  const paired = await reloadedService.pairChat();

  assert.equal(paired.paired, true);
  assert.equal(paired.enabled, true);
  assert.equal(paired.recipient, '@miner_one');
  assert.equal(paired.pairingUrl, null);
  assert.equal(pairingTelegram.calls.at(-1)?.body.chat_id, 987);

  const savedMode = (await fs.stat(settingsFile)).mode & 0o777;
  assert.equal(savedMode, 0o600);
});

test('does not pair a chat until the matching Start command arrives', async (t) => {
  const settingsFile = await createSettingsFile(t);
  const telegram = createTelegramFetch([
    {
      id: 123456,
      is_bot: true,
      first_name: 'SV2 alerts',
      username: 'sv2_alerts_bot',
    },
    [],
  ]);
  const service = new TelegramService(settingsFile, telegram.fetchImplementation);
  await service.connectBot(BOT_TOKEN);

  await assert.rejects(
    service.pairChat(),
    (error: unknown) =>
      error instanceof TelegramConfigError &&
      error.message.includes('press Start')
  );
});

test('the background poll establishes a baseline before sending a transition', async (t) => {
  const settingsFile = await createSettingsFile(t);
  const telegram = createTelegramFetch([
    {
      id: 123456,
      is_bot: true,
      first_name: 'SV2 alerts',
      username: 'sv2_alerts_bot',
    },
  ]);
  const service = new TelegramService(settingsFile, telegram.fetchImplementation);
  const connected = await service.connectBot(BOT_TOKEN);
  const pairingCode = new URL(connected.pairingUrl ?? '').searchParams.get('start');

  const pairedTelegram = createTelegramFetch([
    [{
      update_id: 77,
      message: {
        text: `/start ${pairingCode}`,
        chat: { id: 987, type: 'private', first_name: 'Miner' },
      },
    }],
    { message_id: 5 },
    { message_id: 6 },
  ]);
  const pairedService = new TelegramService(settingsFile, pairedTelegram.fetchImplementation);
  await pairedService.pairChat();

  const stopped = snapshot({
    running: false,
    poolName: null,
    hashrate: null,
    workers: null,
    sharesSubmitted: null,
    sharesAccepted: null,
    sharesRejected: null,
  });
  await pairedService.poll(async () => stopped);
  assert.equal(pairedTelegram.calls.length, 2);

  await pairedService.poll(async () => snapshot());
  assert.equal(pairedTelegram.calls.length, 3);
  assert.match(String(pairedTelegram.calls[2].body.text), /mining started/);
});
