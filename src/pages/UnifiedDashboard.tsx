import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Search, Play } from 'lucide-react';
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
  useTranslatorHealth,
  useJdcHealth,
  useTranslatorServerChannels,
} from '@/hooks/usePoolData';
import { useHashrateHistory } from '@/hooks/useHashrateHistory';
import {
  usePersistentBestDifficulty,
  usePersistentBlocksFound,
} from '@/hooks/usePersistentBlocksFound';
import { isAggregatedTproxyPoolName } from '@/components/setup/poolRules';
import { useSetupStatus } from '@/hooks/useSetupStatus';
import { useConnectionStatus } from '@/hooks/useConnectionStatus';
import { useLogDiagnostics } from '@/hooks/useLogDiagnostics';
import { formatHashrate, formatDifficulty } from '@/lib/utils';
import type { Sv1ClientInfo } from '@/types/api';

const RANGE_MS: Record<TimeRange, number> = { '5m': 5 * 60_000, '15m': 15 * 60_000, '1h': 60 * 60_000 };
const RANGE_DESCRIPTIONS: Record<TimeRange, string> = {
  '5m': 'Last 5 minutes · sampled every 5 seconds',
  '15m': 'Last 15 minutes · sampled every 5 seconds',
  '1h': 'Last hour · sampled every 5 seconds',
};

function normalizeUserIdentity(userIdentity: string) {
  return userIdentity.trim().toLowerCase();
}

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
 * - User Identity
 */
export function UnifiedDashboard() {
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [sortKey, setSortKey] = useState<DownstreamWorkerSortKey>('connection_id');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [timeRange, setTimeRange] = useState<TimeRange>('5m');
  const itemsPerPage = 15;

  // Get configured template mode from setup status
  const {
    isOrchestrated,
    isConfigured,
    isRunning,
    miningMode,
    mode: templateMode,
    poolName: configPoolName,
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
  const isAggregatedTproxy = !isJdMode && isAggregatedTproxyPoolName(configPoolName);

  // SV1 clients (always from Translator)
  const {
    data: sv1Data,
    isLoading: sv1Loading,
  } = useSv1ClientsData(0, 1000, !isJdMode); // Translator-only rows for the shared worker table

  const { data: translatorServerChannels } = useTranslatorServerChannels(isJdMode);

  // Health checks for the error banner (React Query deduplicates the API calls)
  const { data: translatorOk, isLoading: translatorHealthLoading, isError: translatorHealthError } = useTranslatorHealth();
  const { data: jdcOk, isLoading: jdcHealthLoading, isError: jdcHealthError } = useJdcHealth(isJdMode);
  const translatorHealthy = translatorOk === true && !translatorHealthError;
  const jdcHealthy        = jdcOk === true && !jdcHealthError;
  const translatorDown    = !translatorHealthLoading && !translatorHealthy;
  const jdcDown           = isJdMode && !jdcHealthLoading && !jdcHealthy;
  const showError         = poolError || translatorDown || jdcDown;
  const configuredButStopped = isOrchestrated && isConfigured && !isRunning;

  // log-derived diagnostics from the API
  const { data: logDiagnostics } = useLogDiagnostics();
  const diagnostics = logDiagnostics?.diagnostics ?? [];
  const [isStarting, setIsStarting] = useState(false);

  const handleStartMining = async () => {
    setIsStarting(true);
    try {
      const response = await fetch('/api/restart', { method: 'POST' });
      if (response.ok) {
        // Give containers time to start, then refresh health checks
        setTimeout(() => {
          window.location.reload();
        }, 3000);
      }
    } catch (error) {
      console.error('Failed to start mining:', error);
      setIsStarting(false);
    }
  };

  // Translator SV1 worker stats
  const allSv1Clients = useMemo(() => sv1Data?.items || [], [sv1Data?.items]);
  const activeSv1Clients = useMemo(
    () => allSv1Clients.filter((client: Sv1ClientInfo) => client.hashrate !== null),
    [allSv1Clients]
  );
  const sv1TotalClients = sv1Data?.total || 0;
  const sv1ActiveCount = activeSv1Clients.length;

  // Calculate total hashrate from SV1 clients
  const sv1TotalHashrate = useMemo(() => {
    return allSv1Clients.reduce((sum, client) => sum + (client.hashrate || 0), 0);
  }, [allSv1Clients]);

  const translatedUserIdentities = useMemo(
    () => new Set(
      translatorServerChannels?.extended_channels
        .map((channel) => normalizeUserIdentity(channel.user_identity))
        .filter(Boolean) || []
    ),
    [translatorServerChannels]
  );

  const translatedConnectionIds = useMemo(() => {
    if (!isJdMode || !sv2Clients || translatedUserIdentities.size === 0) {
      return new Set<number>();
    }

    const candidates = sv2Clients
      .map((client) => {
        const matchedExtendedChannels = client.extended_channels.filter((channel) =>
          translatedUserIdentities.has(normalizeUserIdentity(channel.user_identity))
        ).length;

        return {
          client_id: client.client_id,
          matchedExtendedChannels,
          totalExtendedChannels: client.extended_channels.length,
        };
      })
      .filter((client) => client.matchedExtendedChannels > 0)
      .sort((a, b) =>
        b.matchedExtendedChannels - a.matchedExtendedChannels ||
        b.totalExtendedChannels - a.totalExtendedChannels
      );

    if (candidates.length === 0) {
      return new Set<number>();
    }

    if (candidates.length > 1) {
      const [best, second] = candidates;
      const ambiguous =
        best.matchedExtendedChannels === second.matchedExtendedChannels &&
        best.totalExtendedChannels === second.totalExtendedChannels;

      if (ambiguous) {
        return new Set<number>();
      }
    }

    return new Set<number>([candidates[0].client_id]);
  }, [isJdMode, sv2Clients, translatedUserIdentities]);

  // All worker flows are normalized into the shared downstream worker table.
  const downstreamWorkers = useMemo<DownstreamWorkerRow[]>(() => {
    if (!sv2Clients) return [];

    return sv2Clients.flatMap((client) => [
      ...client.extended_channels.map((channel) => ({
        connection_id: client.client_id,
        channel_id: channel.channel_id,
        channel_type: translatedConnectionIds.has(client.client_id)
          ? 'sv1' as const
          : 'sv2_extended' as const,
        user_identity: channel.user_identity,
        estimated_hashrate: channel.nominal_hashrate,
        best_diff: channel.best_diff,
      })),
      ...client.standard_channels.map((channel) => ({
        connection_id: client.client_id,
        channel_id: channel.channel_id,
        channel_type: 'sv2_standard' as const,
        user_identity: channel.user_identity,
        estimated_hashrate: channel.nominal_hashrate,
        best_diff: channel.best_diff,
      })),
    ]);
  }, [sv2Clients, translatedConnectionIds]);

  const downstreamWorkerCount = poolGlobal?.sv2_clients?.total_channels || downstreamWorkers.length;
  // Hide the internal Translator->JDC hop by counting translated rows as user-facing
  // worker connections and direct SV2 clients by unique downstream connection ID.
  const userFacingDownstreamConnectionCount = useMemo(() => {
    if (!isJdMode) {
      return 0;
    }

    const directSv2ConnectionIds = new Set<number>();
    let translatedWorkerConnections = 0;

    downstreamWorkers.forEach((worker) => {
      if (worker.channel_type === 'sv1') {
        translatedWorkerConnections += 1;
        return;
      }

      directSv2ConnectionIds.add(worker.connection_id);
    });

    return directSv2ConnectionIds.size + translatedWorkerConnections;
  }, [downstreamWorkers, isJdMode]);
  const totalWorkers = isJdMode ? downstreamWorkerCount : sv1TotalClients;
  const activeWorkers = isJdMode ? downstreamWorkerCount : sv1ActiveCount;
  const workerTableLoading = isJdMode ? isSv2ClientsLoading : sv1Loading;

  // Total hashrate:
  // - JD mode: from SV2 client channels (poolGlobal.sv2_clients.total_hashrate)
  // - Translator-only mode: from SV1 clients (poolGlobal.sv1_clients.total_hashrate or calculated)
  const totalHashrate = isJdMode 
    ? (poolGlobal?.sv2_clients?.total_hashrate || 0)
    : (poolGlobal?.sv1_clients?.total_hashrate || sv1TotalHashrate);

  const totalClientChannels = isJdMode 
    ? downstreamWorkerCount
    : sv1ActiveCount;

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

      return sv2Clients.flatMap((client) => [
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
  }, [isJdMode, serverChannels, sv2Clients]);

  const bestDiffEntries = useMemo(() => {
    if (isJdMode) {
      if (!sv2Clients) return [];

      return sv2Clients.flatMap((client) => [
        ...client.extended_channels.map((channel) => ({
          key: `jdc:${client.client_id}:extended:${channel.channel_id}:${channel.user_identity}`,
          value: channel.best_diff,
        })),
        ...client.standard_channels.map((channel) => ({
          key: `jdc:${client.client_id}:standard:${channel.channel_id}:${channel.user_identity}`,
          value: channel.best_diff,
        })),
      ]);
    }

    if (!serverChannels) return [];

    return [
      ...serverChannels.extended_channels.map((channel) => ({
        key: `translator:server:extended:${channel.channel_id}:${channel.user_identity}`,
        value: channel.best_diff,
      })),
      ...serverChannels.standard_channels.map((channel) => ({
        key: `translator:server:standard:${channel.channel_id}:${channel.user_identity}`,
        value: channel.best_diff,
      })),
    ];
  }, [isJdMode, serverChannels, sv2Clients]);

  // Shares data from upstream SERVER channels (shares sent TO the Pool)
  const shareStats = useMemo(() => {
    if (!serverChannels) {
      return { acknowledged: 0, submitted: 0, rejected: 0 };
    }
    
    const extAcknowledged = serverChannels.extended_channels.reduce((sum, ch) => sum + ch.shares_acknowledged, 0);
    const stdAcknowledged = serverChannels.standard_channels.reduce((sum, ch) => sum + ch.shares_acknowledged, 0);
    
    const extSubmitted = serverChannels.extended_channels.reduce((sum, ch) => sum + ch.shares_submitted, 0);
    const stdSubmitted = serverChannels.standard_channels.reduce((sum, ch) => sum + ch.shares_submitted, 0);

    const extRejected = serverChannels.extended_channels.reduce((sum, ch) => sum + ch.shares_rejected, 0);
    const stdRejected = serverChannels.standard_channels.reduce((sum, ch) => sum + ch.shares_rejected, 0);
    
    return {
      acknowledged: extAcknowledged + stdAcknowledged,
      submitted: extSubmitted + stdSubmitted,
      rejected: extRejected + stdRejected,
    };
  }, [serverChannels]);
  const blocksFound = usePersistentBlocksFound(blocksFoundEntries, historyConfigKey);
  const bestDiff = usePersistentBestDifficulty(bestDiffEntries, historyConfigKey);

  // Number of upstream pool channels (for shares subtitle)
  const poolChannelCount = (serverChannels?.total_extended || 0) + (serverChannels?.total_standard || 0);
  
  // Number of client channels (for best diff subtitle)
  const clientChannelCount = isJdMode 
    ? downstreamWorkerCount
    : sv1ActiveCount;
  const bestDiffSubtitle = clientChannelCount > 0
    ? `from ${clientChannelCount} client channel(s)`
    : undefined;

  const hasBestDiffSource = isJdMode ? !!sv2Clients : !!serverChannels;

  useEffect(() => {
    if (isAggregatedTproxy && sortKey === 'best_diff') {
      setSortKey('connection_id');
      setSortDir('asc');
    }
  }, [isAggregatedTproxy, sortKey]);

  type DashboardWorkerRow = DownstreamWorkerRow & { search_text: string };

  const dashboardWorkers = useMemo<DashboardWorkerRow[]>(() => {
    if (isJdMode) {
      return downstreamWorkers.map((worker) => ({
        ...worker,
        search_text: [
          worker.user_identity,
          worker.connection_id.toString(),
          worker.channel_id?.toString() || '',
          worker.channel_type,
        ].join(' ').toLowerCase(),
      }));
    }

    return allSv1Clients.map((client) => ({
      connection_id: client.client_id,
      channel_id: client.channel_id,
      channel_type: 'sv1' as ChannelType,
      user_identity: client.user_identity,
      estimated_hashrate: client.hashrate,
      best_diff: null,
      search_text: [
        client.authorized_worker_name || '',
        client.user_identity,
        client.client_id.toString(),
        client.channel_id?.toString() || '',
        'sv1',
      ].join(' ').toLowerCase(),
    }));
  }, [isJdMode, downstreamWorkers, allSv1Clients]);

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

      {/* Start Mining Banner (configured but stopped) */}
      {configuredButStopped && showError && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-primary/40 bg-primary/10 px-5 py-4 text-sm">
          <div className="flex items-center gap-3">
            <Play className="h-4 w-4 shrink-0 text-primary" />
            <span>Mining services are stopped.</span>
          </div>
          <button
            onClick={handleStartMining}
            disabled={isStarting}
            className="h-9 px-4 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors font-medium flex items-center gap-2"
          >
            {isStarting ? (
              <>
                <div className="h-4 w-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                Starting...
              </>
            ) : (
              'Start Mining'
            )}
          </button>
        </div>
      )}

      {/* Connection Error Banner (not configured or unknown error) */}
      {showError && !configuredButStopped && (
        <div className="flex items-center gap-3 rounded-xl border border-red-500/40 bg-red-500/10 px-5 py-4 text-sm text-red-500">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>
            Cannot connect to pool. Make sure mining services are running.
          </span>
        </div>
      )}

      {/* log-derived Diagnostic Banners */}
      {diagnostics.map((diagnostic) => (
        <div
          key={diagnostic.code}
          className={`flex items-start gap-3 rounded-xl border px-5 py-4 text-sm ${
            diagnostic.severity === 'error'
              ? 'border-red-500/40 bg-red-500/10 text-red-500'
              : 'border-amber-500/40 bg-amber-500/10 text-amber-500'
          }`}
        >
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <div className="flex flex-col gap-1">
            <span className="font-medium">{diagnostic.title}</span>
            <span>{diagnostic.message}</span>
            {diagnostic.recommendation && (
              <span className="text-current/80">{diagnostic.recommendation}</span>
            )}
          </div>
        </div>
      ))}

      {/* Hero Stats Section */}
      <div className={isSovereignSolo ? 'grid gap-4 md:grid-cols-2 lg:grid-cols-4' : 'grid gap-4 md:grid-cols-2 lg:grid-cols-5'}>
        <StatCard
          title="Total Estimated Hashrate"
          value={formatHashrate(totalHashrate)}
          subtitle={`${totalClientChannels} client channel(s)`}
          info={
            <InfoPopover>
              Estimated hashrate sampled every 5 seconds. May take a few minutes to reflect your miner's actual output.
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
          subtitle={
            isJdMode
              ? `${userFacingDownstreamConnectionCount} downstream connection(s)`
              : `${totalWorkers - activeWorkers} offline workers`
          }
        />

        <StatCard
          title="Blocks Found"
          value={blocksFound.toLocaleString()}
        />

        {!isSovereignSolo && (
          <StatCard
            title="Share Acceptance"
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
              if (submitted === 0) return `via ${poolChannelCount} channel(s)`;
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
          subtitle={bestDiffSubtitle}
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
            Estimated hashrate sampled every 5 seconds. May take a few minutes to reflect your miner's actual output.
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
