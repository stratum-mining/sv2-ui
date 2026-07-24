import { randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const MIN_SUMMARY_INTERVAL_MINUTES = 15;
const MAX_SUMMARY_INTERVAL_MINUTES = 24 * 60;
const SUMMARY_INTERVAL_OPTIONS = [0, 15, 60, 6 * 60] as const;

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
};

export type TelegramSettingsUpdate = Partial<TelegramAlertSettings>;

export type TelegramMiningChannel = {
  key: string;
  userIdentity: string;
  blocksFound: number;
  bestDifficulty: number;
};

export type TelegramActivitySnapshot = {
  running: boolean;
  poolName: string | null;
  activePoolIndex: number | null;
  hashrate: number | null;
  workers: number | null;
  sharesSubmitted: number | null;
  sharesAccepted: number | null;
  sharesRejected: number | null;
  channels: TelegramMiningChannel[] | null;
};

type MonitoringPage<T> = {
  items: T[];
  total: number;
};

export async function collectPaginatedMonitoringItems<T>(
  fetchPage: (offset: number, limit: number) => Promise<MonitoringPage<T> | null>,
  pageSize = 100,
): Promise<T[] | null> {
  if (!Number.isInteger(pageSize) || pageSize <= 0) {
    throw new RangeError('Monitoring page size must be a positive integer');
  }

  const items: T[] = [];
  let offset = 0;

  while (true) {
    const page = await fetchPage(offset, pageSize);
    if (!page) return null;

    items.push(...page.items);
    if (offset + pageSize >= page.total) return items;
    offset += pageSize;
  }
}

export function getTelegramWorkerCount(
  isJdMode: boolean,
  sv1Clients: { total_clients: number } | null | undefined,
  sv2Clients: { total_channels: number } | null | undefined,
): number | null {
  return isJdMode
    ? sv2Clients?.total_channels ?? null
    : sv1Clients?.total_clients ?? null;
}

export class TelegramConfigError extends Error {}

export class TelegramApiError extends Error {
  constructor(
    message: string,
    readonly statusCode: number
  ) {
    super(message);
  }
}

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
    ...DEFAULT_ALERT_SETTINGS,
    enabled: false,
  };
}

function toPublicSettings(settings: SavedTelegramSettings | null): TelegramSettings {
  if (!settings) return getEmptySettings();

  return {
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
    typeof settings.botUsername === 'string' &&
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

  return value as SavedTelegramSettings;
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
    `Status: ${snapshot.running ? 'Running' : 'Stopped'}`,
  ];

  if (snapshot.poolName) lines.push(`Pool: ${snapshot.poolName}`);

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

export function getStatusChangeMessage(
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
    current.running &&
    current.poolName !== null &&
    (
      previous.poolName !== current.poolName ||
      (
        previous.activePoolIndex !== null &&
        current.activePoolIndex !== null &&
        previous.activePoolIndex !== current.activePoolIndex
      )
    )
  ) {
    return formatTelegramStatus(current, '🔁 SV2 active pool changed');
  }

  return null;
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
    if (current.poolName) lines.push(`Pool: ${current.poolName}`);
    lines.push(`Worker: ${channel.userIdentity}`);
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
  highWatermark: number
): string | null {
  if (!previous.channels || !current.channels) return null;

  const previousByKey = new Map(previous.channels.map((channel) => [channel.key, channel]));
  const improved = current.channels
    .filter((channel) => {
      const before = previousByKey.get(channel.key);
      return before &&
        channel.bestDifficulty > before.bestDifficulty &&
        channel.bestDifficulty > highWatermark;
    })
    .sort((left, right) => right.bestDifficulty - left.bestDifficulty)[0];

  if (!improved) return null;

  const lines = ['🏆 New best difficulty!'];
  if (current.poolName) lines.push(`Pool: ${current.poolName}`);
  lines.push(`Worker: ${improved.userIdentity}`);
  lines.push(`Difficulty: ${formatDifficulty(improved.bestDifficulty)}`);
  return lines.join('\n');
}

function formatSummaryInterval(minutes: number): string {
  if (minutes === 0) return 'Off';
  if (minutes % 60 === 0) return `${minutes / 60}h`;
  return `${minutes}m`;
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

function cycleSummaryInterval(current: number): number {
  const currentIndex = SUMMARY_INTERVAL_OPTIONS.indexOf(
    current as typeof SUMMARY_INTERVAL_OPTIONS[number]
  );
  return SUMMARY_INTERVAL_OPTIONS[
    currentIndex === -1 ? 0 : (currentIndex + 1) % SUMMARY_INTERVAL_OPTIONS.length
  ];
}

export class TelegramService {
  private settings: SavedTelegramSettings | null = null;
  private initialized = false;
  private previousSnapshot: TelegramActivitySnapshot | null = null;
  private channelBaselines = new Map<string, TelegramMiningChannel>();
  private bestDifficultyHighWatermark = 0;
  private lastSummaryAt: number | null = null;
  private lastKnownPool: { name: string; index: number } | null = null;
  private pollInProgress = false;

  constructor(
    private readonly settingsFile: string,
    private readonly fetchImplementation: FetchImplementation = fetch
  ) {}

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      const raw = await fs.readFile(this.settingsFile, 'utf8');
      const parsed = parseSavedSettings(JSON.parse(raw) as unknown);
      if (!parsed) {
        throw new TelegramConfigError('Stored Telegram settings are invalid');
      }
      this.settings = parsed;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') {
        console.warn(
          'Telegram settings could not be loaded:',
          error instanceof Error ? error.message : 'Unknown error'
        );
      }
      this.settings = null;
    }

    this.initialized = true;
  }

  async getSettings(): Promise<TelegramSettings> {
    await this.initialize();
    return toPublicSettings(this.settings);
  }

  async connectBot(botToken: string): Promise<TelegramSettings> {
    await this.initialize();
    const token = botToken.trim();

    if (!token || token.length > 256 || /\s/.test(token)) {
      throw new TelegramConfigError('Enter a valid Telegram bot token');
    }

    const bot = await this.callApi<TelegramBot>(token, 'getMe');
    if (!bot.is_bot || !bot.username) {
      throw new TelegramConfigError('Telegram did not return a usable bot username');
    }

    this.settings = {
      version: 2,
      botToken: token,
      botUsername: bot.username,
      botName: bot.first_name,
      pairingCode: `sv2_${randomBytes(18).toString('base64url')}`,
      chatId: null,
      recipient: null,
      lastUpdateId: null,
      ...DEFAULT_ALERT_SETTINGS,
      enabled: false,
    };
    this.resetMonitorState();
    await this.save();
    return toPublicSettings(this.settings);
  }

  async pairChat(): Promise<TelegramSettings> {
    await this.initialize();
    const settings = this.requireConnected();

    if (settings.chatId !== null) {
      return toPublicSettings(settings);
    }
    if (!settings.pairingCode) {
      throw new TelegramConfigError('Create a new Telegram pairing link first');
    }

    const updates = await this.callApi<TelegramUpdate[]>(
      settings.botToken,
      'getUpdates',
      {
        offset: -100,
        limit: 100,
        timeout: 0,
        allowed_updates: ['message'],
      }
    );

    const matchingUpdate = [...updates].reverse().find((update) =>
      update.message?.chat.type === 'private' &&
      getStartParameter(update.message.text) === settings.pairingCode
    );
    const chat = matchingUpdate?.message?.chat;

    if (!chat) {
      throw new TelegramConfigError(
        `Open @${settings.botUsername} from the pairing link and press Start, then try again`
      );
    }

    const pairedSettings: SavedTelegramSettings = {
      ...settings,
      pairingCode: null,
      chatId: chat.id,
      recipient: getRecipientLabel(chat),
      lastUpdateId: updates.reduce(
        (latest, update) => Math.max(latest, update.update_id),
        matchingUpdate.update_id
      ),
      ...DEFAULT_ALERT_SETTINGS,
    };

    await this.sendMessage(
      pairedSettings.botToken,
      chat.id,
      [
        '✅ SV2 UI is linked.',
        '',
        'Block found, new best difficulty, and pool failover alerts are enabled.',
        'Use /settings to configure alerts or /status for a live summary.',
      ].join('\n')
    );

    this.settings = pairedSettings;
    this.resetMonitorState();
    await this.save();
    return toPublicSettings(this.settings);
  }

  async updateSettings(update: TelegramSettingsUpdate): Promise<TelegramSettings> {
    await this.initialize();
    const settings = this.requirePaired();
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
    if (
      !Number.isInteger(next.summaryIntervalMinutes) ||
      (next.summaryIntervalMinutes !== 0 &&
        (
          next.summaryIntervalMinutes < MIN_SUMMARY_INTERVAL_MINUTES ||
          next.summaryIntervalMinutes > MAX_SUMMARY_INTERVAL_MINUTES
        ))
    ) {
      throw new TelegramConfigError(
        `Summary interval must be 0 (off) or ${MIN_SUMMARY_INTERVAL_MINUTES}-${MAX_SUMMARY_INTERVAL_MINUTES} minutes`
      );
    }

    this.settings = next;
    this.resetMonitorState();
    await this.save();
    return toPublicSettings(this.settings);
  }

  async sendTestMessage(): Promise<void> {
    await this.initialize();
    const settings = this.requirePaired();
    await this.sendMessage(
      settings.botToken,
      settings.chatId,
      '✅ SV2 UI Telegram notifications are working.'
    );
  }

  async disconnect(): Promise<TelegramSettings> {
    await this.initialize();
    this.settings = null;
    this.resetMonitorState();

    try {
      await fs.unlink(this.settingsFile);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }

    return getEmptySettings();
  }

  async poll(snapshotProvider: () => Promise<TelegramActivitySnapshot>): Promise<void> {
    await this.initialize();
    if (this.pollInProgress) return;

    const initialSettings = this.settings;
    if (!initialSettings || initialSettings.chatId === null) {
      this.resetMonitorState();
      return;
    }

    this.pollInProgress = true;
    let snapshotPromise: Promise<TelegramActivitySnapshot> | null = null;
    const getSnapshot = () => {
      snapshotPromise ??= snapshotProvider();
      return snapshotPromise;
    };

    try {
      await this.processBotUpdates(
        initialSettings as SavedTelegramSettings & { chatId: number },
        getSnapshot
      );
      const settings = this.requirePaired();
      if (!settings.enabled) {
        this.resetMonitorState();
        return;
      }

      const current = await getSnapshot();
      const now = Date.now();

      if (!this.previousSnapshot) {
        this.previousSnapshot = current;
        this.updateChannelBaselines(current.channels);
        this.updateLastKnownPool(current);
        this.lastSummaryAt = now;
        return;
      }

      const messages: string[] = [];
      const channelBaselineSnapshot = {
        ...this.previousSnapshot,
        channels: [...this.channelBaselines.values()],
      };
      const blockMessages = settings.notifyOnBlockFound
        ? getBlockFoundMessages(channelBaselineSnapshot, current)
        : [];
      messages.push(...blockMessages);

      if (
        settings.notifyOnBestDifficulty &&
        blockMessages.length === 0
      ) {
        const bestDifficultyMessage = getBestDifficultyMessage(
          channelBaselineSnapshot,
          current,
          this.bestDifficultyHighWatermark
        );
        if (bestDifficultyMessage) messages.push(bestDifficultyMessage);
      }

      const currentPool = current.poolName !== null && current.activePoolIndex !== null
        ? { name: current.poolName, index: current.activePoolIndex }
        : null;
      if (
        settings.notifyOnPoolChange &&
        current.running &&
        this.lastKnownPool &&
        currentPool &&
        (
          this.lastKnownPool.index !== currentPool.index ||
          this.lastKnownPool.name !== currentPool.name
        )
      ) {
        const duplicateName = this.lastKnownPool.name === currentPool.name;
        const previousLabel = duplicateName
          ? `${this.lastKnownPool.name} (${formatPoolPriority(this.lastKnownPool.index)})`
          : this.lastKnownPool.name;
        const currentLabel = duplicateName
          ? `${currentPool.name} (${formatPoolPriority(currentPool.index)})`
          : currentPool.name;
        messages.push([
          '🔁 Pool failover',
          `From: ${previousLabel}`,
          `To: ${currentLabel}`,
        ].join('\n'));
      }

      if (settings.notifyOnStatusChange) {
        const statusMessage = getMiningStatusChangeMessage(this.previousSnapshot, current);
        if (statusMessage) messages.push(statusMessage);
      }

      if (
        settings.notifyOnWorkerChange &&
        this.previousSnapshot.workers !== null &&
        current.workers !== null &&
        this.previousSnapshot.workers !== current.workers
      ) {
        messages.push([
          current.workers > this.previousSnapshot.workers
            ? '🟢 Worker connected'
            : '🟠 Worker disconnected',
          `Workers: ${this.previousSnapshot.workers.toLocaleString()} → ${current.workers.toLocaleString()}`,
        ].join('\n'));
      }

      if (
        settings.notifyOnRejectedShares &&
        this.previousSnapshot.sharesRejected !== null &&
        current.sharesRejected !== null &&
        current.sharesRejected > this.previousSnapshot.sharesRejected
      ) {
        messages.push([
          '⚠️ Rejected shares increased',
          `New rejected shares: ${(current.sharesRejected - this.previousSnapshot.sharesRejected).toLocaleString()}`,
          `Total rejected: ${current.sharesRejected.toLocaleString()}`,
        ].join('\n'));
      }

      const summaryDue = settings.summaryIntervalMinutes > 0 &&
        this.lastSummaryAt !== null &&
        now - this.lastSummaryAt >= settings.summaryIntervalMinutes * 60_000;

      if (messages.length > 0) {
        await this.sendMessage(settings.botToken, settings.chatId, messages.join('\n\n'));
        this.lastSummaryAt = now;
      } else if (summaryDue) {
        await this.sendMessage(
          settings.botToken,
          settings.chatId,
          formatTelegramStatus(current)
        );
        this.lastSummaryAt = now;
      }

      this.previousSnapshot = current.channels === null
        ? { ...current, channels: this.previousSnapshot.channels }
        : current;
      this.updateChannelBaselines(current.channels);
      this.updateLastKnownPool(current);
    } finally {
      this.pollInProgress = false;
    }
  }

  private async processBotUpdates(
    settings: SavedTelegramSettings & { chatId: number },
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

    if (updates.length === 0) return;

    for (const update of [...updates].sort((left, right) => left.update_id - right.update_id)) {
      if (this.settings) {
        this.settings = { ...this.settings, lastUpdateId: update.update_id };
        await this.save();
      }
      const currentSettings = this.requirePaired();
      const message = update.message;
      if (
        message?.chat.type === 'private' &&
        message.chat.id === currentSettings.chatId
      ) {
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
      if (
        callback?.message?.chat.type === 'private' &&
        callback.message.chat.id === currentSettings.chatId &&
        callback.data?.startsWith('sv2:toggle:')
      ) {
        await this.handleToggle(callback);
      }
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
    this.resetMonitorState();
    await this.save();
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

  private async save(): Promise<void> {
    if (!this.settings) return;

    await fs.mkdir(path.dirname(this.settingsFile), { recursive: true });
    await fs.writeFile(
      this.settingsFile,
      JSON.stringify(this.settings, null, 2),
      { mode: 0o600 }
    );
    await fs.chmod(this.settingsFile, 0o600);
  }

  private resetMonitorState(): void {
    this.previousSnapshot = null;
    this.channelBaselines.clear();
    this.bestDifficultyHighWatermark = 0;
    this.lastSummaryAt = null;
    this.lastKnownPool = null;
  }

  private updateLastKnownPool(snapshot: TelegramActivitySnapshot): void {
    if (snapshot.poolName !== null && snapshot.activePoolIndex !== null) {
      this.lastKnownPool = {
        name: snapshot.poolName,
        index: snapshot.activePoolIndex,
      };
    }
  }

  private updateChannelBaselines(channels: TelegramMiningChannel[] | null): void {
    if (!channels) return;

    for (const channel of channels) {
      this.channelBaselines.set(channel.key, channel);
      this.bestDifficultyHighWatermark = Math.max(
        this.bestDifficultyHighWatermark,
        channel.bestDifficulty
      );
    }
  }

  private async sendMessage(botToken: string, chatId: number, text: string): Promise<void> {
    await this.callApi(botToken, 'sendMessage', { chat_id: chatId, text });
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
        'Could not reach Telegram. Check this machine’s internet connection.',
        502
      );
    }

    const payload = await response.json().catch(() => null) as TelegramApiResponse<T> | null;
    if (!response.ok || !payload?.ok || payload.result === undefined) {
      const description = payload?.description?.replace(/^Bad Request:\s*/i, '');
      const message = description || 'Telegram rejected the request';
      throw new TelegramApiError(message, response.status >= 400 ? response.status : 502);
    }

    return payload.result;
  }
}
