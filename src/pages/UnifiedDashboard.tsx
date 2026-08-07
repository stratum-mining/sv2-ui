import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Search, Play, Trash2 } from 'lucide-react';
import { Alert, AlertTitle } from '@/components/ui/alert';
import { InfoPopover } from '@/components/ui/info-popover';
import { MinerConnectionInfo } from '@/components/setup/MinerConnectionInfo';
import { Shell } from '@/components/layout/Shell';
import { StatCard } from '@/components/data/StatCard';
import { HashrateChart, type TimeRange } from '@/components/data/HashrateChart';

import {
  DownstreamWorkerTable,
  type ChannelType,
  type DownstreamWorkerRow,
  type DownstreamWorkerSortKey,
} from '@/components/data/DownstreamWorkerTable';
import {
  usePoolData,
  useSv1ClientsData,
  useTranslatorServerChannels,
  useTranslatorHealth,
  useJdcHealth,
} from '@/hooks/usePoolData';
import { useHashrateHistory } from '@/hooks/useHashrateHistory';
import {
  usePersistentBestDifficulty,
  usePersistentBlocksFound,
  usePersistentShareStats,
} from '@/hooks/usePersistentDashboardMetrics';
import { isAggregatedTproxyPoolName } from '@/components/setup/poolRules';
import { useSetupStatus } from '@/hooks/useSetupStatus';
import { useConnectionStatus } from '@/hooks/useConnectionStatus';
import { useLogDiagnostics } from '@/hooks/useLogDiagnostics';
import { clearDashboardClientState } from '@/lib/dashboardState';
import { resolveMinerHashrate } from '@/lib/minerTelemetry';
import { formatHashrate, formatDifficulty, formatNumber } from '@/lib/utils';
import type { Sv1ClientInfo } from '@/types/api';

const RANGE_MS: Record<TimeRange, number> = { '5m': 5 * 60_000, '15m': 15 * 60_000, '1h': 60 * 60_000 };
const RANGE_DESCRIPTIONS: Record<TimeRange, string> = {
  '5m': 'Last 5 minutes · sampled every 5 seconds',
  '15m': 'Last 15 minutes · sampled every 5 seconds',
  '1h': 'Last hour · sampled every 5 seconds',
};
const BITCOIN_CORE_VERSION_MISMATCH_CODE = 'jdc-bitcoin-core-unsupported-mining-interface';
const BITCOIN_CORE_DISCONNECTED_CODE = 'jdc-bitcoin-core-disconnected';
const SETUP_TARGET_STEP_STORAGE_KEY = 'sv2-ui-setup-target-step';
const SETUP_REVIEW_STORAGE_KEY = 'sv2-ui-setup-review';

/**
 * Unified Dashboard for the SV2 Mining Stack.
 * 
 * This dashboard presents a single, consistent view regardless of deployment:
 * - Non-JD mode: Pool ← Translator ← SV1 Clients
 * - JD mode: Pool ← JDC ← Translator ← SV1 Clients
 * 
 * The "Pool data" (shares, hashrate, channels) always comes from:
 * - JDC's upstream (if JD mode)
 * - Translator's upstream (if non-JD mode)
 * 
 * Worker data source depends on deployment mode, but all modes render the same
 * downstream worker table shape:
 * - Connection Id
 * - Channel Id
 * - Channel Type
 * - Username / Identity
 */
export function UnifiedDashboard() {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [sortKey, setSortKey] = useState<DownstreamWorkerSortKey>('connection_id');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [timeRange, setTimeRange] = useState<TimeRange>('5m');
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const itemsPerPage = 15;

  // Get configured template mode from setup status
  const {
    isOrchestrated,
    isConfigured,
    isRunning,
    autoStarting,
    miningMode,
    mode: templateMode,
    poolName: configPoolName,
    configurationIssues,
  } = useSetupStatus();

  // Header connection status (shared with Settings via hook)
  const { status: connectionStatus, statusLabel: connectionLabel, poolName, uptime } = useConnectionStatus();
  const isSovereignSolo = miningMode === 'solo' && templateMode === 'jd';

  // Data from JDC or Translator depending on configured mode
  const {
    isJdMode,
    global: poolGlobal,
    sv2Clients,
    isSv2ClientsLoading,
    serverChannels,  // Upstream server channels (for shares to Pool)
    isLoading: poolLoading,
    isError: poolError,
  } = usePoolData(templateMode);
  const { data: translatorServerChannels } = useTranslatorServerChannels(isJdMode);
  const sv1ServerChannels = isJdMode ? translatorServerChannels : serverChannels;
  const isAggregatedTproxy = !isJdMode && isAggregatedTproxyPoolName(configPoolName);

  // SV1 clients (always from Translator)
  const {
    data: sv1Data,
    isLoading: sv1Loading,
  } = useSv1ClientsData(0, 1000);

  // Health checks for the error banner (React Query deduplicates the API calls)
  const { data: translatorOk, isLoading: translatorHealthLoading, isError: translatorHealthError } = useTranslatorHealth();
  const { data: jdcOk, isLoading: jdcHealthLoading, isError: jdcHealthError } = useJdcHealth(isJdMode);
  const translatorHealthy = translatorOk === true && !translatorHealthError;
  const jdcHealthy = jdcOk === true && !jdcHealthError;
  const translatorDown = !translatorHealthLoading && !translatorHealthy;
  const jdcDown = isJdMode && !jdcHealthLoading && !jdcHealthy;
  const showError = poolError || translatorDown || jdcDown;
  const configuredButStopped = isOrchestrated && isConfigured && !isRunning;
  const configurationIssue = configurationIssues[0] ?? null;
  const canReviewConfiguration = configurationIssue?.code !== 'saved-setup-unavailable';
  const canResetConfiguration = configurationIssue?.code === 'saved-setup-unavailable';

  // log-derived diagnostics from the API
  const { data: logDiagnostics } = useLogDiagnostics();
  const diagnostics = logDiagnostics?.diagnostics ?? [];

  const [isStarting, setIsStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  const handleStartMining = async () => {
    setIsStarting(true);
    setStartError(null);
    try {
      const response = await fetch('/api/restart', {
        method: 'POST',
        signal: AbortSignal.timeout(300_000),
      });
      const responseData = await response.json().catch(() => ({})) as {
        error?: string;
        message?: string;
        success?: boolean;
      };

      if (!response.ok || responseData.success === false) {
        throw new Error(
          responseData.error ||
          responseData.message ||
          `Failed to start mining (${response.status})`
        );
      }

      // Give containers time to start, then refresh health checks.
      setTimeout(() => {
        window.location.reload();
      }, 3000);
    } catch (error) {
      console.error('Failed to start mining:', error);
      if (error instanceof Error) {
        if (error.name === 'AbortError' || error.name === 'TimeoutError') {
          setStartError('Request timed out. The containers may still be starting.');
        } else if (error.message.includes('fetch') || error.message.includes('Network')) {
          setStartError('Cannot reach the server. Make sure the backend is running.');
        } else {
          setStartError(error.message);
        }
      } else {
        setStartError('Failed to start mining.');
      }
      setIsStarting(false);
    }
  };

  const handleResetSetup = async () => {
    setIsResetting(true);
    setResetError(null);

    try {
      const response = await fetch('/api/reset', { method: 'POST' });
      const responseData = await response.json().catch(() => ({})) as {
        error?: string;
        success?: boolean;
      };

      if (!response.ok || responseData.success === false) {
        throw new Error(responseData.error || 'Could not reset setup.');
      }

      clearDashboardClientState(queryClient);
      window.location.href = '/setup';
    } catch (error) {
      console.error('Reset setup failed:', error);
      setResetError(error instanceof Error ? error.message : 'Could not reset setup.');
      setIsResetting(false);
    }
  };

  // Translator SV1 worker stats
  const allSv1Clients = useMemo(() => sv1Data?.items || [], [sv1Data?.items]);
  const directSv2Clients = useMemo(
    () => sv2Clients?.filter((client) => client.client_kind !== 'translator_proxy') || [],
    [sv2Clients]
  );
  const activeSv1Clients = useMemo(
    () => allSv1Clients.filter((client: Sv1ClientInfo) =>
      resolveMinerHashrate(client.miner_telemetry, client.hashrate).hashrate !== null
    ),
    [allSv1Clients]
  );
  const sv1TotalClients = sv1Data?.total || 0;
  const sv1ActiveCount = activeSv1Clients.length;

  // Calculate total hashrate from SV1 clients
  const sv1TotalHashrate = useMemo(() => {
    return allSv1Clients.reduce((sum, client) => {
      const { hashrate } = resolveMinerHashrate(client.miner_telemetry, client.hashrate);
      return sum + (hashrate ?? 0);
    }, 0);
  }, [allSv1Clients]);

  const sv2TotalHashrate = useMemo(() => {
    if (!sv2Clients) return undefined;

    return directSv2Clients.reduce((sum, client) => {
      const { hashrate } = resolveMinerHashrate(
        client.miner_telemetry,
        client.total_hashrate
      );
      return sum + (hashrate ?? 0);
    }, 0);
  }, [directSv2Clients, sv2Clients]);

  // All worker flows are normalized into the shared downstream worker table.
  const downstreamWorkers = useMemo<DownstreamWorkerRow[]>(() => {
    if (!sv2Clients) return [];

    return directSv2Clients.flatMap((client) => [
      ...client.extended_channels.map((channel) => {
        const resolvedHashrate = resolveMinerHashrate(
          client.miner_telemetry,
          channel.nominal_hashrate
        );

        return {
          connection_id: client.client_id,
          channel_id: channel.channel_id,
          channel_type: 'sv2_extended' as const,
          identity: channel.user_identity,
          management_ip: client.management_ip,
          miner_telemetry_status: client.miner_telemetry_status,
          miner_telemetry: client.miner_telemetry,
          client_kind: client.client_kind,
          estimated_hashrate: resolvedHashrate.hashrate,
          hashrate_source: resolvedHashrate.source,
          best_diff: channel.best_diff,
        };
      }),
      ...client.standard_channels.map((channel) => {
        const resolvedHashrate = resolveMinerHashrate(
          client.miner_telemetry,
          channel.nominal_hashrate
        );

        return {
          connection_id: client.client_id,
          channel_id: channel.channel_id,
          channel_type: 'sv2_standard' as const,
          identity: channel.user_identity,
          management_ip: client.management_ip,
          miner_telemetry_status: client.miner_telemetry_status,
          miner_telemetry: client.miner_telemetry,
          client_kind: client.client_kind,
          estimated_hashrate: resolvedHashrate.hashrate,
          hashrate_source: resolvedHashrate.source,
          best_diff: channel.best_diff,
        };
      }),
    ]);
  }, [directSv2Clients, sv2Clients]);

  const directSv2WorkerCount = downstreamWorkers.length;
  const jdWorkerCount = directSv2WorkerCount + sv1TotalClients;
  const jdActiveWorkerCount = directSv2WorkerCount + sv1ActiveCount;
  const totalWorkers = isJdMode ? jdWorkerCount : sv1TotalClients;
  const activeWorkers = isJdMode ? jdActiveWorkerCount : sv1ActiveCount;
  const workerTableLoading = isJdMode ? (isSv2ClientsLoading || sv1Loading) : sv1Loading;

  // Total hashrate:
  // - JD mode: from SV2 client telemetry when available, falling back to vardiff totals
  // - Translator-only mode: from SV1 client telemetry when available, falling back to vardiff totals
  const totalHashrate = isJdMode
    ? (sv2Clients && sv1Data
      ? (sv2TotalHashrate ?? 0) + sv1TotalHashrate
      : (poolGlobal?.sv2_clients?.total_hashrate ?? 0))
    : (sv1Data ? sv1TotalHashrate : (poolGlobal?.sv1_clients?.total_hashrate ?? 0));

  // Scope hashrate history to the active pool + mode so stale samples from a
  // previous configuration are never shown after a reconfigure.
  // Falls back to 'default' while setup status is still loading or in
  // standalone mode (no orchestration backend).
  const historyConfigKey = [templateMode, configPoolName].filter(Boolean).join(':') || 'default';

  // Build hashrate history from real-time data.
  // Pass undefined until pool data has actually loaded to prevent injecting
  // a false zero into persisted history on page refresh (see issue #57).
  const hashrateForHistory = poolGlobal ? totalHashrate : undefined;
  const hashrateHistory = useHashrateHistory(hashrateForHistory, historyConfigKey);

  // Filter history to the selected time range for chart display
  const filteredHistory = useMemo(() => {
    const cutoff = Date.now() - RANGE_MS[timeRange];
    return hashrateHistory.filter(p => p.timestamp > cutoff);
  }, [hashrateHistory, timeRange]);

  const blocksFoundEntries = useMemo(() => {
    if (isJdMode) {
      if (!sv2Clients) return [];

      return directSv2Clients.flatMap((client) => [
        ...client.extended_channels.map((channel) => ({
          key: `jdc:${client.client_id}:extended:${channel.channel_id}:${channel.user_identity}`,
          value: channel.blocks_found,
        })),
        ...client.standard_channels.map((channel) => ({
          key: `jdc:${client.client_id}:standard:${channel.channel_id}:${channel.user_identity}`,
          value: channel.blocks_found,
        })),
      ]);
    }

    if (!serverChannels) return [];

    return [
      ...serverChannels.extended_channels.map((channel) => ({
        key: `translator:server:extended:${channel.channel_id}:${channel.user_identity}`,
        value: channel.blocks_found,
      })),
      ...serverChannels.standard_channels.map((channel) => ({
        key: `translator:server:standard:${channel.channel_id}:${channel.user_identity}`,
        value: channel.blocks_found,
      })),
    ];
  }, [directSv2Clients, isJdMode, serverChannels, sv2Clients]);

  const bestDiffEntries = useMemo(() => {
    const sv1BestDiffEntries = sv1ServerChannels ? [
      ...sv1ServerChannels.extended_channels.map((channel) => ({
        key: `translator:server:extended:${channel.channel_id}:${channel.user_identity}`,
        value: channel.best_diff,
      })),
      ...sv1ServerChannels.standard_channels.map((channel) => ({
        key: `translator:server:standard:${channel.channel_id}:${channel.user_identity}`,
        value: channel.best_diff,
      })),
    ] : [];

    if (!isJdMode || !sv2Clients) return sv1BestDiffEntries;

    return [
      ...directSv2Clients.flatMap((client) => [
        ...client.extended_channels.map((channel) => ({
          key: `jdc:${client.client_id}:extended:${channel.channel_id}:${channel.user_identity}`,
          value: channel.best_diff,
        })),
        ...client.standard_channels.map((channel) => ({
          key: `jdc:${client.client_id}:standard:${channel.channel_id}:${channel.user_identity}`,
          value: channel.best_diff,
        })),
      ]),
      ...sv1BestDiffEntries,
    ];
  }, [directSv2Clients, isJdMode, sv1ServerChannels, sv2Clients]);

  const sv1BestDiffByChannelId = useMemo(() => {
    const bestDiffByChannelId = new Map<number, number>();

    if (!sv1ServerChannels) return bestDiffByChannelId;

    [...sv1ServerChannels.extended_channels, ...sv1ServerChannels.standard_channels].forEach((channel) => {
      const currentBestDiff = bestDiffByChannelId.get(channel.channel_id) ?? 0;
      bestDiffByChannelId.set(channel.channel_id, Math.max(currentBestDiff, channel.best_diff));
    });

    return bestDiffByChannelId;
  }, [sv1ServerChannels]);

  const shareStatsEntries = useMemo(() => {
    if (!serverChannels) return [];

    const source = isJdMode ? 'jdc' : 'translator';
    return [
      ...serverChannels.extended_channels.map((channel) => ({
        key: `${source}:server:extended:${channel.channel_id}:${channel.user_identity}`,
        acknowledged: channel.shares_acknowledged,
        submitted: channel.shares_submitted,
        rejected: channel.shares_rejected,
        rejectedByReason: channel.shares_rejected_by_reason,
      })),
      ...serverChannels.standard_channels.map((channel) => ({
        key: `${source}:server:standard:${channel.channel_id}:${channel.user_identity}`,
        acknowledged: channel.shares_acknowledged,
        submitted: channel.shares_submitted,
        rejected: channel.shares_rejected,
        rejectedByReason: channel.shares_rejected_by_reason,
      })),
    ];
  }, [isJdMode, serverChannels]);
  const blocksFound = usePersistentBlocksFound(blocksFoundEntries, historyConfigKey);
  const bestDiff = usePersistentBestDifficulty(bestDiffEntries, historyConfigKey);
  const shareStats = usePersistentShareStats(shareStatsEntries, historyConfigKey);

  const hasBestDiffSource = isJdMode
    ? !!sv2Clients || !!sv1ServerChannels
    : !!sv1ServerChannels;

  useEffect(() => {
    if (isAggregatedTproxy && sortKey === 'best_diff') {
      setSortKey('connection_id');
      setSortDir('asc');
    }
  }, [isAggregatedTproxy, sortKey]);

  type DashboardWorkerRow = DownstreamWorkerRow & { search_text: string };

  const sv1WorkerRows = useMemo<DashboardWorkerRow[]>(() => {
    return allSv1Clients.map((client) => {
      const resolvedHashrate = resolveMinerHashrate(client.miner_telemetry, client.hashrate);

      return {
        connection_id: client.client_id,
        channel_id: client.channel_id ?? null,
        channel_type: 'sv1' as ChannelType,
        identity: client.sv1_username,
        management_ip: client.management_ip,
        miner_telemetry_status: client.miner_telemetry_status,
        miner_telemetry: client.miner_telemetry,
        estimated_hashrate: resolvedHashrate.hashrate,
        hashrate_source: resolvedHashrate.source,
        best_diff: client.channel_id === null || client.channel_id === undefined
          ? null
          : (sv1BestDiffByChannelId.get(client.channel_id) ?? null),
        search_text: [
          client.sv1_username,
          client.sv1_worker_name,
          client.management_ip || '',
          client.miner_telemetry_status || '',
          client.miner_telemetry?.make || '',
          client.miner_telemetry?.model || '',
          client.miner_telemetry?.firmware_version || '',
          client.client_id.toString(),
          client.channel_id?.toString() || '',
          'sv1',
        ].join(' ').toLowerCase(),
      };
    });
  }, [allSv1Clients, sv1BestDiffByChannelId]);

  const dashboardWorkers = useMemo<DashboardWorkerRow[]>(() => {
    if (isJdMode) {
      return [
        ...downstreamWorkers.map((worker) => ({
          ...worker,
          search_text: [
            worker.identity,
            worker.management_ip || '',
            worker.miner_telemetry_status || '',
            worker.miner_telemetry?.make || '',
            worker.miner_telemetry?.model || '',
            worker.miner_telemetry?.firmware_version || '',
            worker.client_kind || '',
            worker.connection_id.toString(),
            worker.channel_id?.toString() || '',
            worker.channel_type,
          ].join(' ').toLowerCase(),
        })),
        ...sv1WorkerRows,
      ];
    }

    return sv1WorkerRows;
  }, [isJdMode, downstreamWorkers, sv1WorkerRows]);

  const filteredWorkers = useMemo(() => {
    let list = dashboardWorkers;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      list = dashboardWorkers.filter((worker) => worker.search_text.includes(term));
    }

    const nullLast = sortDir === 'asc' ? Infinity : -Infinity;
    return [...list].sort((a, b) => {
      const av = a[sortKey] ?? nullLast;
      const bv = b[sortKey] ?? nullLast;
      if (typeof av === 'string' && typeof bv === 'string') {
        return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [dashboardWorkers, searchTerm, sortKey, sortDir]);

  const filteredCount = filteredWorkers.length;
  const totalPages = Math.max(1, Math.ceil(filteredCount / itemsPerPage));

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  // Pagination
  const paginatedWorkers = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredWorkers.slice(start, start + itemsPerPage);
  }, [filteredWorkers, currentPage, itemsPerPage]);

  return (
    <Shell
      appMode="translator"
      connectionStatus={connectionStatus}
      connectionLabel={connectionLabel ?? undefined}
      poolName={poolName ?? undefined}
      uptime={uptime}
    >

      {/* Configuration recovery banner. This takes precedence over starting
          services because the backend deliberately keeps the stack stopped
          until all required setup inputs are available. */}
      {configurationIssue && (
        <div className="flex flex-col gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-5 py-4 text-sm text-amber-500 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="flex flex-col gap-1">
              <span className="font-medium">{configurationIssue.title}</span>
              <span>{configurationIssue.message}</span>
            </div>
          </div>
          {canReviewConfiguration && (
            <Link
              href="/setup"
              onClick={() => window.sessionStorage.setItem(SETUP_REVIEW_STORAGE_KEY, 'true')}
              className="inline-flex h-9 shrink-0 items-center justify-center rounded-full bg-amber-500 px-4 font-medium text-black transition-colors hover:bg-amber-400 sm:ml-4"
            >
              Continue setup
            </Link>
          )}
          {canResetConfiguration && (
            <button
              type="button"
              onClick={() => {
                setResetError(null);
                setIsResetConfirmOpen(true);
              }}
              className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-full bg-amber-500 px-4 font-medium text-black transition-colors hover:bg-amber-400 sm:ml-4"
            >
              <Trash2 className="h-4 w-4" />
              Reset setup
            </button>
          )}
        </div>
      )}

      {isResetConfirmOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 px-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="reset-setup-title"
        >
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-xl">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 rounded-full bg-red-500/10 p-2 text-red-500">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div className="space-y-2">
                <h2 id="reset-setup-title" className="text-base font-semibold">
                  Reset setup?
                </h2>
                <p className="text-sm text-muted-foreground">
                  This deletes the saved setup and generated service files. Mining services will stop, and setup will start from the beginning.
                </p>
                {resetError && (
                  <p className="text-sm text-red-500">{resetError}</p>
                )}
              </div>
            </div>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setIsResetConfirmOpen(false)}
                disabled={isResetting}
                className="inline-flex h-9 items-center justify-center rounded-full border border-border px-4 text-sm font-medium transition-colors hover:bg-accent disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleResetSetup}
                disabled={isResetting}
                className="inline-flex h-9 items-center justify-center gap-2 rounded-full bg-red-500 px-4 text-sm font-medium text-white transition-colors hover:bg-red-600 disabled:opacity-50"
              >
                {isResetting && (
                  <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                )}
                Reset setup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Start Mining Banner (configured but stopped) */}
      {!configurationIssue && configuredButStopped && showError && (
        <Alert
          variant="warning"
          className="items-center [&>span]:mt-0"
          icon={autoStarting || isStarting ? (
            <div className="h-4 w-4 border-2 border-yellow-500/30 border-t-yellow-500 rounded-full animate-spin" />
          ) : (
            <Play className="h-4 w-4 shrink-0" />
          )}
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>
              {autoStarting
                ? 'Mining services are starting...'
                : isStarting
                  ? 'Starting mining services...'
                  : 'Mining services are stopped.'}
            </span>
            {!autoStarting && !isStarting && (
              <button
                onClick={handleStartMining}
                disabled={isStarting}
                className="flex h-9 items-center gap-2 self-start rounded-full bg-yellow-500 px-4 font-medium text-white transition-colors hover:bg-yellow-600 disabled:opacity-50 sm:self-auto"
              >
                Start Mining
              </button>
            )}
          </div>
        </Alert>
      )}

      {/* Connection Error Banner (not configured or unknown error) */}
      {!configurationIssue && (startError || (showError && !configuredButStopped && diagnostics.length === 0)) && (
        <Alert variant="destructive">
          <p>
            {startError || 'Cannot connect to pool. Make sure mining services are running.'}
          </p>
        </Alert>
      )}

      {/* log-derived Diagnostic Banners */}
      {diagnostics.map((diagnostic) => {
        const showBitcoinSetupButton =
          diagnostic.code === BITCOIN_CORE_VERSION_MISMATCH_CODE ||
          diagnostic.code === BITCOIN_CORE_DISCONNECTED_CODE;

        return (
          <Alert
            key={diagnostic.code}
            variant={diagnostic.severity === 'error' ? 'destructive' : 'warning'}
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-col gap-1">
                <AlertTitle>{diagnostic.title}</AlertTitle>
                <span>{diagnostic.message}</span>
                {diagnostic.recommendation && (
                  <span className="text-current/80">{diagnostic.recommendation}</span>
                )}
              </div>
              {showBitcoinSetupButton && (
                <Link
                  href="/setup"
                  onClick={() => window.sessionStorage.setItem(SETUP_TARGET_STEP_STORAGE_KEY, 'bitcoin')}
                  className="inline-flex h-9 shrink-0 items-center justify-center rounded-full bg-red-600 px-4 font-medium text-white transition-colors hover:bg-red-700 sm:ml-4"
                >
                  Open Bitcoin Setup
                </Link>
              )}
            </div>
          </Alert>
        );
      })}

      {/* Hero Stats Section */}
      <div className={isSovereignSolo ? 'grid gap-4 md:grid-cols-2 lg:grid-cols-4' : 'grid gap-4 md:grid-cols-2 lg:grid-cols-5'}>
        <StatCard
          title="Total Hashrate"
          value={formatHashrate(totalHashrate)}
          info={
            <InfoPopover>
              Uses miner-reported telemetry when available. Otherwise falls back to the proxy's
              vardiff estimate from submitted shares.
            </InfoPopover>
          }
        />

        <StatCard
          title={isJdMode ? 'Connected Workers' : 'Active Workers'}
          value={
            isJdMode ? (
              activeWorkers.toLocaleString()
            ) : (
              <span>
                {activeWorkers} <span className="text-muted-foreground text-lg">/ {totalWorkers}</span>
              </span>
            )
          }
        />

        <StatCard
          title="Blocks Found"
          value={blocksFound.toLocaleString()}
        />

        {!isSovereignSolo && (
          <StatCard
            title="Share Acceptance"
            info={
              shareStats.rejected > 0 ? (
                <InfoPopover
                  ariaLabel="Share rejection details"
                  className="w-96 max-w-[calc(100vw-2rem)]"
                >
                  <div className="space-y-3">
                    <div>
                      <p className="font-medium text-foreground">Rejection details</p>
                      <p className="mt-1 text-xs">
                        SubmitSharesError error-code counts reported by the upstream channel
                        monitoring API.
                      </p>
                    </div>

                    {shareStats.rejectionReasons.length > 0 ? (
                      <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                        {shareStats.rejectionReasons.map(({ reason, count }) => {
                          const percentage = (count / shareStats.rejected) * 100;
                          return (
                            <div key={reason} className="rounded-lg bg-muted/45 px-3 py-2">
                              <div className="flex items-start justify-between gap-3 text-xs">
                                <span className="min-w-0 break-all font-mono text-foreground">
                                  {reason}
                                </span>
                                <span className="shrink-0 whitespace-nowrap font-mono text-muted-foreground">
                                  {formatNumber(count)} · {percentage.toFixed(1)}%
                                </span>
                              </div>
                            </div>
                          );
                        })}
                        {shareStats.unclassifiedRejected > 0 && (
                          <div className="rounded-lg bg-muted/45 px-3 py-2">
                            <div className="flex items-start justify-between gap-3 text-xs">
                              <span className="min-w-0 break-all font-mono text-foreground">
                                unknown
                              </span>
                              <span className="shrink-0 whitespace-nowrap font-mono text-muted-foreground">
                                {formatNumber(shareStats.unclassifiedRejected)}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="rounded-lg bg-muted/45 px-3 py-2 text-xs">
                        This sv2-apps image reports rejected shares, but not rejection-code counts
                        yet.
                      </p>
                    )}
                  </div>
                </InfoPopover>
              ) : undefined
            }
            value={(() => {
              const { submitted, rejected } = shareStats;
              if (submitted === 0) return <span className="text-muted-foreground">—</span>;

              const rate = ((submitted - rejected) / submitted) * 100;
              const label = rejected === 0
                ? '100%'
                : `${Math.min(rate, 99.99).toFixed(2)}%`;

              const colorClass = rejected === 0
                ? 'text-green-500'
                : rate >= 99
                  ? ''
                  : rate >= 95
                    ? 'text-yellow-500'
                    : 'text-red-500';

              return <span className={colorClass}>{label}</span>;
            })()}
            subtitle={(() => {
              const { submitted, rejected } = shareStats;
              if (submitted === 0) return undefined;
              const rejectionRate = (rejected / submitted) * 100;
              const rejRateLabel = rejected === 0
                ? '0%'
                : `${Math.max(rejectionRate, 0.01).toFixed(2)}%`;
              return `${submitted.toLocaleString()} submitted · ${rejected.toLocaleString()} rejected (${rejRateLabel})`;
            })()}
          />
        )}

        <StatCard
          title="Best Difficulty"
          value={hasBestDiffSource ? formatDifficulty(bestDiff) : '-'}
        />
      </div>

      {/* Miner Connection Info */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-widest mb-3">Point your miners to</h2>
        <MinerConnectionInfo isJdMode={isJdMode} />
      </div>

      {/* Main Chart - Real data accumulated over time */}
      <HashrateChart
        data={filteredHistory}
        title="Hashrate History"
        description={RANGE_DESCRIPTIONS[timeRange]}
        timeRange={timeRange}
        onTimeRangeChange={setTimeRange}
        info={
          <InfoPopover>
            Uses miner-reported telemetry when available. Otherwise falls back to the proxy's
            vardiff estimate from submitted shares.
          </InfoPopover>
        }
      />

      {/* Loading State */}
      {poolLoading && (
        <div className="glass-table shadow-sm p-8 text-center text-muted-foreground">
          Connecting to monitoring API...
        </div>
      )}

      {/* Actions Bar */}
      {!poolLoading && (
        <div className="flex items-center gap-2">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search workers or connections..."
              className="w-full pl-9 h-9 rounded-lg border border-border bg-muted/50 text-sm outline-none transition-all focus:bg-background focus:ring-2 focus:ring-primary/20"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
            />
          </div>
        </div>
      )}

      {/* Workers Table */}
      {!poolLoading && (
        <>
          <DownstreamWorkerTable
            workers={paginatedWorkers}
            isLoading={workerTableLoading}
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={(key) => {
              if (key === sortKey) setSortDir((dir) => dir === 'asc' ? 'desc' : 'asc');
              else { setSortKey(key); setSortDir('asc'); }
              setCurrentPage(1);
            }}
            showBestDiff={!isAggregatedTproxy}
          />

          {/* Pagination Footer */}
          {filteredCount > itemsPerPage && (
            <div className="flex items-center justify-between mt-4">
              <div className="text-sm text-muted-foreground">
                Showing {paginatedWorkers.length} of {filteredCount} workers
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-1.5 text-sm rounded-lg border border-border hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
                >
                  Previous
                </button>
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1.5 text-sm rounded-lg border border-border hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </Shell>
  );
}