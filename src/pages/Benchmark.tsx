import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import {
  AlertTriangle,
  Gauge,
  Loader2,
  Play,
  Square,
  Trophy,
} from 'lucide-react';

import type { BenchmarkPoolResult, BenchmarkPoolStatus, PoolConfig } from '@sv2-ui/shared';
import { Shell } from '@/components/layout/Shell';
import { PoolPriorityEditor } from '@/components/pools/PoolPriorityEditor';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useBenchmark } from '@/hooks/useBenchmark';
import { useConnectionStatus } from '@/hooks/useConnectionStatus';
import { useSetupStatus } from '@/hooks/useSetupStatus';
import { getKnownPoolForConfig, getPoolsForMode } from '@/lib/pools';
import { PoolIcon } from '@/components/ui/pool-icon';

const DURATION_OPTIONS_MINUTES = [1, 5, 10, 30, 60];

function formatDuration(totalSeconds: number): string {
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.ceil((totalSeconds % 3_600) / 60);
  if (hours === 0) return `${minutes} min`;
  if (minutes === 0) return `${hours} hr`;
  return `${hours} hr ${minutes} min`;
}

function formatLatency(value: number | null): string {
  return value === null ? '—' : `${value.toFixed(1)} ms`;
}

function resultBadge(status: BenchmarkPoolStatus): {
  label: string;
  variant: BadgeProps['variant'];
} {
  switch (status) {
    case 'completed':
      return { label: 'Complete', variant: 'success' };
    case 'failed':
      return { label: 'Failed', variant: 'error' };
    case 'cancelled':
      return { label: 'Cancelled', variant: 'secondary' };
    case 'connecting':
      return { label: 'Connecting', variant: 'warning' };
    case 'running':
      return { label: 'Measuring', variant: 'default' };
    default:
      return { label: 'Queued', variant: 'outline' };
  }
}

function endpointKey(pool: PoolConfig): string {
  return `${pool.address.toLowerCase()}:${pool.port}`;
}

export function Benchmark() {
  const [, navigate] = useLocation();
  const {
    status: connectionStatus,
    statusLabel: connectionLabel,
    poolName,
    uptime,
  } = useConnectionStatus();
  const {
    isOrchestrated,
    isConfigured,
    miningMode,
    mode,
  } = useSetupStatus();
  const {
    run,
    config,
    isLoading,
    statusError,
    start,
    stop,
    startMining,
    isStarting,
    isStopping,
    isStartingMining,
    actionError,
  } = useBenchmark();

  const [pools, setPools] = useState<PoolConfig[]>([]);
  const [durationMinutes, setDurationMinutes] = useState(10);
  const [now, setNow] = useState(Date.now());
  const [miningPoolKey, setMiningPoolKey] = useState<string | null>(null);
  const initialized = useRef(false);

  const isSovereignSolo = miningMode === 'solo' && mode === 'jd';
  const isActive = run?.status === 'running' || run?.status === 'stopping';
  const isTerminal = run?.status === 'completed' || run?.status === 'cancelled' || run?.status === 'failed';
  const presets = getPoolsForMode(miningMode, mode);

  useEffect(() => {
    if (initialized.current) return;

    const configuredPools = config?.pool
      ? [config.pool, ...(config.fallbackPools ?? [])]
      : [];
    const initialPools = run?.selectedPools.length ? run.selectedPools : configuredPools;

    if (initialPools.length > 0) {
      setPools(initialPools);
      if (run) {
        setDurationMinutes(Math.max(1, Math.round(run.poolDurationSeconds / 60)));
      }
      initialized.current = true;
    }
  }, [config, run]);

  useEffect(() => {
    if (!isActive) return;
    const interval = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(interval);
  }, [isActive]);

  const currentResult = run?.currentPoolIndex === null || run?.currentPoolIndex === undefined
    ? null
    : run.results[run.currentPoolIndex] ?? null;
  const currentEndsAt = run?.currentPoolEndsAt ? new Date(run.currentPoolEndsAt).getTime() : null;
  const currentStartedAt = run?.currentPoolStartedAt
    ? new Date(run.currentPoolStartedAt).getTime()
    : null;
  const remainingSeconds = currentEndsAt === null
    ? null
    : Math.max(0, Math.ceil((currentEndsAt - now) / 1_000));
  const currentProgress = currentStartedAt !== null && currentEndsAt !== null
    ? Math.min(100, Math.max(0, ((now - currentStartedAt) / (currentEndsAt - currentStartedAt)) * 100))
    : 0;

  const rankedResults = useMemo(() => {
    if (!run) return [];
    if (!isTerminal) return run.results;

    return [...run.results].sort((left, right) => {
      if (left.averageLatencyMs === null && right.averageLatencyMs === null) return 0;
      if (left.averageLatencyMs === null) return 1;
      if (right.averageLatencyMs === null) return -1;
      return left.averageLatencyMs - right.averageLatencyMs;
    });
  }, [isTerminal, run]);

  const handleStart = async () => {
    try {
      await start({
        pools,
        poolDurationSeconds: durationMinutes * 60,
      });
    } catch {
      // Mutation state renders the server error.
    }
  };

  const handleStop = async () => {
    try {
      await stop();
    } catch {
      // Mutation state renders the server error.
    }
  };

  const handleStartMining = async (result: BenchmarkPoolResult) => {
    const key = endpointKey(result.pool);
    setMiningPoolKey(key);
    try {
      await startMining({
        address: result.pool.address,
        port: result.pool.port,
      });
      navigate('/');
    } catch {
      // Mutation state renders the server error.
    } finally {
      setMiningPoolKey(null);
    }
  };

  const error = actionError ?? statusError;

  return (
    <Shell
      connectionStatus={connectionStatus}
      connectionLabel={connectionLabel ?? undefined}
      poolName={poolName ?? undefined}
      uptime={uptime}
    >
      <div className="space-y-6">
        <div>
          <div className="flex items-center gap-2">
            <Gauge className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight">Pool Benchmark</h1>
          </div>
          <p className="mt-2 max-w-3xl text-muted-foreground">
            Compare pools from this machine using average TCP connection latency and
            the shares acknowledged or rejected during equal mining intervals.
          </p>
        </div>

        {!isLoading && (!isOrchestrated || !isConfigured || isSovereignSolo) ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Benchmark unavailable</CardTitle>
              <CardDescription>
                {isSovereignSolo
                  ? 'Sovereign solo mining does not use an external pool, so there is nothing to compare.'
                  : 'Complete the mining setup before selecting pools to benchmark.'}
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <>
            {error && (
              <div className="flex items-start gap-3 rounded-xl border border-red-500/40 bg-red-500/10 px-5 py-4 text-sm text-red-500">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error instanceof Error ? error.message : 'Benchmark request failed'}</span>
              </div>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Benchmark setup</CardTitle>
                <CardDescription>
                  Select at least two pools and drag them into test order. Each duration
                  applies per pool.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {isActive && run ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {run.selectedPools.map((pool, index) => {
                      const knownPool = getKnownPoolForConfig(pool);
                      return (
                        <div
                          key={endpointKey(pool)}
                          className="flex items-center gap-3 rounded-xl border border-border bg-muted/20 p-4"
                        >
                          <PoolIcon
                            logoUrl={knownPool?.logoUrl}
                            logoOnDark={knownPool?.logoOnDark}
                            monogram={knownPool?.monogram}
                            invertLogoInDarkMode={knownPool?.invertLogoInDarkMode}
                            logoScale={knownPool?.logoScale}
                            name={pool.name}
                          />
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium">{pool.name}</div>
                            <div className="text-xs text-muted-foreground">Run {index + 1}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <PoolPriorityEditor
                    presets={presets}
                    pools={pools}
                    miningMode={miningMode}
                    onChange={setPools}
                    priorityLabel={(index) => `Run ${index + 1}`}
                  />
                )}

                <div className="grid gap-4 border-t border-border pt-5 sm:grid-cols-[minmax(0,14rem)_1fr_auto] sm:items-end">
                  <div>
                    <label htmlFor="benchmark-duration" className="mb-2 block text-sm font-medium">
                      Time per pool
                    </label>
                    <select
                      id="benchmark-duration"
                      value={durationMinutes}
                      onChange={(event) => setDurationMinutes(Number(event.target.value))}
                      disabled={isActive}
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:opacity-60"
                    >
                      {DURATION_OPTIONS_MINUTES.map((minutes) => (
                        <option key={minutes} value={minutes}>
                          {minutes === 60 ? '1 hour' : `${minutes} minute${minutes === 1 ? '' : 's'}`}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="text-sm text-muted-foreground">
                    Estimated total: <span className="font-medium text-foreground">
                      {formatDuration(pools.length * durationMinutes * 60)}
                    </span>
                    <div className="mt-1 text-xs">
                      Opening this page downloads nothing. Mining services are only rotated after Start is clicked.
                    </div>
                  </div>

                  {isActive ? (
                    <Button
                      variant="destructive"
                      onClick={() => void handleStop()}
                      disabled={isStopping || run?.status === 'stopping'}
                    >
                      {isStopping || run?.status === 'stopping' ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Square className="mr-2 h-4 w-4" />
                      )}
                      Stop
                    </Button>
                  ) : (
                    <Button
                      onClick={() => void handleStart()}
                      disabled={isStarting || pools.length < 2}
                    >
                      {isStarting ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Play className="mr-2 h-4 w-4" />
                      )}
                      Start benchmark
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            {run && (
              <Card>
                <CardHeader>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <CardTitle className="text-lg">
                        {isActive ? 'Benchmark in progress' : 'Benchmark results'}
                      </CardTitle>
                      <CardDescription className="mt-1">
                        {run.status === 'stopping'
                          ? 'Stopping and restoring the original pool configuration...'
                          : run.status === 'completed'
                            ? 'Ranked by average latency. The original pool order has been restored.'
                            : run.status === 'cancelled'
                              ? 'The run was stopped and the original pool order was restored.'
                              : run.status === 'failed'
                                ? run.error ?? 'The benchmark could not be completed.'
                                : currentResult?.status === 'connecting'
                                  ? `Connecting to ${currentResult.pool.name} and verifying SV2 negotiation...`
                                  : currentResult
                                    ? `Measuring ${currentResult.pool.name}`
                                    : 'Preparing the next pool...'}
                      </CardDescription>
                    </div>
                    {isTerminal && rankedResults.some((result) => result.status === 'completed') && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Trophy className="h-4 w-4 text-primary" />
                        Lowest average latency ranks first
                      </div>
                    )}
                  </div>
                  {isActive && currentEndsAt !== null && (
                    <div className="pt-4">
                      <div className="mb-2 flex justify-between text-xs text-muted-foreground">
                        <span>
                          Pool {(run.currentPoolIndex ?? 0) + 1} of {run.selectedPools.length}
                        </span>
                        <span>{formatDuration(remainingSeconds ?? 0)} remaining</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary transition-[width] duration-500"
                          style={{ width: `${currentProgress}%` }}
                        />
                      </div>
                    </div>
                  )}
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-14">Rank</TableHead>
                        <TableHead>Pool</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Avg latency</TableHead>
                        <TableHead className="text-right">Samples</TableHead>
                        <TableHead className="text-right">Accepted</TableHead>
                        <TableHead className="text-right">Rejected</TableHead>
                        <TableHead className="text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rankedResults.map((result, index) => {
                        const knownPool = getKnownPoolForConfig(result.pool);
                        const badge = resultBadge(result.status);
                        const key = endpointKey(result.pool);
                        const hasRank = isTerminal && result.averageLatencyMs !== null;

                        return (
                          <TableRow key={key}>
                            <TableCell className="font-mono text-muted-foreground">
                              {hasRank ? index + 1 : '—'}
                            </TableCell>
                            <TableCell>
                              <div className="flex min-w-[12rem] items-center gap-3">
                                <PoolIcon
                                  logoUrl={knownPool?.logoUrl}
                                  logoOnDark={knownPool?.logoOnDark}
                                  monogram={knownPool?.monogram}
                                  invertLogoInDarkMode={knownPool?.invertLogoInDarkMode}
                                  logoScale={knownPool?.logoScale}
                                  name={result.pool.name}
                                  className="h-9 w-9"
                                />
                                <div>
                                  <div className="font-medium">{result.pool.name}</div>
                                  <div className="font-mono text-xs text-muted-foreground">
                                    {result.pool.address}:{result.pool.port}
                                  </div>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant={badge.variant}>{badge.label}</Badge>
                              {result.error && (
                                <div className="mt-1 max-w-[16rem] text-xs text-red-500">
                                  {result.error}
                                </div>
                              )}
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              <div className="font-semibold">{formatLatency(result.averageLatencyMs)}</div>
                              {result.averageLatencyMs !== null && (
                                <div className="mt-1 text-[11px] text-muted-foreground">
                                  min {formatLatency(result.minLatencyMs)} · p95 {formatLatency(result.p95LatencyMs)}
                                </div>
                              )}
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              {result.successfulSamples}/{result.attemptedSamples}
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              {result.acceptedShares?.toLocaleString() ?? '—'}
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              {result.rejectedShares?.toLocaleString() ?? '—'}
                            </TableCell>
                            <TableCell className="text-right">
                              {isTerminal && result.status === 'completed' ? (
                                <Button
                                  size="sm"
                                  onClick={() => void handleStartMining(result)}
                                  disabled={isStartingMining}
                                >
                                  {isStartingMining && miningPoolKey === key ? (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                  ) : (
                                    <Play className="mr-2 h-4 w-4" />
                                  )}
                                  Start mining
                                </Button>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                  <p className="mt-4 text-xs text-muted-foreground">
                    Accepted means acknowledged by the upstream pool. Average, minimum, and p95 are
                    TCP connection samples from the SV2 UI backend; they are not share-ack round-trip times.
                  </p>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </Shell>
  );
}
