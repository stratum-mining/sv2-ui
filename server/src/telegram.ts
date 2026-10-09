import { randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import { formatSummaryInterval, TELEGRAM_SUMMARY_INTERVALS } from '@sv2-ui/shared';

import { writeFileAtomically } from './atomic-write.js';
import { readJsonWithLimit } from './bounded-json.js';
import { ensureConfigDir } from './config-dir.js';

// Telegram rejects messages longer than 4096 characters.
const MAX_TELEGRAM_MESSAGE_LENGTH = 4096;
// Alerts waiting to be delivered (e.g. while Telegram is unreachable).
const MAX_PENDING_MESSAGES = 20;
// Fits a full `<payout address>.<worker>` identity, as the dashboard shows it.
const MAX_WORKER_NAME_LENGTH = 128;
const SHUTDOWN_MESSAGE = '⏹ SV2 UI is shutting down — mining stopped';
// Worker alerts list at most this many names in one message.
const MAX_LISTED_WORKERS = 10;
const MAX_POOL_NAME_LENGTH = 64;
// getUpdates returns at most 100 updates; even with long messages a response
// stays well below this.
const MAX_TELEGRAM_RESPONSE_BYTES = 4 * 1024 * 1024;
// A pairing link stops working after this long and a new one is shown, so a
// link that leaked (a screenshot, browser history) cannot be used later.
const PAIRING_CODE_TTL_MS = 15 * 60_000;
// Batches scanned per "Check pairing" click while looking for the /start code.
const MAX_PAIRING_UPDATE_BATCHES = 10;
const BOT_TOKEN_PATTERN = /^\d{1,20}:[A-Za-z0-9_-]{20,100}$/;
const BOT_USERNAME_PATTERN = /^[A-Za-z0-9_]{1,64}$/;
export const MAX_MONITORING_ITEMS = 5_000;

// One record per mode and pool; 17 pools in two modes stay well below this.
const MAX_BEST_DIFFICULTY_RECORDS = 64;


type FetchImplementation = typeof fetch;

type TelegramBot = {
  id: number;
  is_bot: boolean;
  first_name: string;
  username?: string;
};

type TelegramChat = {
  id: number;
  type: string;
  first_name?: string;
  last_name?: string;
  username?: string;
  title?: string;
};

type TelegramMessage = {
  message_id: number;
  text?: string;
  chat: TelegramChat;
};

type TelegramCallbackQuery = {
  id: string;
  data?: string;
  message?: TelegramMessage;
};

type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
};

type TelegramApiResponse<T> = {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
};

type TelegramAlertSettings = {
  enabled: boolean;
  notifyOnBlockFound: boolean;
  notifyOnBestDifficulty: boolean;
  notifyOnPoolChange: boolean;
  notifyOnStatusChange: boolean;
  notifyOnWorkerChange: boolean;
  notifyOnRejectedShares: boolean;
  summaryIntervalMinutes: number;
};

type SavedTelegramSettings = TelegramAlertSettings & {
  version: 2;
  botToken: string;
  botUsername: string;
  botName: string;
  pairingCode: string | null;
  chatId: number | null;
  recipient: string | null;
  lastUpdateId: number | null;
  /** When the current pairing code stops working; missing or null means expired. */
  pairingCodeExpiresAt?: number | null;
  /**
   * Best difficulty seen per `mode:pool`, the same key the dashboard's Best
   * Difficulty tile uses, so alerts and the tile agree. Oldest first.
   */
  bestDifficultyRecords?: Array<[string, number]>;
};

type LegacySavedTelegramSettings = {
  version: 1;
  botToken: string;
  botUsername: string;
  botName: string;
  pairingCode: string | null;
  chatId: number | null;
  recipient: string | null;
  enabled: boolean;
  notifyOnStatusChange: boolean;
  summaryIntervalMinutes: number;
};

export type TelegramSettings = TelegramAlertSettings & {
  connected: boolean;
  paired: boolean;
  botUsername: string | null;
  botName: string | null;
  recipient: string | null;
  pairingUrl: string | null;
  /**
   * Set when alerts are currently not reaching Telegram (revoked token, bot
   * blocked, Telegram unreachable for a while). Null when delivery is healthy.
   */
  deliveryError: string | null;
};

export type TelegramSettingsUpdate = Partial<TelegramAlertSettings>;

export type TelegramMiningChannel = {
  key: string;
  /** Null when several miners share the channel, so no single worker can be named. */
  userIdentity: string | null;
  blocksFound: number;
  bestDifficulty: number;
};

export type TelegramActivitySnapshot = {
  /**
   * Set when mining status could not be determined (for example Docker is
   * unreachable). Such a snapshot is never compared against the previous one,
   * so a lost Docker connection does not look like mining stopping.
   */
  unavailable?: boolean;
  running: boolean;
  poolName: string | null;
  /** `mode:pool` the best-difficulty record belongs to; null while the pool is unknown. */
  recordKey?: string | null;
  /**
   * Ids of the running containers. SV2 UI recreates them on every start, so a
   * different value between two checks means the stack restarted in between.
   */
  stackId?: string | null;
  /** Docker could not be reached; mining status is unknown. */
  dockerUnreachable?: boolean;
  activePoolIndex: number | null;
  hashrate: number | null;
  workers: number | null;
  /** Names of the connected workers, one per worker; null when unknown. */
  workerNames?: string[] | null;
  sharesSubmitted: number | null;
  sharesAccepted: number | null;
  sharesRejected: number | null;
  channels: TelegramMiningChannel[] | null;
};

type MonitoringPage<T> = {
  items: T[];
  total: number;
};

/**
 * Collect every item of a paginated monitoring endpoint.
 *
 * The monitoring API is not trusted to terminate the loop on its own: a
 * missing or non-numeric total, a huge total, or an endpoint that ignores the
 * offset must not keep the background monitor fetching forever. Collection
 * stops on a short or empty page, and gives up (returns null, i.e. "unknown")
 * once more than `maxItems` items have been seen.
 */
/**
 * Item allowance shared by every paginated read of one activity snapshot, so
 * the per-endpoint cap cannot be multiplied by the number of JD clients.
 */
export type MonitoringBudget = { remainingItems: number };

export async function collectPaginatedMonitoringItems<T>(
  fetchPage: (offset: number, limit: number) => Promise<MonitoringPage<T> | null>,
  pageSize = 100,
  maxItems = MAX_MONITORING_ITEMS,
  budget?: MonitoringBudget,
): Promise<T[] | null> {
  if (!Number.isInteger(pageSize) || pageSize <= 0) {
    throw new RangeError('Monitoring page size must be a positive integer');
  }

  const items: T[] = [];
  let offset = 0;

  while (true) {
    const page = await fetchPage(offset, pageSize);
    if (
      !page ||
      !Array.isArray(page.items) ||
      !Number.isSafeInteger(page.total) ||
      page.total < 0
    ) {
      return null;
    }

    items.push(...page.items);
    if (items.length > maxItems) return null;
    if (budget) {
      budget.remainingItems -= page.items.length;
      if (budget.remainingItems < 0) return null;
    }

    if (
      page.items.length === 0 ||
      page.items.length < pageSize ||
      offset + pageSize >= page.total
    ) {
      return items;
    }
    offset += pageSize;
  }
}

/**
 * Map with a fixed number of concurrent workers, preserving input order.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  const worker = async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index]);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(Math.max(1, concurrency), items.length) }, worker),
  );
  return results;
}

/**
 * Worker names come from mining devices (SV1 authorize / SV2 open-channel)
 * and are untrusted. Strip control, line-break and bidi-override characters so
 * a crafted name cannot fake extra lines of an alert, and cap the length.
 */
export function formatWorkerName(name: string): string {
  return toSingleLine(name, MAX_WORKER_NAME_LENGTH) || 'unnamed';
}

/**
 * Pool names come from the operator's own configuration, so they are trusted,
 * but they get the same single-line treatment for consistency.
 */
export function formatPoolName(name: string): string {
  return toSingleLine(name, MAX_POOL_NAME_LENGTH) || 'Unnamed pool';
}

function toSingleLine(text: string, maxLength: number): string {
  const cleaned = text
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const characters = Array.from(cleaned);
  return characters.length > maxLength
    ? `${characters.slice(0, maxLength - 1).join('')}…`
    : cleaned;
}

function truncateMessage(text: string): string {
  return text.length > MAX_TELEGRAM_MESSAGE_LENGTH
    ? `${text.slice(0, MAX_TELEGRAM_MESSAGE_LENGTH - 1)}…`
    : text;
}

/**
 * Workers the same way the dashboard counts them: SV1 miners on the
 * translator, plus in JD mode the channels of SV2 miners connected straight to
 * JDC. JDC's own count would show the translator as one worker.
 */
export function getTelegramWorkerCount(
  isJdMode: boolean,
  sv1Miners: number | null | undefined,
  directSv2Channels: number | null,
): number | null {
  if (typeof sv1Miners !== 'number') return null;
  if (!isJdMode) return sv1Miners;
  return directSv2Channels === null ? null : sv1Miners + directSv2Channels;
}

/**
 * Translator channel ids used by exactly one SV1 miner. Only those channels
 * belong to a single worker: with aggregation the miners get local channel ids
 * and none of them matches the shared upstream channel.
 */
export function getSingleMinerChannelIds(
  sv1Clients: ReadonlyArray<{ channel_id?: unknown }>,
): Set<number> {
  const counts = new Map<number, number>();
  for (const client of sv1Clients) {
    const channelId = isObject(client) ? client.channel_id : undefined;
    if (typeof channelId === 'number') counts.set(channelId, (counts.get(channelId) ?? 0) + 1);
  }
  return new Set([...counts].filter(([, count]) => count === 1).map(([channelId]) => channelId));
}

/**
 * Validates one monitoring channel. `named` says whether the channel belongs
 * to a single miner; otherwise alerts leave the worker out.
 */
export function toTelegramMiningChannel(
  keyPrefix: string,
  kind: 'extended' | 'standard',
  channel: unknown,
  named: boolean,
): TelegramMiningChannel | null {
  if (
    !isObject(channel) ||
    !Number.isSafeInteger(channel.channel_id) ||
    typeof channel.user_identity !== 'string' ||
    !Number.isSafeInteger(channel.blocks_found) ||
    typeof channel.best_diff !== 'number' ||
    !Number.isFinite(channel.best_diff)
  ) {
    return null;
  }

  return {
    key: `${keyPrefix}:${kind}:${channel.channel_id}:${channel.user_identity}`,
    userIdentity: named ? channel.user_identity : null,
    blocksFound: channel.blocks_found as number,
    bestDifficulty: channel.best_diff,
  };
}

export class TelegramConfigError extends Error {}

/**
 * A failed Telegram Bot API call. `statusCode` is the status this backend
 * returns to the browser, never Telegram's own status: a 401 from our API means
 * "session expired" to the UI, so an upstream 401 (revoked bot token) must not
 * be forwarded as-is.
 */
export type TelegramFailureReason =
  | 'invalid-token'
  | 'conflict'
  | 'blocked'
  | 'rate-limited'
  | 'rejected'
  | 'upstream'
  | 'unreachable';

export class TelegramApiError extends Error {
  constructor(
    message: string,
    readonly statusCode: 400 | 409 | 429 | 502,
    /**
     * Telegram's own description, cleaned to a single short line. For server
     * logs only; it is third-party text and is never sent to the browser.
     */
    readonly detail: string | null = null,
    readonly reason: TelegramFailureReason = 'upstream',
  ) {
    super(message);
  }
}

export function toTelegramApiError(
  upstreamStatus: number,
  description: string | undefined,
): TelegramApiError {
  // Telegram answers 401 for a revoked token and 404 for an unknown one.
  if (upstreamStatus === 401 || upstreamStatus === 404) {
    return new TelegramApiError(
      'Telegram rejected the bot token. Check it with @BotFather and connect the bot again.',
      400,
      description ? toSingleLine(description, 200) || null : null,
      'invalid-token',
    );
  }

  // getUpdates conflicts with a webhook or with another app polling the same bot.
  if (upstreamStatus === 409) {
    return new TelegramApiError(
      'This bot is already in use elsewhere (a webhook or another app is reading its updates). Use a dedicated bot for SV2 UI.',
      409,
      description ? toSingleLine(description, 200) || null : null,
      'conflict',
    );
  }

  const detail = description ? toSingleLine(description, 200) || null : null;

  if (upstreamStatus === 429) {
    return new TelegramApiError('Telegram is rate limiting this bot. Try again shortly.', 429, detail, 'rate-limited');
  }

  // The user blocked the bot or deleted the chat. Retrying cannot help.
  if (upstreamStatus === 403) {
    return new TelegramApiError(
      'Telegram refused to deliver the message. Unblock the bot or press Start in its chat.',
      400,
      detail,
      'blocked',
    );
  }

  // The request itself was invalid (for example a message Telegram will not
  // accept). Use a fixed message rather than showing Telegram's text verbatim.
  if (upstreamStatus === 400) {
    return new TelegramApiError('Telegram rejected the request.', 400, detail, 'rejected');
  }

  return new TelegramApiError('Telegram returned an error. Try again shortly.', 502, detail);
}

const ALERT_SETTING_KEYS = [
  'notifyOnBlockFound',
  'notifyOnBestDifficulty',
  'notifyOnPoolChange',
  'notifyOnStatusChange',
  'notifyOnWorkerChange',
  'notifyOnRejectedShares',
] as const;

const DEFAULT_ALERT_SETTINGS: TelegramAlertSettings = {
  enabled: true,
  notifyOnBlockFound: true,
  notifyOnBestDifficulty: true,
  notifyOnPoolChange: true,
  notifyOnStatusChange: false,
  notifyOnWorkerChange: false,
  notifyOnRejectedShares: false,
  summaryIntervalMinutes: 0,
};

function getEmptySettings(): TelegramSettings {
  return {
    connected: false,
    paired: false,
    botUsername: null,
    botName: null,
    recipient: null,
    pairingUrl: null,
    deliveryError: null,
    ...DEFAULT_ALERT_SETTINGS,
    enabled: false,
  };
}

function toPublicSettings(
  settings: SavedTelegramSettings | null,
  deliveryError: string | null = null,
): TelegramSettings {
  if (!settings) return getEmptySettings();

  return {
    deliveryError,
    connected: true,
    paired: settings.chatId !== null,
    botUsername: settings.botUsername,
    botName: settings.botName,
    recipient: settings.recipient,
    pairingUrl: settings.pairingCode
      ? `https://t.me/${settings.botUsername}?start=${settings.pairingCode}`
      : null,
    enabled: settings.enabled,
    notifyOnBlockFound: settings.notifyOnBlockFound,
    notifyOnBestDifficulty: settings.notifyOnBestDifficulty,
    notifyOnPoolChange: settings.notifyOnPoolChange,
    notifyOnStatusChange: settings.notifyOnStatusChange,
    notifyOnWorkerChange: settings.notifyOnWorkerChange,
    notifyOnRejectedShares: settings.notifyOnRejectedShares,
    summaryIntervalMinutes: settings.summaryIntervalMinutes,
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasConnectionFields(settings: Record<string, unknown>): boolean {
  return typeof settings.botToken === 'string' &&
    BOT_TOKEN_PATTERN.test(settings.botToken) &&
    typeof settings.botUsername === 'string' &&
    BOT_USERNAME_PATTERN.test(settings.botUsername) &&
    typeof settings.botName === 'string' &&
    (settings.pairingCode === null || typeof settings.pairingCode === 'string') &&
    (settings.chatId === null || typeof settings.chatId === 'number') &&
    (settings.recipient === null || typeof settings.recipient === 'string') &&
    typeof settings.enabled === 'boolean' &&
    typeof settings.notifyOnStatusChange === 'boolean' &&
    Number.isInteger(settings.summaryIntervalMinutes);
}

function parseSavedSettings(value: unknown): SavedTelegramSettings | null {
  if (!isObject(value) || !hasConnectionFields(value)) return null;

  if (value.version === 1) {
    const legacy = value as LegacySavedTelegramSettings;
    return {
      ...legacy,
      version: 2,
      notifyOnBlockFound: true,
      notifyOnBestDifficulty: true,
      notifyOnPoolChange: true,
      notifyOnWorkerChange: false,
      notifyOnRejectedShares: false,
      lastUpdateId: null,
    };
  }

  if (
    value.version !== 2 ||
    typeof value.notifyOnBlockFound !== 'boolean' ||
    typeof value.notifyOnBestDifficulty !== 'boolean' ||
    typeof value.notifyOnPoolChange !== 'boolean' ||
    typeof value.notifyOnWorkerChange !== 'boolean' ||
    typeof value.notifyOnRejectedShares !== 'boolean' ||
    (value.lastUpdateId !== null && !Number.isInteger(value.lastUpdateId))
  ) {
    return null;
  }

  // Records are only a convenience: drop malformed entries instead of
  // rejecting the whole file.
  const records = Array.isArray(value.bestDifficultyRecords)
    ? value.bestDifficultyRecords.filter((entry): entry is [string, number] =>
      Array.isArray(entry) &&
      typeof entry[0] === 'string' &&
      typeof entry[1] === 'number' &&
      Number.isFinite(entry[1]) &&
      entry[1] >= 0
    ).slice(-MAX_BEST_DIFFICULTY_RECORDS)
    : [];

  return { ...(value as SavedTelegramSettings), bestDifficultyRecords: records };
}

function getRecipientLabel(chat: TelegramChat): string {
  if (chat.username) return `@${chat.username}`;
  if (chat.title) return chat.title;

  const name = [chat.first_name, chat.last_name].filter(Boolean).join(' ').trim();
  return name || 'Telegram chat';
}

function getStartParameter(text: string | undefined): string | null {
  if (!text) return null;
  const match = text.trim().match(/^\/start(?:@[A-Za-z0-9_]+)?\s+([A-Za-z0-9_-]+)$/);
  return match?.[1] ?? null;
}

function getCommand(text: string | undefined): string | null {
  if (!text) return null;
  const match = text.trim().match(/^\/([a-z]+)(?:@[A-Za-z0-9_]+)?(?:\s|$)/i);
  return match?.[1]?.toLowerCase() ?? null;
}

function formatHashrate(hashrate: number | null): string | null {
  if (hashrate === null || !Number.isFinite(hashrate)) return null;

  const units = ['H/s', 'kH/s', 'MH/s', 'GH/s', 'TH/s', 'PH/s', 'EH/s'];
  let value = Math.max(0, hashrate);
  let unitIndex = 0;

  while (value >= 1000 && unitIndex < units.length - 1) {
    value /= 1000;
    unitIndex += 1;
  }

  const decimals = value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(decimals)} ${units[unitIndex]}`;
}

function formatDifficulty(difficulty: number): string {
  if (!Number.isFinite(difficulty)) return 'Unknown';
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: difficulty >= 100 ? 0 : 2,
  }).format(difficulty);
}

function formatPoolPriority(index: number): string {
  return index === 0 ? 'Primary' : `Fallback ${index}`;
}

function getBestChannel(channels: TelegramMiningChannel[] | null): TelegramMiningChannel | null {
  if (!channels?.length) return null;
  return channels.reduce((best, channel) =>
    channel.bestDifficulty > best.bestDifficulty ? channel : best
  );
}

export function formatTelegramStatus(
  snapshot: TelegramActivitySnapshot,
  heading = '⛏ SV2 mining status'
): string {
  const lines = [
    heading,
    `Status: ${snapshot.unavailable ? 'Unknown (mining status could not be read)' : snapshot.running ? 'Running' : 'Stopped'}`,
  ];

  if (snapshot.poolName) lines.push(`Pool: ${formatPoolName(snapshot.poolName)}`);

  const hashrate = formatHashrate(snapshot.hashrate);
  if (hashrate) lines.push(`Hashrate: ${hashrate}`);
  if (snapshot.workers !== null) lines.push(`Workers: ${snapshot.workers.toLocaleString()}`);

  if (snapshot.sharesSubmitted !== null) {
    const shareParts = [`${snapshot.sharesSubmitted.toLocaleString()} submitted`];
    if (snapshot.sharesAccepted !== null) {
      shareParts.push(`${snapshot.sharesAccepted.toLocaleString()} accepted`);
    }
    if (snapshot.sharesRejected !== null) {
      shareParts.push(`${snapshot.sharesRejected.toLocaleString()} rejected`);
    }
    lines.push(`Shares: ${shareParts.join(' · ')}`);
  }

  if (snapshot.channels) {
    const blocksFound = snapshot.channels.reduce(
      (total, channel) => total + channel.blocksFound,
      0
    );
    const bestChannel = getBestChannel(snapshot.channels);
    lines.push(`Blocks found: ${blocksFound.toLocaleString()}`);
    if (bestChannel) {
      lines.push(`Best difficulty: ${formatDifficulty(bestChannel.bestDifficulty)}`);
    }
  }

  return lines.join('\n');
}

/** `names` without one occurrence of each name in `remove`. */
function subtractWorkerNames(names: string[], remove: string[]): string[] {
  const toRemove = new Map<string, number>();
  for (const name of remove) toRemove.set(name, (toRemove.get(name) ?? 0) + 1);
  return names.filter((name) => {
    const count = toRemove.get(name) ?? 0;
    if (count === 0) return true;
    toRemove.set(name, count - 1);
    return false;
  });
}

function listWorkers(names: string[]): string[] {
  if (names.length === 1) return [`Worker: ${formatWorkerName(names[0])}`];
  const lines = names.slice(0, MAX_LISTED_WORKERS).map((name) => `• ${formatWorkerName(name)}`);
  if (names.length > MAX_LISTED_WORKERS) {
    lines.push(`…and ${(names.length - MAX_LISTED_WORKERS).toLocaleString()} more`);
  }
  return lines;
}

/**
 * Names the workers that connected or disconnected since the last check.
 * Falls back to the totals when the names are not known.
 */
function getWorkerChangeMessages(
  previous: TelegramActivitySnapshot,
  current: TelegramActivitySnapshot,
): string[] {
  if (previous.workers === null || current.workers === null) return [];
  const total = `Connected workers: ${current.workers.toLocaleString()}`;

  if (!previous.workerNames || !current.workerNames) {
    if (previous.workers === current.workers) return [];
    let title = current.workers > previous.workers ? '🟢 Worker connected' : '🟠 Worker disconnected';
    if (current.workers === 0) title = '🔴 All workers disconnected';
    else if (previous.workers === 0) title = '🟢 Workers back online';
    return [[title, total].join('\n')];
  }

  const messages: string[] = [];
  const disconnected = subtractWorkerNames(previous.workerNames, current.workerNames);
  const connected = subtractWorkerNames(current.workerNames, previous.workerNames);

  if (disconnected.length > 0) {
    let title = disconnected.length === 1
      ? '🟠 Worker disconnected'
      : `🟠 ${disconnected.length.toLocaleString()} workers disconnected`;
    if (current.workers === 0) title = '🔴 All workers disconnected';
    messages.push([title, ...listWorkers(disconnected), total].join('\n'));
  }
  if (connected.length > 0) {
    let title = connected.length === 1
      ? '🟢 Worker connected'
      : `🟢 ${connected.length.toLocaleString()} workers connected`;
    if (previous.workers === 0) title = '🟢 Workers back online';
    messages.push([title, ...listWorkers(connected), total].join('\n'));
  }
  return messages;
}

function getMiningStatusChangeMessage(
  previous: TelegramActivitySnapshot,
  current: TelegramActivitySnapshot
): string | null {
  if (!previous.running && current.running) {
    return formatTelegramStatus(current, '🟢 SV2 mining started');
  }
  if (previous.running && !current.running) {
    return formatTelegramStatus(current, '🔴 SV2 mining stopped');
  }
  if (
    previous.running &&
    current.running &&
    previous.stackId &&
    current.stackId &&
    previous.stackId !== current.stackId
  ) {
    return formatTelegramStatus(current, '🔄 SV2 mining restarted');
  }
  return null;
}

function getBlockFoundMessages(
  previous: TelegramActivitySnapshot,
  current: TelegramActivitySnapshot
): string[] {
  if (!previous.channels || !current.channels) return [];

  const previousByKey = new Map(previous.channels.map((channel) => [channel.key, channel]));
  return current.channels.flatMap((channel) => {
    const before = previousByKey.get(channel.key);
    if (!before || channel.blocksFound <= before.blocksFound) return [];

    const delta = channel.blocksFound - before.blocksFound;
    const lines = ['🎉 Block found!'];
    if (current.poolName) lines.push(`Pool: ${formatPoolName(current.poolName)}`);
    if (channel.userIdentity !== null) {
      lines.push(`Worker: ${formatWorkerName(channel.userIdentity)}`);
    }
    lines.push(
      delta === 1
        ? `Channel total: ${channel.blocksFound.toLocaleString()}`
        : `New blocks: ${delta.toLocaleString()} · Channel total: ${channel.blocksFound.toLocaleString()}`
    );
    lines.push(`Best difficulty: ${formatDifficulty(channel.bestDifficulty)}`);
    return [lines.join('\n')];
  });
}

function getBestDifficultyMessage(
  previous: TelegramActivitySnapshot,
  current: TelegramActivitySnapshot,
  record: number
): string | null {
  if (!previous.channels || !current.channels) return null;

  // A channel must have improved since the last check (a new channel counts
  // from 0) and beaten the pool's record. The first condition keeps a value
  // reached on another pool from being announced after a failover back.
  const previousByKey = new Map(previous.channels.map((channel) => [channel.key, channel]));
  const improved = current.channels
    .filter((channel) =>
      channel.bestDifficulty > (previousByKey.get(channel.key)?.bestDifficulty ?? 0) &&
      channel.bestDifficulty > record
    )
    .sort((left, right) => right.bestDifficulty - left.bestDifficulty)[0];

  if (!improved) return null;

  const lines = ['🏆 New best difficulty!'];
  if (current.poolName) lines.push(`Pool: ${formatPoolName(current.poolName)}`);
  if (improved.userIdentity !== null) {
    lines.push(`Worker: ${formatWorkerName(improved.userIdentity)}`);
  }
  lines.push(`Difficulty: ${formatDifficulty(improved.bestDifficulty)}`);
  lines.push(`Previous best: ${formatDifficulty(record)}`);
  return lines.join('\n');
}

function getSettingsMessage(settings: SavedTelegramSettings): string {
  return [
    '⚙️ SV2 Telegram alerts',
    '',
    'Tap a button to toggle an alert. Critical defaults are block found, new best difficulty, and pool failover.',
    '',
    `Notifications: ${settings.enabled ? 'ON' : 'OFF'}`,
    `Summary: ${formatSummaryInterval(settings.summaryIntervalMinutes)}`,
  ].join('\n');
}

function toggleButton(enabled: boolean, label: string, callbackData: string) {
  return {
    text: `${enabled ? '✅' : '⬜'} ${label}`,
    callback_data: callbackData,
  };
}

function getSettingsKeyboard(settings: SavedTelegramSettings) {
  return {
    inline_keyboard: [
      [toggleButton(settings.enabled, 'Notifications', 'sv2:toggle:enabled')],
      [
        toggleButton(settings.notifyOnBlockFound, 'Block found', 'sv2:toggle:block'),
        toggleButton(settings.notifyOnBestDifficulty, 'Best difficulty', 'sv2:toggle:best'),
      ],
      [toggleButton(settings.notifyOnPoolChange, 'Pool failover', 'sv2:toggle:pool')],
      [
        toggleButton(settings.notifyOnStatusChange, 'Mining status', 'sv2:toggle:status'),
        toggleButton(settings.notifyOnWorkerChange, 'Workers', 'sv2:toggle:workers'),
      ],
      [toggleButton(settings.notifyOnRejectedShares, 'Rejected shares', 'sv2:toggle:rejected')],
      [{
        text: `⏱ Summary: ${formatSummaryInterval(settings.summaryIntervalMinutes)}`,
        callback_data: 'sv2:toggle:summary',
      }],
    ],
  };
}

function getHelpMessage(): string {
  return [
    '⛏ SV2 UI Telegram bot',
    '',
    '/settings — choose alerts',
    '/status — current mining status',
    '/help — show these commands',
  ].join('\n');
}

function isSummaryInterval(value: unknown): value is number {
  return (TELEGRAM_SUMMARY_INTERVALS as readonly unknown[]).includes(value);
}

function cycleSummaryInterval(current: number): number {
  const currentIndex = TELEGRAM_SUMMARY_INTERVALS.indexOf(
    current as typeof TELEGRAM_SUMMARY_INTERVALS[number]
  );
  return TELEGRAM_SUMMARY_INTERVALS[
    currentIndex === -1 ? 0 : (currentIndex + 1) % TELEGRAM_SUMMARY_INTERVALS.length
  ];
}

/**
 * Read the settings file without following a symlink. O_NONBLOCK keeps a
 * planted FIFO from wedging a threadpool worker, and the fstat rejects every
 * non-regular file before a byte is read (same approach as state.ts and
 * auth-store.ts).
 */
async function readSettingsFile(filePath: string): Promise<string> {
  const handle = await fs.open(
    filePath,
    fs.constants.O_RDONLY | fs.constants.O_NONBLOCK | fs.constants.O_NOFOLLOW,
  );
  try {
    const stat = await handle.stat();
    if (!stat.isFile()) {
      throw new TelegramConfigError('Stored Telegram settings are not a regular file');
    }
    return await handle.readFile('utf8');
  } finally {
    await handle.close();
  }
}

type TelegramServiceOptions = {
  /**
   * Minimum time between mining activity snapshots used for alerts. Bot
   * commands and button taps are still handled on every poll; only the
   * comparatively expensive Docker and monitoring API reads are throttled.
   */
  activityIntervalMs?: number;
  /** Clock, injectable for tests. */
  now?: () => number;
};

// After Telegram rejects the token or reports another app using the bot,
// retry this rarely instead of every poll.
const PERSISTENT_FAILURE_RETRY_MS = 5 * 60_000;
// Brief network blips are normal; only report Telegram as unreachable when it
// has been for this long.
const UNREACHABLE_REPORT_AFTER_MS = 2 * 60_000;

type DeliveryIssue = {
  reason: TelegramFailureReason;
  since: number;
  retryAt: number | null;
};

const DELIVERY_ISSUE_LOG: Partial<Record<TelegramFailureReason, string>> = {
  'invalid-token': 'Telegram rejected the bot token; alerts are paused until the bot is reconnected.',
  conflict: 'Another app is reading this bot\'s updates; alerts are paused.',
  blocked: 'Telegram refused to deliver alerts; the bot may be blocked in its chat.',
  unreachable: 'Telegram is unreachable; alerts are queued and will be retried.',
};

export class TelegramService {
  private settings: SavedTelegramSettings | null = null;
  private initialized = false;
  /**
   * Bumped whenever the bot or the paired chat changes (connect, pair,
   * disconnect). Work that awaited the network re-checks it before writing
   * settings back, so a slow request can never resurrect a bot the operator
   * disconnected in the meantime.
   */
  private generation = 0;
  /** Serializes every settings file write and delete, in call order. */
  private persistChain: Promise<void> = Promise.resolve();
  private previousSnapshot: TelegramActivitySnapshot | null = null;
  private channelBaselines = new Map<string, TelegramMiningChannel>();
  private lastSummaryAt: number | null = null;
  private lastKnownPool: { name: string; index: number; stackId: string | null } | null = null;
  private dockerUnreachableReported = false;
  private lastActivityCheckAt: number | null = null;
  /** Alerts not yet delivered, oldest first. */
  private outbox: string[] = [];
  /** getUpdates offset used while scanning for the pairing /start message. */
  private pairingOffset: number | null = null;
  private deliveryIssue: DeliveryIssue | null = null;
  private pollInProgress = false;
  private readonly activityIntervalMs: number;
  private readonly now: () => number;

  constructor(
    private readonly settingsFile: string,
    private readonly fetchImplementation: FetchImplementation = fetch,
    options: TelegramServiceOptions = {},
  ) {
    this.activityIntervalMs = options.activityIntervalMs ?? 0;
    this.now = options.now ?? Date.now;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      const raw = await readSettingsFile(this.settingsFile);
      const parsed = parseSavedSettings(JSON.parse(raw) as unknown);
      if (!parsed) {
        throw new TelegramConfigError('Stored Telegram settings are invalid');
      }
      // Older files could hold any number of minutes; fall back to off.
      if (!isSummaryInterval(parsed.summaryIntervalMinutes)) parsed.summaryIntervalMinutes = 0;
      this.settings = parsed;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') {
        // Fixed message only: a JSON.parse error message can quote part of
        // the file, which contains the bot token.
        console.warn(
          `Telegram settings at ${this.settingsFile} could not be loaded; Telegram alerts are disabled until the bot is connected again.`
        );
      }
      this.settings = null;
    }

    this.initialized = true;
  }

  async getSettings(): Promise<TelegramSettings> {
    await this.initialize();
    await this.renewExpiredPairingCode();
    return this.publicSettings();
  }

  async connectBot(botToken: string): Promise<TelegramSettings> {
    await this.initialize();
    const token = botToken.trim();

    if (!BOT_TOKEN_PATTERN.test(token)) {
      throw new TelegramConfigError(
        'Enter a valid Telegram bot token (it looks like 123456789:ABC-DEF...)'
      );
    }

    const bot = await this.callApi<TelegramBot>(token, 'getMe');
    if (!bot.is_bot || !bot.username || !BOT_USERNAME_PATTERN.test(bot.username)) {
      throw new TelegramConfigError('Telegram did not return a usable bot username');
    }

    this.replaceConnection({
      version: 2,
      botToken: token,
      botUsername: bot.username,
      botName: bot.first_name,
      ...this.newPairingCode(),
      chatId: null,
      recipient: null,
      lastUpdateId: null,
      ...DEFAULT_ALERT_SETTINGS,
      enabled: false,
    });
    await this.persist();
    return this.publicSettings();
  }

  async pairChat(): Promise<TelegramSettings> {
    await this.initialize();
    await this.renewExpiredPairingCode();
    const settings = this.requireConnected();
    const generation = this.generation;

    if (settings.chatId !== null) {
      return this.publicSettings();
    }
    if (!settings.pairingCode) {
      throw new TelegramConfigError('Create a new Telegram pairing link first');
    }

    // Scan forward through pending updates. Unlike a negative offset (which
    // only sees the newest 100 updates), this cannot be defeated by someone
    // flooding the bot after the operator pressed Start. Updates of an unpaired
    // bot are of no further use, so confirming them is harmless.
    let matchingUpdate: TelegramUpdate | undefined;
    let lastSeenUpdateId: number | null = null;
    // Opening the bot from search or BotFather sends /start without the code.
    let sawStartWithoutCode = false;

    for (let batch = 0; batch < MAX_PAIRING_UPDATE_BATCHES && !matchingUpdate; batch += 1) {
      const updates = await this.callApi<TelegramUpdate[]>(
        settings.botToken,
        'getUpdates',
        {
          offset: this.pairingOffset ?? 0,
          limit: 100,
          timeout: 0,
          allowed_updates: ['message'],
        }
      );
      this.assertGeneration(generation);
      if (!Array.isArray(updates) || updates.length === 0) break;

      for (const update of updates) {
        lastSeenUpdateId = Math.max(lastSeenUpdateId ?? update.update_id, update.update_id);
        if (update.message?.chat.type !== 'private') continue;
        const startCode = getStartParameter(update.message.text);
        if (!matchingUpdate && startCode === settings.pairingCode) {
          matchingUpdate = update;
        } else if (startCode === null && getCommand(update.message.text) === 'start') {
          sawStartWithoutCode = true;
        }
      }
      this.pairingOffset = lastSeenUpdateId === null ? null : lastSeenUpdateId + 1;
    }

    const chat = matchingUpdate?.message?.chat;
    if (!chat) {
      throw new TelegramConfigError(
        sawStartWithoutCode
          ? `@${settings.botUsername} got /start without the pairing code. Use the Open Telegram button here, press Start, then check again.`
          : `No /start from the pairing link yet. Use the Open Telegram button here, press Start, then check again.`
      );
    }

    await this.sendMessage(
      settings.botToken,
      chat.id,
      [
        '✅ SV2 UI is linked.',
        '',
        'Block found, new best difficulty, and pool failover alerts are enabled.',
        'Use /settings to configure alerts or /status for a live summary.',
      ].join('\n')
    );
    this.assertGeneration(generation);

    this.replaceConnection({
      ...settings,
      pairingCode: null,
      pairingCodeExpiresAt: null,
      chatId: chat.id,
      recipient: getRecipientLabel(chat),
      lastUpdateId: lastSeenUpdateId,
      ...DEFAULT_ALERT_SETTINGS,
    });
    await this.persist();
    return this.publicSettings();
  }

  async updateSettings(update: TelegramSettingsUpdate): Promise<TelegramSettings> {
    await this.initialize();
    const settings = this.requirePaired();
    // Every provided setting must have the right type; null is not
    // "unchanged". Unknown keys are ignored (only known settings are copied).
    const provided = update as Record<string, unknown>;
    for (const key of [...ALERT_SETTING_KEYS, 'enabled'] as const) {
      if (provided[key] !== undefined && typeof provided[key] !== 'boolean') {
        throw new TelegramConfigError('Notification settings must be true or false');
      }
    }
    if (
      provided.summaryIntervalMinutes !== undefined &&
      !isSummaryInterval(provided.summaryIntervalMinutes)
    ) {
      throw new TelegramConfigError('Choose one of the summary options');
    }
    const next = {
      ...settings,
      enabled: update.enabled ?? settings.enabled,
      notifyOnBlockFound: update.notifyOnBlockFound ?? settings.notifyOnBlockFound,
      notifyOnBestDifficulty:
        update.notifyOnBestDifficulty ?? settings.notifyOnBestDifficulty,
      notifyOnPoolChange: update.notifyOnPoolChange ?? settings.notifyOnPoolChange,
      notifyOnStatusChange: update.notifyOnStatusChange ?? settings.notifyOnStatusChange,
      notifyOnWorkerChange: update.notifyOnWorkerChange ?? settings.notifyOnWorkerChange,
      notifyOnRejectedShares:
        update.notifyOnRejectedShares ?? settings.notifyOnRejectedShares,
      summaryIntervalMinutes:
        update.summaryIntervalMinutes ?? settings.summaryIntervalMinutes,
    };

    const booleanKeys = [
      'enabled',
      'notifyOnBlockFound',
      'notifyOnBestDifficulty',
      'notifyOnPoolChange',
      'notifyOnStatusChange',
      'notifyOnWorkerChange',
      'notifyOnRejectedShares',
    ] as const;
    if (booleanKeys.some((key) => typeof next[key] !== 'boolean')) {
      throw new TelegramConfigError('Notification settings must be true or false');
    }

    this.settings = next;
    await this.persist();
    return this.publicSettings();
  }

  async sendTestMessage(): Promise<void> {
    await this.initialize();
    const settings = this.requirePaired();
    try {
      await this.sendMessage(
        settings.botToken,
        settings.chatId,
        '✅ SV2 UI Telegram notifications are working.'
      );
      this.recordDeliverySuccess('send');
    } catch (error) {
      this.recordDeliveryFailure(error);
      throw error;
    }
  }

  async disconnect(): Promise<TelegramSettings> {
    await this.initialize();
    this.replaceConnection(null);
    // Queued behind any in-flight write, so the delete always lands last.
    await this.persist();
    return getEmptySettings();
  }

  /**
   * SV2 UI stops mining when it shuts down, after its checks have stopped, so
   * the stop would never be reported. Sent only if mining was running at the
   * last check.
   */
  async notifyShutdown(): Promise<void> {
    await this.initialize();
    const settings = this.settings;
    if (
      !settings ||
      settings.chatId === null ||
      !settings.enabled ||
      !settings.notifyOnStatusChange ||
      !this.previousSnapshot?.running
    ) {
      return;
    }
    await this.sendMessage(settings.botToken, settings.chatId, SHUTDOWN_MESSAGE);
  }

  async poll(snapshotProvider: () => Promise<TelegramActivitySnapshot>): Promise<void> {
    await this.initialize();
    if (this.pollInProgress) return;

    const initialSettings = this.settings;
    if (!initialSettings || initialSettings.chatId === null) {
      this.resetMonitorState();
      return;
    }

    const retryAt = this.deliveryIssue?.retryAt;
    if (retryAt !== null && retryAt !== undefined && this.now() < retryAt) return;

    this.pollInProgress = true;
    const generation = this.generation;
    let snapshotPromise: Promise<TelegramActivitySnapshot> | null = null;
    const getSnapshot = () => {
      snapshotPromise ??= snapshotProvider();
      return snapshotPromise;
    };

    try {
      await this.processBotUpdates(
        initialSettings as SavedTelegramSettings & { chatId: number },
        generation,
        getSnapshot
      );
      if (this.generation !== generation) return;

      const settings = this.requirePaired();
      if (!settings.enabled) {
        this.outbox = [];
        this.resetMonitorState();
        return;
      }

      // Deliver alerts left over from an earlier poll first, oldest first.
      await this.flushOutbox(settings);

      const now = this.now();
      if (
        this.lastActivityCheckAt !== null &&
        now - this.lastActivityCheckAt < this.activityIntervalMs
      ) {
        return;
      }
      this.lastActivityCheckAt = now;

      const current = await getSnapshot();
      if (this.generation !== generation) return;

      // Losing Docker is reported once, and its return once. Mining status is
      // unknown meanwhile, so the previous state is kept for the comparison
      // after it comes back.
      const dockerUnreachable = current.dockerUnreachable === true;
      if (dockerUnreachable !== this.dockerUnreachableReported) {
        this.dockerUnreachableReported = dockerUnreachable;
        if (settings.notifyOnStatusChange) {
          this.enqueue([dockerUnreachable
            ? '⚠️ SV2 UI can\'t reach Docker\nMining status is unknown until it\'s back.'
            : '✅ SV2 UI can reach Docker again']);
          await this.flushOutbox(settings);
        }
      }

      // Without a trustworthy status there is nothing to compare. Keep the
      // previous baseline so the next good snapshot is compared against it.
      if (current.unavailable) return;

      if (!this.previousSnapshot) {
        this.previousSnapshot = current;
        this.updateChannelBaselines(current.channels);
        this.updateLastKnownPool(current);
        this.lastSummaryAt = now;
        if (this.raiseBestDifficultyRecord(current)) await this.persist();
        return;
      }

      const messages = this.collectAlerts(settings, this.previousSnapshot, current);
      const summaryDue = settings.summaryIntervalMinutes > 0 &&
        this.lastSummaryAt !== null &&
        now - this.lastSummaryAt >= settings.summaryIntervalMinutes * 60_000;

      // Only a summary restarts the summary timer, so alerts on a busy farm
      // cannot keep pushing it back.
      if (summaryDue) {
        messages.push(formatTelegramStatus(current));
        this.lastSummaryAt = now;
      }

      // The baseline always advances: alerts are queued in the outbox and
      // retried there, so a delivery problem can neither repeat an alert nor
      // block later ones.
      this.previousSnapshot = current.channels === null
        ? { ...current, channels: this.previousSnapshot.channels }
        : current;
      this.updateChannelBaselines(current.channels);
      this.updateLastKnownPool(current);
      const recordChanged = this.raiseBestDifficultyRecord(current);

      this.enqueue(messages);
      await this.flushOutbox(settings);
      // Saved after delivery so a disk error cannot cost this round's alerts.
      if (recordChanged) await this.persist();
    } catch (error) {
      // Telegram failures are tracked, shown in the UI and logged once per
      // change. Anything else is unexpected and is left to the caller.
      if (!(error instanceof TelegramApiError)) throw error;
      if (this.generation === generation) this.recordDeliveryFailure(error);
    } finally {
      this.pollInProgress = false;
    }
  }

  private collectAlerts(
    settings: SavedTelegramSettings,
    previous: TelegramActivitySnapshot,
    current: TelegramActivitySnapshot,
  ): string[] {
    const messages: string[] = [];
    const channelBaselineSnapshot = {
      ...previous,
      channels: [...this.channelBaselines.values()],
    };
    const blockMessages = settings.notifyOnBlockFound
      ? getBlockFoundMessages(channelBaselineSnapshot, current)
      : [];
    messages.push(...blockMessages);

    // No record yet means this pool is new to us: its current best becomes the
    // record silently, as on the dashboard. An unknown pool is never checked.
    const record = current.recordKey ? this.getBestDifficultyRecord(current.recordKey) : undefined;
    if (settings.notifyOnBestDifficulty && blockMessages.length === 0 && record !== undefined) {
      const bestDifficultyMessage = getBestDifficultyMessage(
        channelBaselineSnapshot,
        current,
        record,
      );
      if (bestDifficultyMessage) messages.push(bestDifficultyMessage);
    }

    const currentPool = current.poolName !== null && current.activePoolIndex !== null
      ? { name: current.poolName, index: current.activePoolIndex }
      : null;
    // Only the same running stack can fail over. A different pool after a
    // restart (a reconfigure, a new primary) is a restart, not a failover.
    if (
      settings.notifyOnPoolChange &&
      current.running &&
      this.lastKnownPool &&
      this.lastKnownPool.stackId === (current.stackId ?? null) &&
      currentPool &&
      (
        this.lastKnownPool.index !== currentPool.index ||
        this.lastKnownPool.name !== currentPool.name
      )
    ) {
      const duplicateName = this.lastKnownPool.name === currentPool.name;
      const previousLabel = duplicateName
        ? `${formatPoolName(this.lastKnownPool.name)} (${formatPoolPriority(this.lastKnownPool.index)})`
        : formatPoolName(this.lastKnownPool.name);
      const currentLabel = duplicateName
        ? `${formatPoolName(currentPool.name)} (${formatPoolPriority(currentPool.index)})`
        : formatPoolName(currentPool.name);
      messages.push([
        '🔁 Pool failover',
        `From: ${previousLabel}`,
        `To: ${currentLabel}`,
      ].join('\n'));
    }

    if (settings.notifyOnStatusChange) {
      const statusMessage = getMiningStatusChangeMessage(previous, current);
      if (statusMessage) messages.push(statusMessage);
    }

    // Every change is sent right away: a miner that keeps dropping is exactly
    // what this alert is for, and it can be turned off.
    if (settings.notifyOnWorkerChange) {
      messages.push(...getWorkerChangeMessages(previous, current));
    }

    // A lower count means the mining stack restarted, not fewer rejects.
    if (
      settings.notifyOnRejectedShares &&
      previous.sharesRejected !== null &&
      current.sharesRejected !== null &&
      current.sharesRejected > previous.sharesRejected
    ) {
      messages.push([
        '⚠️ Rejected shares increased',
        `New rejected shares: ${(current.sharesRejected - previous.sharesRejected).toLocaleString()}`,
        `Total rejected: ${current.sharesRejected.toLocaleString()}`,
      ].join('\n'));
    }

    return messages;
  }

  private enqueue(messages: string[]): void {
    this.outbox.push(...messages);
    if (this.outbox.length > MAX_PENDING_MESSAGES) {
      this.outbox.splice(0, this.outbox.length - MAX_PENDING_MESSAGES);
    }
  }

  /**
   * Send queued alerts one message each. A message Telegram rejects as invalid
   * (400) is dropped so it cannot block the queue; on a transient failure
   * (network, rate limit, server error) the rest stays queued for the next
   * poll.
   */
  private async flushOutbox(settings: SavedTelegramSettings & { chatId: number }): Promise<void> {
    while (this.outbox.length > 0) {
      const text = this.outbox[0];
      try {
        await this.sendMessage(settings.botToken, settings.chatId, text);
        this.outbox.shift();
        this.recordDeliverySuccess('send');
      } catch (error) {
        if (error instanceof TelegramApiError && error.reason === 'rejected') {
          console.warn(
            `Dropping a Telegram alert that Telegram rejected: ${error.detail ?? error.message}`
          );
          this.outbox.shift();
          continue;
        }
        if (error instanceof TelegramApiError && error.reason === 'blocked') {
          // Nothing can be delivered to this chat until the user unblocks the
          // bot, so drop what is queued rather than retrying it forever.
          this.outbox = [];
        }
        throw error;
      }
    }
  }

  private async processBotUpdates(
    settings: SavedTelegramSettings & { chatId: number },
    generation: number,
    getSnapshot: () => Promise<TelegramActivitySnapshot>
  ): Promise<void> {
    const updates = await this.callApi<TelegramUpdate[]>(
      settings.botToken,
      'getUpdates',
      {
        offset: settings.lastUpdateId === null ? 0 : settings.lastUpdateId + 1,
        limit: 100,
        timeout: 0,
        allowed_updates: ['message', 'callback_query'],
      }
    );
    if (this.generation === generation) this.recordDeliverySuccess('updates');
    if (this.generation !== generation || !Array.isArray(updates) || updates.length === 0) {
      return;
    }

    const sorted = [...updates].sort((left, right) => left.update_id - right.update_id);
    const fromPairedChat = (update: TelegramUpdate) => {
      const chat = update.message?.chat ?? update.callback_query?.message?.chat;
      return chat?.type === 'private' && chat.id === settings.chatId;
    };
    const actionable = sorted.filter(fromPairedChat);
    const lastUpdateId = sorted[sorted.length - 1].update_id;

    // Advance the offset once per batch. Passing it to the next getUpdates
    // call confirms these updates with Telegram, so messages from strangers
    // only need to be skipped in memory and never cause a disk write. When the
    // paired chat sent something, persist before acting on it so a crash
    // cannot replay a command.
    if (this.settings) {
      this.settings = { ...this.settings, lastUpdateId };
      if (actionable.length > 0) await this.persist();
    }

    for (const update of actionable) {
      if (this.generation !== generation) return;
      try {
        await this.handleUpdate(update, getSnapshot);
      } catch (error) {
        console.warn(
          'Telegram command failed:',
          error instanceof Error ? error.message : 'Unknown error'
        );
      }
    }
  }

  private async handleUpdate(
    update: TelegramUpdate,
    getSnapshot: () => Promise<TelegramActivitySnapshot>
  ): Promise<void> {
    const currentSettings = this.requirePaired();
    const message = update.message;
    if (message) {
      const command = getCommand(message.text);
      if (command === 'settings' || command === 'alerts') {
        await this.sendSettingsMessage(currentSettings);
      } else if (command === 'status') {
        await this.sendMessage(
          currentSettings.botToken,
          currentSettings.chatId,
          formatTelegramStatus(await getSnapshot())
        );
      } else if (command === 'start' || command === 'help') {
        await this.sendMessage(
          currentSettings.botToken,
          currentSettings.chatId,
          getHelpMessage()
        );
      }
    }

    const callback = update.callback_query;
    if (callback?.data?.startsWith('sv2:toggle:')) {
      await this.handleToggle(callback);
    }
  }

  private async handleToggle(callback: TelegramCallbackQuery): Promise<void> {
    const settings = this.requirePaired();
    const key = callback.data?.slice('sv2:toggle:'.length);
    const next = { ...settings };

    switch (key) {
      case 'enabled':
        next.enabled = !next.enabled;
        break;
      case 'block':
        next.notifyOnBlockFound = !next.notifyOnBlockFound;
        break;
      case 'best':
        next.notifyOnBestDifficulty = !next.notifyOnBestDifficulty;
        break;
      case 'pool':
        next.notifyOnPoolChange = !next.notifyOnPoolChange;
        break;
      case 'status':
        next.notifyOnStatusChange = !next.notifyOnStatusChange;
        break;
      case 'workers':
        next.notifyOnWorkerChange = !next.notifyOnWorkerChange;
        break;
      case 'rejected':
        next.notifyOnRejectedShares = !next.notifyOnRejectedShares;
        break;
      case 'summary':
        next.summaryIntervalMinutes = cycleSummaryInterval(next.summaryIntervalMinutes);
        break;
      default:
        await this.callApi(settings.botToken, 'answerCallbackQuery', {
          callback_query_id: callback.id,
          text: 'This alert option is no longer available.',
        });
        return;
    }

    this.settings = next;
    await this.persist();
    await this.callApi(settings.botToken, 'answerCallbackQuery', {
      callback_query_id: callback.id,
      text: 'Alert settings updated.',
    });

    if (callback.message) {
      await this.callApi(settings.botToken, 'editMessageText', {
        chat_id: settings.chatId,
        message_id: callback.message.message_id,
        text: getSettingsMessage(next),
        reply_markup: getSettingsKeyboard(next),
      });
    }
  }

  private async sendSettingsMessage(settings: SavedTelegramSettings): Promise<void> {
    await this.callApi(settings.botToken, 'sendMessage', {
      chat_id: settings.chatId,
      text: getSettingsMessage(settings),
      reply_markup: getSettingsKeyboard(settings),
    });
  }

  private requireConnected(): SavedTelegramSettings {
    if (!this.settings) {
      throw new TelegramConfigError('Connect a Telegram bot first');
    }
    return this.settings;
  }

  private requirePaired(): SavedTelegramSettings & { chatId: number } {
    const settings = this.requireConnected();
    if (settings.chatId === null) {
      throw new TelegramConfigError('Pair a Telegram chat first');
    }
    return settings as SavedTelegramSettings & { chatId: number };
  }

  private publicSettings(): TelegramSettings {
    return toPublicSettings(this.settings, this.describeDeliveryIssue());
  }

  private describeDeliveryIssue(): string | null {
    const issue = this.deliveryIssue;
    if (!issue || !this.settings || this.settings.chatId === null) return null;

    switch (issue.reason) {
      case 'invalid-token':
        return 'Telegram rejected the bot token, so alerts are not being delivered. Disconnect and connect the bot again.';
      case 'conflict':
        return 'Another app is using this bot, so alerts are not being delivered. Use a bot made just for SV2 UI.';
      case 'blocked':
        return 'Telegram refused to deliver alerts. Unblock the bot or press Start in its chat, then send a test.';
      default:
        return this.now() - issue.since >= UNREACHABLE_REPORT_AFTER_MS
          ? 'SV2 UI cannot reach Telegram, so alerts are delayed. Check this server\'s internet connection.'
          : null;
    }
  }

  private recordDeliveryFailure(error: unknown): void {
    if (!(error instanceof TelegramApiError) || error.reason === 'rejected') return;

    const now = this.now();
    const previous = this.deliveryIssue;
    const reason: TelegramFailureReason =
      error.reason === 'invalid-token' || error.reason === 'conflict' || error.reason === 'blocked'
        ? error.reason
        : 'unreachable';

    // A temporary failure does not hide a known persistent one.
    if (reason === 'unreachable' && previous && previous.reason !== 'unreachable') return;

    this.deliveryIssue = {
      reason,
      since: previous?.reason === reason ? previous.since : now,
      retryAt: reason === 'invalid-token' || reason === 'conflict'
        ? now + PERSISTENT_FAILURE_RETRY_MS
        : null,
    };
    if (previous?.reason !== reason) {
      const message = DELIVERY_ISSUE_LOG[reason];
      if (message) console.warn(message);
    }
  }

  /**
   * `updates`: Telegram accepted the token (clears everything except a
   * blocked chat, which only a successful send can clear). `send`: a message
   * reached the chat, so delivery is healthy.
   */
  private recordDeliverySuccess(kind: 'updates' | 'send'): void {
    const previous = this.deliveryIssue;
    if (!previous) return;
    if (kind === 'updates' && previous.reason === 'blocked') return;

    this.deliveryIssue = null;
    console.warn('Telegram alert delivery recovered.');
  }

  private newPairingCode(): Pick<SavedTelegramSettings, 'pairingCode' | 'pairingCodeExpiresAt'> {
    return {
      pairingCode: `sv2_${randomBytes(18).toString('base64url')}`,
      pairingCodeExpiresAt: this.now() + PAIRING_CODE_TTL_MS,
    };
  }

  /** While a bot waits to be paired, replace its pairing code once it expires. */
  private async renewExpiredPairingCode(): Promise<void> {
    const settings = this.settings;
    if (!settings || settings.chatId !== null) return;

    const expiresAt = settings.pairingCodeExpiresAt;
    if (settings.pairingCode && typeof expiresAt === 'number' && this.now() < expiresAt) return;

    // From here on a /start with the old code no longer matches.
    this.settings = { ...settings, ...this.newPairingCode() };
    await this.persist();
  }

  private assertGeneration(generation: number): void {
    if (this.generation !== generation) {
      throw new TelegramConfigError('Telegram settings changed in the meantime. Try again.');
    }
  }

  /** Swap the bot/chat identity and invalidate any in-flight work. */
  private replaceConnection(settings: SavedTelegramSettings | null): void {
    this.generation += 1;
    this.deliveryIssue = null;
    this.settings = settings;
    this.pairingOffset = null;
    this.outbox = [];
    this.resetMonitorState();
  }

  /**
   * Write the current settings, or delete the file when disconnected. Writes
   * are chained so they land in call order, and each one writes whatever the
   * settings are when it runs, so the last write always reflects the latest
   * state.
   */
  private persist(): Promise<void> {
    const run = this.persistChain.then(() => this.writeCurrentSettings());
    // Keep the chain usable after a failed write; the caller still sees it.
    this.persistChain = run.catch(() => undefined);
    return run;
  }

  private async writeCurrentSettings(): Promise<void> {
    if (!this.settings) {
      try {
        await fs.unlink(this.settingsFile);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
      return;
    }

    // The file holds the bot token, so it gets the same treatment as the
    // credential and state files: owner-only directory, atomic replace that
    // never writes through a planted symlink, and an exact 0600 mode.
    await ensureConfigDir(path.dirname(this.settingsFile));
    await writeFileAtomically(
      this.settingsFile,
      `${JSON.stringify(this.settings, null, 2)}\n`,
      { mode: 0o600 },
    );
  }

  private resetMonitorState(): void {
    this.lastActivityCheckAt = null;
    this.previousSnapshot = null;
    this.channelBaselines.clear();
    this.lastSummaryAt = null;
    this.lastKnownPool = null;
    this.dockerUnreachableReported = false;
  }

  private updateLastKnownPool(snapshot: TelegramActivitySnapshot): void {
    if (!snapshot.running) {
      this.lastKnownPool = null;
    } else if (snapshot.poolName !== null && snapshot.activePoolIndex !== null) {
      this.lastKnownPool = {
        name: snapshot.poolName,
        index: snapshot.activePoolIndex,
        stackId: snapshot.stackId ?? null,
      };
    }
  }

  private updateChannelBaselines(channels: TelegramMiningChannel[] | null): void {
    if (!channels) return;

    // Replace rather than merge: channel keys include the channel id, which
    // changes on every reconnect, so merging would grow without bound over a
    // long uptime. Best-difficulty records are kept separately and survive.
    this.channelBaselines.clear();
    for (const channel of channels) {
      this.channelBaselines.set(channel.key, channel);
    }
  }

  private getBestDifficultyRecord(recordKey: string): number | undefined {
    return this.settings?.bestDifficultyRecords?.find(([key]) => key === recordKey)?.[1];
  }

  /**
   * Raises the record of the snapshot's pool to the best difficulty seen now.
   * Returns whether it changed, so the caller saves only real changes.
   */
  private raiseBestDifficultyRecord(snapshot: TelegramActivitySnapshot): boolean {
    if (!this.settings || !snapshot.recordKey || !snapshot.channels?.length) return false;

    const best = Math.max(...snapshot.channels.map((channel) => channel.bestDifficulty));
    const record = this.getBestDifficultyRecord(snapshot.recordKey);
    if (record !== undefined && best <= record) return false;

    const records = (this.settings.bestDifficultyRecords ?? [])
      .filter(([key]) => key !== snapshot.recordKey);
    records.push([snapshot.recordKey, Math.max(best, record ?? 0)]);
    this.settings = {
      ...this.settings,
      bestDifficultyRecords: records.slice(-MAX_BEST_DIFFICULTY_RECORDS),
    };
    return true;
  }

  private async sendMessage(botToken: string, chatId: number, text: string): Promise<void> {
    await this.callApi(botToken, 'sendMessage', { chat_id: chatId, text: truncateMessage(text) });
  }

  private async callApi<T>(
    botToken: string,
    method: string,
    body: Record<string, unknown> = {}
  ): Promise<T> {
    let response: Response;

    try {
      response = await this.fetchImplementation(
        `https://api.telegram.org/bot${botToken}/${method}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(10_000),
        }
      );
    } catch {
      throw new TelegramApiError(
        'Could not reach Telegram. Check this server’s internet connection.',
        502,
        null,
        'unreachable',
      );
    }

    const payload = await readJsonWithLimit(response, MAX_TELEGRAM_RESPONSE_BYTES)
      .catch(() => null) as TelegramApiResponse<T> | null;
    if (!response.ok || !payload?.ok || payload.result === undefined) {
      throw toTelegramApiError(payload?.error_code ?? response.status, payload?.description);
    }

    return payload.result;
  }
}
