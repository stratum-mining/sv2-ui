/**
 * Adversarial probes for the Telegram integration (security review of PR #228).
 * Complements telegram.test.ts with attack scenarios around pairing and commands.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';

import { TelegramService } from './telegram.js';

const BOT_TOKEN = '123456789:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const PRIVATE_CHAT = { id: 42, type: 'private', first_name: 'Miner' };

/** Sentinel: makes the mock getUpdates return a 10 MB junk response. */
const HUGE = Symbol('huge-response');

function startMessage(chat: object, text: string, updateId = 1) {
  return { update_id: updateId, message: { message_id: 1, text, chat } };
}

/**
 * Mock fetch so getMe succeeds and getUpdates serves whatever `updates`
 * currently holds. Returns counters for inspecting outbound calls.
 */
function setupTelegram(t: TestContext, updates: { current: unknown[] | typeof HUGE }) {
  const sent: Array<{ method: string; body: Record<string, unknown> }> = [];
  t.mock.method(globalThis, 'fetch', async (url: string | URL, init?: RequestInit) => {
    const urlString = String(url);
    const method = urlString.split('/').pop()!;
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    sent.push({ method, body });
    if (method === 'getMe') {
      return Response.json({
        ok: true,
        result: { id: 1, is_bot: true, first_name: 'SecTest', username: 'sectestbot' },
      });
    }
    if (method === 'getUpdates') {
      if (updates.current === HUGE) {
        // 10 MB of garbage: over the 4 MB response cap.
        return new Response('x'.repeat(10 * 1024 * 1024), { status: 200 });
      }
      return Response.json({ ok: true, result: updates.current });
    }
    return Response.json({ ok: true, result: true });
  });
  return { sent };
}

async function makeService(t: TestContext): Promise<TelegramService> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sv2-sec-'));
  t.after(async () => fs.rm(dir, { recursive: true, force: true }));
  return new TelegramService(path.join(dir, 'telegram.json'));
}

async function connectedService(t: TestContext): Promise<TelegramService> {
  const service = await makeService(t);
  await service.connectBot(BOT_TOKEN);
  return service;
}

function pairingCodeOf(settings: { pairingUrl: string | null }): string {
  return new URL(settings.pairingUrl!).searchParams.get('start')!;
}

async function pairWithMiner(t: TestContext, service: TelegramService, updates: { current: unknown[] | typeof HUGE }) {
  const code = pairingCodeOf(await service.getSettings());
  updates.current = [startMessage(PRIVATE_CHAT, `/start ${code}`)];
  await service.pairChat();
  updates.current = [];
}

test('pairing ignores a /start code sent to a group chat', async (t) => {
  const updates: { current: unknown[] | typeof HUGE } = { current: [] };
  setupTelegram(t, updates);
  const service = await connectedService(t);
  const code = pairingCodeOf(await service.getSettings());

  // Same code, but posted into a group the bot was added to.
  updates.current = [
    startMessage({ id: -100123, type: 'supergroup', title: 'Public group' }, `/start ${code}`),
  ];

  await assert.rejects(service.pairChat(), /press Start/i);
  assert.equal((await service.getSettings()).paired, false);
});

test('pairing rejects lookalike codes (prefix, suffix, case flip)', async (t) => {
  const updates: { current: unknown[] | typeof HUGE } = { current: [] };
  setupTelegram(t, updates);
  const service = await connectedService(t);
  const code = pairingCodeOf(await service.getSettings());

  const lookalikes = [
    `${code}x`, // extended
    code.slice(1), // truncated
    code.replace(/[a-z]/, (c) => c.toUpperCase()), // case flip
  ];
  for (const fake of lookalikes) {
    updates.current = [startMessage(PRIVATE_CHAT, `/start ${fake}`)];
    await assert.rejects(service.pairChat(), /press Start/i);
    assert.equal((await service.getSettings()).paired, false);
  }
});

test('a stranger cannot toggle alerts or run commands once paired', async (t) => {
  const updates: { current: unknown[] | typeof HUGE } = { current: [] };
  const { sent } = setupTelegram(t, updates);
  const service = await connectedService(t);
  await pairWithMiner(t, service, updates);
  assert.equal((await service.getSettings()).enabled, true);
  sent.length = 0;

  const stranger = { id: 1337, type: 'private', first_name: 'Mallory' };
  updates.current = [
    { update_id: 50, callback_query: { id: 'cb1', data: 'sv2:toggle:enabled', message: { message_id: 9, chat: stranger } } },
    startMessage(stranger, '/status', 51),
    startMessage(stranger, '/settings', 52),
    startMessage(stranger, '/help', 53),
  ];

  await service.poll(async () => ({
    running: true, poolName: null, activePoolIndex: null, hashrate: null,
    workers: null, sharesSubmitted: null, sharesAccepted: null, sharesRejected: null,
    channels: null,
  }));

  const leaked = sent.filter(({ method, body }) =>
    method !== 'getUpdates' &&
    (JSON.stringify(body).includes('1337') || 'callback_query_id' in body)
  );
  assert.deepEqual(leaked, [], 'no message or callback answer may go to a stranger');
  assert.equal((await service.getSettings()).enabled, true, 'stranger toggle must not stick');
});

test('a replayed pairing code after pairing is harmless', async (t) => {
  const updates: { current: unknown[] | typeof HUGE } = { current: [] };
  setupTelegram(t, updates);
  const service = await connectedService(t);
  const code = pairingCodeOf(await service.getSettings());
  await pairWithMiner(t, service, updates);

  // Attacker somehow obtained the old code and sends it from their own chat.
  updates.current = [startMessage({ id: 1337, type: 'private' }, `/start ${code}`, 99)];
  await service.poll(async () => ({
    running: true, poolName: null, activePoolIndex: null, hashrate: null,
    workers: null, sharesSubmitted: null, sharesAccepted: null, sharesRejected: null,
    channels: null,
  }));
  assert.equal((await service.getSettings()).recipient, 'Miner', 'pairing must not move to the attacker chat');
});

test('updateSettings cannot move the pairing or swap identity fields', async (t) => {
  const updates: { current: unknown[] | typeof HUGE } = { current: [] };
  setupTelegram(t, updates);
  const service = await connectedService(t);
  await pairWithMiner(t, service, updates);

  const malicious = {
    enabled: false,
    chatId: 1337,
    botToken: '999:EVIL',
    pairingCode: 'sv2_attacker',
    recipient: '@mallory',
    botUsername: 'mallorybot',
    lastUpdateId: 0,
  } as never;
  const result = await service.updateSettings(malicious);
  assert.equal(result.recipient, 'Miner');
  assert.equal(result.enabled, false);

  const raw = JSON.parse(await fs.readFile((service as never as { settingsFile: string }).settingsFile, 'utf8'));
  assert.equal(raw.chatId, 42);
  assert.equal(raw.botToken, BOT_TOKEN);
  assert.equal(raw.pairingCode, null);
  assert.equal(raw.recipient, 'Miner');
});

test('huge getUpdates responses do not exhaust memory', async (t) => {
  const updates: { current: unknown[] | typeof HUGE } = { current: [] };
  setupTelegram(t, updates);
  const service = await connectedService(t);
  await pairWithMiner(t, service, updates);

  // 10 MB of garbage from the "Telegram" endpoint: over the 4 MB cap. The
  // service must fail fast with a bounded read, not buffer the whole body.
  // The failure is recorded as a delivery problem instead of being thrown.
  updates.current = HUGE;
  await service.poll(async () => {
    throw new Error('unreachable');
  });
  assert.equal((await service.getSettings()).paired, true);
});
