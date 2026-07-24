import { randomUUID } from 'node:crypto';
import { createConnection } from 'node:net';
import { performance } from 'node:perf_hooks';

import type {
  BenchmarkPoolResult,
  BenchmarkRun,
  PoolConfig,
  SetupData,
  SetupMode,
} from '@sv2-ui/shared';

export type ShareCounters = {
  accepted: number;
  rejected: number;
};

export type ActivePoolSelection = {
  index: number;
};

export type BenchmarkDependencies = {
  applyConfiguration: (data: SetupData) => Promise<void>;
  getActivePool: (
    mode: SetupMode,
    pools: PoolConfig[]
  ) => Promise<ActivePoolSelection | null>;
  readShareCounters: (mode: SetupMode) => Promise<ShareCounters>;
  measureLatency?: (pool: PoolConfig, signal: AbortSignal) => Promise<number>;
  onSettled?: () => void;
  sampleIntervalMs?: number;
  activePoolTimeoutMs?: number;
  activePoolPollIntervalMs?: number;
};

type LatencySummary = {
  averageLatencyMs: number | null;
  minLatencyMs: number | null;
  p95LatencyMs: number | null;
};

const DEFAULT_SAMPLE_INTERVAL_MS = 5_000;
const DEFAULT_ACTIVE_POOL_TIMEOUT_MS = 60_000;
const DEFAULT_ACTIVE_POOL_POLL_INTERVAL_MS = 1_000;
const TCP_CONNECT_TIMEOUT_MS = 5_000;

function abortError(): Error {
  const error = new Error('Benchmark stopped');
  error.name = 'AbortError';
  return error;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(abortError());

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timeout);
      reject(abortError());
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

export function summarizeLatencySamples(samples: number[]): LatencySummary {
  if (samples.length === 0) {
    return {
      averageLatencyMs: null,
      minLatencyMs: null,
      p95LatencyMs: null,
    };
  }

  const sorted = [...samples].sort((a, b) => a - b);
  const average = samples.reduce((sum, sample) => sum + sample, 0) / samples.length;
  const p95Index = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1);

  return {
    averageLatencyMs: Math.round(average * 10) / 10,
    minLatencyMs: Math.round(sorted[0] * 10) / 10,
    p95LatencyMs: Math.round(sorted[p95Index] * 10) / 10,
  };
}

export function getCounterDelta(
  before: ShareCounters | null,
  after: ShareCounters | null
): ShareCounters | null {
  if (!before || !after) return null;

  return {
    accepted: Math.max(0, after.accepted - before.accepted),
    rejected: Math.max(0, after.rejected - before.rejected),
  };
}

export function rotatePoolsForBenchmark(
  data: SetupData,
  pools: PoolConfig[],
  primaryIndex: number
): SetupData {
  const rotated = [
    ...pools.slice(primaryIndex),
    ...pools.slice(0, primaryIndex),
  ];

  return {
    ...clone(data),
    pool: clone(rotated[0]),
    fallbackPools: clone(rotated.slice(1)),
  };
}

export function measureTcpConnectLatency(
  pool: PoolConfig,
  signal: AbortSignal,
  timeoutMs = TCP_CONNECT_TIMEOUT_MS
): Promise<number> {
  if (signal.aborted) return Promise.reject(abortError());

  return new Promise((resolve, reject) => {
    const host = pool.address.replace(/^\[|\]$/g, '');
    const startedAt = performance.now();
    const socket = createConnection({ host, port: pool.port });
    let settled = false;

    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', onAbort);
      socket.removeAllListeners();
      socket.destroy();

      if (error) {
        reject(error);
      } else {
        resolve(performance.now() - startedAt);
      }
    };

    const onAbort = () => finish(abortError());

    signal.addEventListener('abort', onAbort, { once: true });
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish());
    socket.once('timeout', () => finish(new Error(`TCP connection timed out after ${timeoutMs} ms`)));
    socket.once('error', (error) => finish(error));
  });
}

export class BenchmarkManager {
  private run: BenchmarkRun | null = null;
  private abortController: AbortController | null = null;
  private execution: Promise<void> | null = null;

  constructor(private readonly dependencies: BenchmarkDependencies) {}

  getSnapshot(): BenchmarkRun | null {
    return this.run ? clone(this.run) : null;
  }

  isActive(): boolean {
    return this.run?.status === 'running' || this.run?.status === 'stopping';
  }

  findSelectedPool(address: string, port: number): PoolConfig | null {
    const pool = this.run?.selectedPools.find((candidate) => (
      candidate.address.trim().toLowerCase() === address.trim().toLowerCase() &&
      candidate.port === port
    ));
    return pool ? clone(pool) : null;
  }

  getSelectedPools(): PoolConfig[] {
    return this.run ? clone(this.run.selectedPools) : [];
  }

  start(
    originalData: SetupData,
    pools: PoolConfig[],
    poolDurationSeconds: number
  ): BenchmarkRun {
    if (this.isActive()) {
      throw new Error('A benchmark is already running');
    }

    const startedAt = new Date().toISOString();
    this.run = {
      id: randomUUID(),
      status: 'running',
      poolDurationSeconds,
      createdAt: startedAt,
      startedAt,
      completedAt: null,
      currentPoolIndex: null,
      currentPoolStartedAt: null,
      currentPoolEndsAt: null,
      selectedPools: clone(pools),
      results: pools.map((pool) => ({
        pool: clone(pool),
        status: 'pending',
        startedAt: null,
        completedAt: null,
        averageLatencyMs: null,
        minLatencyMs: null,
        p95LatencyMs: null,
        successfulSamples: 0,
        attemptedSamples: 0,
        acceptedShares: null,
        rejectedShares: null,
      })),
    };

    this.abortController = new AbortController();
    this.execution = this.execute(
      clone(originalData),
      clone(pools),
      poolDurationSeconds,
      this.abortController.signal
    ).finally(() => {
      this.abortController = null;
      this.dependencies.onSettled?.();
    });

    return clone(this.run);
  }

  stop(): boolean {
    if (!this.isActive() || !this.abortController || !this.run) return false;

    this.run.status = 'stopping';
    this.abortController.abort();
    return true;
  }

  async waitForCompletion(): Promise<void> {
    await this.execution;
  }

  private async execute(
    originalData: SetupData,
    pools: PoolConfig[],
    poolDurationSeconds: number,
    signal: AbortSignal
  ): Promise<void> {
    let wasCancelled = false;

    try {
      for (let index = 0; index < pools.length; index += 1) {
        if (signal.aborted) throw abortError();
        await this.runPool(index, originalData, pools, poolDurationSeconds, signal);
      }
    } catch (error) {
      if (isAbortError(error)) {
        wasCancelled = true;
      } else if (this.run) {
        this.run.status = 'failed';
        this.run.error = errorMessage(error);
      }
    } finally {
      if (this.run) {
        for (const result of this.run.results) {
          if (result.status === 'pending' || result.status === 'connecting' || result.status === 'running') {
            result.status = wasCancelled ? 'cancelled' : 'failed';
            result.completedAt = new Date().toISOString();
            if (!result.error) {
              result.error = wasCancelled ? 'Benchmark stopped' : 'Benchmark did not finish';
            }
          }
        }
      }

      try {
        await this.dependencies.applyConfiguration(originalData);
      } catch (error) {
        if (this.run) {
          this.run.status = 'failed';
          this.run.error = `Could not restore the original pool configuration: ${errorMessage(error)}`;
        }
      }

      if (this.run) {
        if (this.run.status !== 'failed') {
          this.run.status = wasCancelled ? 'cancelled' : 'completed';
        }
        this.run.currentPoolIndex = null;
        this.run.currentPoolStartedAt = null;
        this.run.currentPoolEndsAt = null;
        this.run.completedAt = new Date().toISOString();
      }
    }
  }

  private async runPool(
    index: number,
    originalData: SetupData,
    pools: PoolConfig[],
    poolDurationSeconds: number,
    signal: AbortSignal
  ): Promise<void> {
    if (!this.run) return;

    const result = this.run.results[index];
    const rotatedData = rotatePoolsForBenchmark(originalData, pools, index);
    const rotatedPools = [
      rotatedData.pool,
      ...rotatedData.fallbackPools,
    ].filter((pool): pool is PoolConfig => Boolean(pool));

    this.run.currentPoolIndex = index;
    result.status = 'connecting';
    result.startedAt = new Date().toISOString();

    try {
      await this.dependencies.applyConfiguration(rotatedData);
      await this.waitForIntendedPool(rotatedData.mode, rotatedPools, signal);
      await this.measurePool(result, rotatedData.mode, rotatedPools, poolDurationSeconds, signal);
    } catch (error) {
      if (isAbortError(error)) throw error;

      result.status = 'failed';
      result.error = errorMessage(error);
      result.completedAt = new Date().toISOString();
    } finally {
      if (this.run) {
        this.run.currentPoolStartedAt = null;
        this.run.currentPoolEndsAt = null;
      }
    }
  }

  private async waitForIntendedPool(
    mode: SetupMode | null,
    pools: PoolConfig[],
    signal: AbortSignal
  ): Promise<void> {
    if (!mode) throw new Error('Mining mode is not configured');

    const timeoutMs = this.dependencies.activePoolTimeoutMs ?? DEFAULT_ACTIVE_POOL_TIMEOUT_MS;
    const pollIntervalMs =
      this.dependencies.activePoolPollIntervalMs ?? DEFAULT_ACTIVE_POOL_POLL_INTERVAL_MS;
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      if (signal.aborted) throw abortError();

      const activePool = await this.dependencies.getActivePool(mode, pools);
      if (activePool?.index === 0) return;
      if (activePool && activePool.index > 0) {
        const fallback = pools[activePool.index];
        throw new Error(
          `Could not negotiate SV2 with this pool; ${fallback?.name ?? 'a fallback pool'} became active`
        );
      }

      await sleep(Math.min(pollIntervalMs, Math.max(1, deadline - Date.now())), signal);
    }

    throw new Error(`Pool did not complete SV2 negotiation within ${Math.round(timeoutMs / 1000)} seconds`);
  }

  private async measurePool(
    result: BenchmarkPoolResult,
    mode: SetupMode | null,
    pools: PoolConfig[],
    poolDurationSeconds: number,
    signal: AbortSignal
  ): Promise<void> {
    if (!this.run || !mode) throw new Error('Mining mode is not configured');

    const sampleIntervalMs = this.dependencies.sampleIntervalMs ?? DEFAULT_SAMPLE_INTERVAL_MS;
    const samples: number[] = [];
    const measureLatency = this.dependencies.measureLatency ?? measureTcpConnectLatency;
    const startedAtMs = Date.now();
    const endsAtMs = startedAtMs + poolDurationSeconds * 1_000;
    let lastSampleError: string | null = null;

    result.status = 'running';
    this.run.currentPoolStartedAt = new Date(startedAtMs).toISOString();
    this.run.currentPoolEndsAt = new Date(endsAtMs).toISOString();

    const beforeCounters = await this.tryReadShareCounters(mode);

    while (Date.now() < endsAtMs) {
      if (signal.aborted) throw abortError();

      const activePool = await this.dependencies.getActivePool(mode, pools);
      if (activePool && activePool.index !== 0) {
        const fallback = pools[activePool.index];
        throw new Error(
          `Pool connection changed during measurement; ${fallback?.name ?? 'a fallback pool'} became active`
        );
      }

      result.attemptedSamples += 1;
      try {
        const latency = await measureLatency(result.pool, signal);
        samples.push(latency);
        result.successfulSamples = samples.length;
        Object.assign(result, summarizeLatencySamples(samples));
      } catch (error) {
        if (isAbortError(error)) throw error;
        lastSampleError = errorMessage(error);
      }

      const remainingMs = endsAtMs - Date.now();
      if (remainingMs > 0) {
        await sleep(Math.min(sampleIntervalMs, remainingMs), signal);
      }
    }

    const afterCounters = await this.tryReadShareCounters(mode);
    const shareDelta = getCounterDelta(beforeCounters, afterCounters);
    result.acceptedShares = shareDelta?.accepted ?? null;
    result.rejectedShares = shareDelta?.rejected ?? null;
    result.completedAt = new Date().toISOString();

    if (samples.length === 0) {
      result.status = 'failed';
      result.error = lastSampleError
        ? `No successful TCP latency samples: ${lastSampleError}`
        : 'No successful TCP latency samples';
      return;
    }

    result.status = 'completed';
  }

  private async tryReadShareCounters(mode: SetupMode): Promise<ShareCounters | null> {
    try {
      return await this.dependencies.readShareCounters(mode);
    } catch {
      return null;
    }
  }
}
