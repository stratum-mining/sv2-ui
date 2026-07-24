import { randomBytes } from 'crypto';
import fs from 'fs/promises';
import path from 'path';

const DEFAULT_SUMMARY_INTERVAL_MINUTES = 60;
const MIN_SUMMARY_INTERVAL_MINUTES = 15;
const MAX_SUMMARY_INTERVAL_MINUTES = 24 * 60;

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

type TelegramUpdate = {
  update_id: number;
  message?: {
    text?: string;
    chat: TelegramChat;
  };
};

type TelegramApiResponse<T> = {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
};

type SavedTelegramSettings = {
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

export type TelegramSettings = {
  connected: boolean;
  paired: boolean;
  botUsername: string | null;
  botName: string | null;
  recipient: string | null;
  pairingUrl: string | null;
  enabled: boolean;
  notifyOnStatusChange: boolean;
  summaryIntervalMinutes: number;
};

export type TelegramSettingsUpdate = {
  enabled?: boolean;
  notifyOnStatusChange?: boolean;
  summaryIntervalMinutes?: number;
};

export type TelegramActivitySnapshot = {
  running: boolean;
  poolName: string | null;
  hashrate: number | null;
  workers: number | null;
  sharesSubmitted: number | null;
  sharesAccepted: number | null;
  sharesRejected: number | null;
};

export class TelegramConfigError extends Error {}

export class TelegramApiError extends Error {
  constructor(
    message: string,
    readonly statusCode: number
  ) {
    super(message);
  }
}

function getEmptySettings(): TelegramSettings {
  return {
    connected: false,
    paired: false,
    botUsername: null,
    botName: null,
    recipient: null,
    pairingUrl: null,
    enabled: false,
    notifyOnStatusChange: true,
    summaryIntervalMinutes: DEFAULT_SUMMARY_INTERVAL_MINUTES,
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
    notifyOnStatusChange: settings.notifyOnStatusChange,
    summaryIntervalMinutes: settings.summaryIntervalMinutes,
  };
}

function isSavedSettings(value: unknown): value is SavedTelegramSettings {
  if (!value || typeof value !== 'object') return false;
  const settings = value as Partial<SavedTelegramSettings>;

  return settings.version === 1 &&
    typeof settings.botToken === 'string' &&
    typeof settings.botUsername === 'string' &&
    typeof settings.botName === 'string' &&
    (settings.pairingCode === null || typeof settings.pairingCode === 'string') &&
    (settings.chatId === null || typeof settings.chatId === 'number') &&
    (settings.recipient === null || typeof settings.recipient === 'string') &&
    typeof settings.enabled === 'boolean' &&
    typeof settings.notifyOnStatusChange === 'boolean' &&
    Number.isInteger(settings.summaryIntervalMinutes);
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
    previous.poolName !== current.poolName &&
    current.poolName !== null
  ) {
    return formatTelegramStatus(current, '🔁 SV2 active pool changed');
  }

  return null;
}

export class TelegramService {
  private settings: SavedTelegramSettings | null = null;
  private initialized = false;
  private previousSnapshot: TelegramActivitySnapshot | null = null;
  private lastSummaryAt: number | null = null;
  private pollInProgress = false;

  constructor(
    private readonly settingsFile: string,
    private readonly fetchImplementation: FetchImplementation = fetch
  ) {}

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      const raw = await fs.readFile(this.settingsFile, 'utf8');
      const parsed: unknown = JSON.parse(raw);
      if (!isSavedSettings(parsed)) {
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
      version: 1,
      botToken: token,
      botUsername: bot.username,
      botName: bot.first_name,
      pairingCode: `sv2_${randomBytes(18).toString('base64url')}`,
      chatId: null,
      recipient: null,
      enabled: false,
      notifyOnStatusChange: true,
      summaryIntervalMinutes: DEFAULT_SUMMARY_INTERVAL_MINUTES,
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

    await this.sendMessage(
      settings.botToken,
      chat.id,
      '✅ SV2 UI is linked. Telegram activity updates are now enabled.'
    );

    this.settings = {
      ...settings,
      pairingCode: null,
      chatId: chat.id,
      recipient: getRecipientLabel(chat),
      enabled: true,
    };
    this.resetMonitorState();
    await this.save();
    return toPublicSettings(this.settings);
  }

  async updateSettings(update: TelegramSettingsUpdate): Promise<TelegramSettings> {
    await this.initialize();
    const settings = this.requirePaired();

    const enabled = update.enabled ?? settings.enabled;
    const notifyOnStatusChange =
      update.notifyOnStatusChange ?? settings.notifyOnStatusChange;
    const summaryIntervalMinutes =
      update.summaryIntervalMinutes ?? settings.summaryIntervalMinutes;

    if (typeof enabled !== 'boolean' || typeof notifyOnStatusChange !== 'boolean') {
      throw new TelegramConfigError('Notification settings must be true or false');
    }
    if (
      !Number.isInteger(summaryIntervalMinutes) ||
      (summaryIntervalMinutes !== 0 &&
        (
          summaryIntervalMinutes < MIN_SUMMARY_INTERVAL_MINUTES ||
          summaryIntervalMinutes > MAX_SUMMARY_INTERVAL_MINUTES
        ))
    ) {
      throw new TelegramConfigError(
        `Summary interval must be 0 (off) or ${MIN_SUMMARY_INTERVAL_MINUTES}-${MAX_SUMMARY_INTERVAL_MINUTES} minutes`
      );
    }

    this.settings = {
      ...settings,
      enabled,
      notifyOnStatusChange,
      summaryIntervalMinutes,
    };
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

    const settings = this.settings;
    if (!settings?.enabled || settings.chatId === null) {
      this.resetMonitorState();
      return;
    }

    this.pollInProgress = true;
    try {
      const current = await snapshotProvider();
      const now = Date.now();

      if (!this.previousSnapshot) {
        this.previousSnapshot = current;
        this.lastSummaryAt = now;
        return;
      }

      const statusMessage = settings.notifyOnStatusChange
        ? getStatusChangeMessage(this.previousSnapshot, current)
        : null;
      const summaryDue = settings.summaryIntervalMinutes > 0 &&
        this.lastSummaryAt !== null &&
        now - this.lastSummaryAt >= settings.summaryIntervalMinutes * 60_000;

      if (statusMessage) {
        await this.sendMessage(settings.botToken, settings.chatId, statusMessage);
      } else if (summaryDue) {
        await this.sendMessage(
          settings.botToken,
          settings.chatId,
          formatTelegramStatus(current)
        );
        this.lastSummaryAt = now;
      }

      this.previousSnapshot = current;
    } finally {
      this.pollInProgress = false;
    }
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
    this.lastSummaryAt = null;
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
