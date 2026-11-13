import fs from 'node:fs/promises';
import { formatDifficulty, formatHashrate } from '@sv2-ui/shared';
import { writeFileAtomically } from './atomic-write.js';
import type { TelegramActivitySnapshot } from './telegram.js';
import type { StatusResponse } from './types.js';

export const UMBREL_WIDGET_PORT = 8081;
export const UMBREL_WIDGET_INTERVAL_MS = 5000;
const MAX_SAMPLE_AGE_MS = 60_000;

type WidgetSample = Pick<TelegramActivitySnapshot, 'hashrate' | 'activeWorkers' | 'channels'> & {
  status: string;
};

const unavailable: WidgetSample = {
  status: 'Unavailable',
  hashrate: null,
  activeWorkers: null,
  channels: null,
};

export function widgetStatus(status: StatusResponse, monitoringAvailable: boolean): string {
  if (status.configurationIssues.length > 0) return 'Review setup';
  if (!status.configured) return 'Set up';
  if (status.dockerError) return 'Docker offline';
  if (status.translatorFailing) return 'Translator down';
  if (status.soloFallback) return 'Solo fallback';
  if ((status.activePoolIndex ?? 0) > 0) return 'Fallback pool';
  if (status.degraded) return 'Recovering';
  if (status.autoStarting) return 'Starting';
  if (!status.running) return status.shouldBeRunning ? 'Check app' : 'Stopped';
  if (!monitoringAvailable) return 'Check app';
  if (status.activePoolIndex === null && !(status.mode === 'jd' && status.miningMode === 'solo')) {
    return 'Connecting';
  }
  return 'Online';
}

async function loadBestShare(filePath: string): Promise<number> {
  try {
    const handle = await fs.open(filePath, fs.constants.O_RDONLY | fs.constants.O_NONBLOCK | fs.constants.O_NOFOLLOW);
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.size > 64) {
        throw new Error('Invalid Umbrel widget record file');
      }
      const contents = Buffer.alloc(65);
      const { bytesRead } = await handle.read(contents);
      const value: unknown = JSON.parse(contents.toString('utf8', 0, bytesRead));
      if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
      throw new Error('Invalid Umbrel widget best share');
    } finally {
      await handle.close();
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 0;
    throw error;
  }
}

export class UmbrelWidget {
  private sample: WidgetSample = { ...unavailable, status: 'Starting' };
  private updatedAt = Date.now();
  private bestShare = 0;
  private savedBestShare: number | null = null;
  private pending: Promise<void> | null = null;

  constructor(private readonly recordPath: string) {}

  refresh(readSample: () => Promise<WidgetSample>): Promise<void> {
    this.pending ??= this.update(readSample).finally(() => { this.pending = null; });
    return this.pending;
  }

  private async update(readSample: () => Promise<WidgetSample>): Promise<void> {
    this.sample = await readSample();
    this.updatedAt = Date.now();
    for (const channel of this.sample.channels ?? []) {
      this.bestShare = Math.max(this.bestShare, channel.bestDifficulty);
    }
    this.savedBestShare ??= await loadBestShare(this.recordPath);
    this.bestShare = Math.max(this.bestShare, this.savedBestShare);
    if (this.bestShare > this.savedBestShare) {
      await writeFileAtomically(this.recordPath, `${this.bestShare}\n`);
      this.savedBestShare = this.bestShare;
    }
  }

  async reset(): Promise<void> {
    await this.pending?.catch(() => undefined);
    await fs.rm(this.recordPath, { force: true });
    this.bestShare = this.savedBestShare = 0;
    this.sample = { ...unavailable, status: 'Set up' };
    this.updatedAt = Date.now();
  }

  data() {
    const { status, hashrate, activeWorkers } = Date.now() - this.updatedAt > MAX_SAMPLE_AGE_MS
      ? unavailable
      : this.sample;
    const [rate, unit] = hashrate !== null && Number.isFinite(hashrate) && hashrate >= 0
      ? formatHashrate(hashrate).split(' ')
      : ['—', ''];

    return {
      type: 'four-stats',
      link: '',
      refresh: `${UMBREL_WIDGET_INTERVAL_MS / 1000}s`,
      items: [
        { title: 'Hashrate', text: rate, subtext: unit },
        { title: 'Active Miners', text: activeWorkers == null ? '—' : String(activeWorkers) },
        { title: 'Best Share', text: this.bestShare > 0 ? formatDifficulty(this.bestShare) : '—', subtext: 'All time' },
        { title: 'Status', text: status },
      ],
    };
  }
}
