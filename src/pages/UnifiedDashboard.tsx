import { useState, useMemo } from 'react';
import { AlertTriangle, Search, Play } from 'lucide-react';
import { InfoPopover } from '@/components/ui/info-popover';
import { MinerConnectionInfo } from '@/components/setup/MinerConnectionInfo';
import { Shell } from '@/components/layout/Shell';
import { StatCard } from '@/components/data/StatCard';
import { HashrateChart } from '@/components/data/HashrateChart';
import { Sv1ClientTable, type SortKey } from '@/components/data/Sv1ClientTable';
import { usePoolData, useSv1ClientsData, useTranslatorHealth, useJdcHealth } from '@/hooks/usePoolData';
import { useHashrateHistory } from '@/hooks/useHashrateHistory';
import { useSetupStatus } from '@/hooks/useSetupStatus';
import { useConnectionStatus } from '@/hooks/useConnectionStatus';
import { formatHashrate, formatDifficulty } from '@/lib/utils';
import type { Sv1ClientInfo } from '@/types/api';
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
 * SV1 Clients always come from Translator.
 */
export function UnifiedDashboard() {
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [sortKey, setSortKey] = useState<SortKey>('client_id');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const itemsPerPage = 15;

  // Get configured template mode from setup status
  const { isOrchestrated, isConfigured, isRunning, mode: templateMode } = useSetupStatus();

  // Header connection status (shared with Settings via hook)
  const { status: connectionStatus, poolName, uptime } = useConnectionStatus();

  // Data from JDC or Translator depending on configured mode
  const {
    isJdMode,
    global: poolGlobal,
    clientChannels,  // Downstream client channels (for hashrate, best diff)
    serverChannels,  // Upstream server channels (for shares to Pool)
    isLoading: poolLoading,
    isError: poolError,
  } = usePoolData(templateMode);

  // SV1 clients (always from Translator)
  const {
    data: sv1Data,
    isLoading: sv1Loading,
  } = useSv1ClientsData(0, 1000); // Fetch all for client-side filtering

  // Health checks for the error banner (React Query deduplicates the API calls)
  const { data: translatorOk, isLoading: translatorHealthLoading, isError: translatorHealthError } = useTranslatorHealth();
  const { data: jdcOk, isLoading: jdcHealthLoading, isError: jdcHealthError } = useJdcHealth(isJdMode);
  const translatorHealthy = translatorOk === true && !translatorHealthError;
  const jdcHealthy        = jdcOk === true && !jdcHealthError;
  const translatorDown    = !translatorHealthLoading && !translatorHealthy;
  const jdcDown           = isJdMode && !jdcHealthLoading && !jdcHealthy;
  const showError         = poolError || translatorDown || jdcDown;
  const configuredButStopped = isOrchestrated && isConfigured && !isRunning;
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

  // SV1 client stats (from Translator)
  const allClients = useMemo(() => sv1Data?.items || [], [sv1Data?.items]);
  const activeClients = useMemo(() => allClients.filter((c: Sv1ClientInfo) => c.hashrate !== null), [allClients]);
  const totalClients = sv1Data?.total || 0;
  const activeCount = activeClients.length;

  // Calculate total hashrate from SV1 clients
  const sv1TotalHashrate = useMemo(() => {
    return allClients.reduce((sum, c) => sum + (c.hashrate || 0), 0);
  }, [allClients]);

  // Total hashrate:
  // - JD mode: from SV2 client channels (poolGlobal.sv2_clients.total_hashrate)
  // - Translator-only mode: from SV1 clients (poolGlobal.sv1_clients.total_hashrate or calculated)
  const totalHashrate = isJdMode 
    ? (poolGlobal?.sv2_clients?.total_hashrate || 0)
    : (poolGlobal?.sv1_clients?.total_hashrate || sv1TotalHashrate);

  const totalClientChannels = isJdMode 
    ? (poolGlobal?.sv2_clients?.total_channels || 0)
    : activeCount;

  // Build hashrate history from real-time data
  const hashrateHistory = useHashrateHistory(totalHashrate);

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

  // Best difficulty:
  // - JD mode: from SV2 client channels
  // - Translator-only mode: not available from SV1 clients API (no best_diff field)
  const bestDiff = useMemo(() => {
    if (!isJdMode) {
      // Translator doesn't expose best_diff for SV1 clients
      // We could potentially get it from server channels instead
      if (!serverChannels) return 0;
      const extBest = Math.max(...serverChannels.extended_channels.map(ch => ch.best_diff), 0);
      const stdBest = Math.max(...serverChannels.standard_channels.map(ch => ch.best_diff), 0);
      return Math.max(extBest, stdBest);
    }
    
    if (!clientChannels) return 0;
    
    const extBest = Math.max(...clientChannels.extended_channels.map(ch => ch.best_diff), 0);
    const stdBest = Math.max(...clientChannels.standard_channels.map(ch => ch.best_diff), 0);
    
    return Math.max(extBest, stdBest);
  }, [isJdMode, clientChannels, serverChannels]);

  // Number of upstream pool channels (for shares subtitle)
  const poolChannelCount = (serverChannels?.total_extended || 0) + (serverChannels?.total_standard || 0);
  
  // Number of client channels (for best diff subtitle)
  const clientChannelCount = isJdMode 
    ? (clientChannels?.total_extended || 0) + (clientChannels?.total_standard || 0)
    : activeCount;
  
  // Filter and sort clients
  const filteredClients = useMemo(() => {
    let list = allClients;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      list = allClients.filter((c: Sv1ClientInfo) =>
        c.authorized_worker_name?.toLowerCase().includes(term) ||
        c.user_identity?.toLowerCase().includes(term)
      );
    }
    const nullLast = sortDir === 'asc' ? Infinity : -Infinity;
    return [...list].sort((a, b) => {
      const av = a[sortKey] ?? nullLast;
      const bv = b[sortKey] ?? nullLast;
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [allClients, searchTerm, sortKey, sortDir]);

  // Pagination
  const totalPages = Math.ceil(filteredClients.length / itemsPerPage);
  const paginatedClients = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredClients.slice(start, start + itemsPerPage);
  }, [filteredClients, currentPage, itemsPerPage]);

  return (
    <Shell
      appMode="translator"
      connectionStatus={connectionStatus}
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

      {/* Hero Stats Section */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
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
          title="Active Workers"
          value={
            <span>
              {activeCount} <span className="text-muted-foreground text-lg">/ {totalClients}</span>
            </span>
          }
          subtitle={`${totalClients - activeCount} offline workers`}
        />

        <StatCard
          title="Share Acceptance"
          value={(() => {
            const { submitted, rejected } = shareStats;
            if (submitted === 0) return <span className="text-muted-foreground">—</span>;

            const rate = ((submitted - rejected) / submitted) * 100;

            // ── Label ──────────────────────────────────────────────────────
            // Zero rejections → exact "100%".
            // Any rejections  → 2 decimal places so even 0.01% rejection is
            //   visible. Cap at "99.99%" so floating-point can never round up
            //   to "100.00%" and falsely imply a clean run.
            const label = rejected === 0
              ? '100%'
              : `${Math.min(rate, 99.99).toFixed(2)}%`;

            // ── Colour ─────────────────────────────────────────────────────
            // Green ONLY when literally zero rejections — "99.80%" must never
            //   look the same as a perfect run.
            // Neutral (default foreground) for high rates with minor rejects.
            // Yellow 95–99 %, red below 95 %.
            const colorClass = rejected === 0
              ? 'text-green-500'
              : rate >= 99
                ? ''                  // neutral — noticeable but not alarming
                : rate >= 95
                  ? 'text-yellow-500'
                  : 'text-red-500';

            return <span className={colorClass}>{label}</span>;
          })()}
          subtitle={(() => {
            const { submitted, rejected } = shareStats;
            if (submitted === 0) return `via ${poolChannelCount} channel(s)`;
            const rejectionRate = (rejected / submitted) * 100;
            // Show exact "0%" when clean; cap display at 0.01% so it never
            // rounds down to "0.00%" when there ARE rejections.
            const rejRateLabel = rejected === 0
              ? '0%'
              : `${Math.max(rejectionRate, 0.01).toFixed(2)}%`;
            return `${submitted.toLocaleString()} submitted · ${rejected.toLocaleString()} rejected (${rejRateLabel})`;
          })()}
        />

        <StatCard
          title="Best Difficulty"
          value={bestDiff > 0 ? formatDifficulty(bestDiff) : '-'}
          subtitle={`from ${clientChannelCount} client channel(s)`}
        />
      </div>

      {/* Miner Connection Info */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-widest mb-3">Point your miners to</h2>
        <MinerConnectionInfo isJdMode={isJdMode} />
      </div>

      {/* Main Chart - Real data accumulated over time */}
      <HashrateChart
        data={hashrateHistory}
        title="Hashrate History"
        description="Real-time data sampled every 5 seconds"
        info={
          <InfoPopover>
            Estimated hashrate sampled every 5 seconds. May take a few minutes to reflect your miner's actual output.
          </InfoPopover>
        }
      />

      {/* Loading State */}
      {poolLoading && (
        <div className="rounded-xl border border-border/40 bg-card/40 backdrop-blur-sm p-8 text-center text-muted-foreground">
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
              placeholder="Search workers..."
              className="w-full pl-9 h-9 bg-muted/30 border border-border/50 focus:bg-background transition-all rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary/20"
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
          <Sv1ClientTable
            clients={paginatedClients}
            isLoading={sv1Loading}
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={(key) => {
              if (key === sortKey) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
              else { setSortKey(key); setSortDir('asc'); }
              setCurrentPage(1);
            }}
          />

          {/* Pagination Footer */}
          {filteredClients.length > itemsPerPage && (
            <div className="flex items-center justify-between mt-4">
              <div className="text-sm text-muted-foreground">
                Showing {paginatedClients.length} of {filteredClients.length} workers
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-1.5 text-sm border border-border/50 rounded-lg hover:bg-muted/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Previous
                </button>
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1.5 text-sm border border-border/50 rounded-lg hover:bg-muted/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
