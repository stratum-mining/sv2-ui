import { useState, useMemo } from 'react';
import { AlertTriangle, Search, RefreshCw, Play } from 'lucide-react';
import { Shell } from '@/components/layout/Shell';
import { StatCard } from '@/components/data/StatCard';
import { HashrateChart } from '@/components/data/HashrateChart';
import { Sv1ClientTable } from '@/components/data/Sv1ClientTable';
import { 
  usePoolData, 
  useSv1ClientsData, 
  useTranslatorHealth,
  useJdcHealth,
} from '@/hooks/usePoolData';
import { useHashrateHistory } from '@/hooks/useHashrateHistory';
import { useSetupStatus } from '@/hooks/useSetupStatus';
import { formatHashrate, formatUptime, formatDifficulty } from '@/lib/utils';
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
  const itemsPerPage = 15;

  // Get configured template mode and pool name from setup status
  const { isOrchestrated, isConfigured, isRunning, mode: templateMode, poolName } = useSetupStatus();

  // Data from JDC or Translator depending on configured mode
  const {
    isJdMode,
    global: poolGlobal,
    clientChannels,  // Downstream client channels (for hashrate, best diff)
    serverChannels,  // Upstream server channels (for shares to Pool)
    isLoading: poolLoading,
    isError: poolError,
  } = usePoolData();

  // Health checks for status indicators — also drive the error banner
  // (poolError alone is insufficient: if Translator is down but JDC is up,
  // usePoolData falls back to JDC and never sets isError, so we'd miss it)

  // SV1 clients (always from Translator)
  const {
    data: sv1Data,
    isLoading: sv1Loading,
    refetch: refetchSv1,
  } = useSv1ClientsData(0, 1000); // Fetch all for client-side filtering

  const {
    data: translatorOk,
    isLoading: translatorHealthLoading,
    isError: translatorHealthError,
  } = useTranslatorHealth();
  const {
    data: jdcOk,
    isLoading: jdcHealthLoading,
    isError: jdcHealthError,
  } = useJdcHealth();

  // Derive per-service error state from health checks.
  // A service is considered down when:
  //   - its health query has finished loading (!isLoading), AND
  //   - there is no confirmed healthy response (`data !== true`) OR
  //   - the query is in error state (covers both initial and refetch failures)
  const translatorHealthy = translatorOk === true && !translatorHealthError;
  const jdcHealthy = jdcOk === true && !jdcHealthError;
  const translatorDown = !translatorHealthLoading && !translatorHealthy;
  const jdcDown = !jdcHealthLoading && isJdMode && !jdcHealthy;
  const showError = poolError || translatorDown || jdcDown;

  // Check if configured but not running (show "Start Mining" instead of error)
  const { isOrchestrated, isConfigured, isRunning } = useSetupStatus();
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

  const uptime = poolGlobal?.uptime_secs || 0;

  // Build hashrate history from real-time data
  const hashrateHistory = useHashrateHistory(totalHashrate);

  // Shares data from upstream SERVER channels (shares sent TO the Pool)
  const shareStats = useMemo(() => {
    if (!serverChannels) {
      return { accepted: 0, submitted: 0 };
    }
    
    // Shares accepted by the Pool
    const extAccepted = serverChannels.extended_channels.reduce((sum, ch) => sum + ch.shares_accepted, 0);
    const stdAccepted = serverChannels.standard_channels.reduce((sum, ch) => sum + ch.shares_accepted, 0);
    
    // Submitted = sum of shares_submitted across all upstream channels
    const extSubmitted = serverChannels.extended_channels.reduce((sum, ch) => sum + ch.shares_submitted, 0);
    const stdSubmitted = serverChannels.standard_channels.reduce((sum, ch) => sum + ch.shares_submitted, 0);
    const submitted = extSubmitted + stdSubmitted;
    
    return {
      accepted: extAccepted + stdAccepted,
      submitted,
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
  
  // Calculate acceptance rate
  const acceptanceRate = shareStats.submitted > 0 
    ? ((shareStats.accepted / shareStats.submitted) * 100).toFixed(2) 
    : '0.00';

  // Filter clients by search
  const filteredClients = useMemo(() => {
    if (!searchTerm) return allClients;
    const term = searchTerm.toLowerCase();
    return allClients.filter((c: Sv1ClientInfo) => 
      c.authorized_worker_name?.toLowerCase().includes(term) ||
      c.user_identity?.toLowerCase().includes(term)
    );
  }, [allClients, searchTerm]);

  // Pagination
  const totalPages = Math.ceil(filteredClients.length / itemsPerPage);
  const paginatedClients = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredClients.slice(start, start + itemsPerPage);
  }, [filteredClients, currentPage, itemsPerPage]);

  // Determine if pool is connected (healthy stack means pool connection is working)
  const isHealthLoading = translatorHealthLoading || (isJdMode && jdcHealthLoading);
  const isPoolConnected = isJdMode ? (translatorHealthy && jdcHealthy) : translatorHealthy;

  return (
    <Shell appMode="translator">
      {/* Pool Connection Status */}
      <div className="flex items-center gap-4 text-sm mb-2">
        <div className="flex items-center gap-2">
          <div className={`h-2 w-2 rounded-full ${isHealthLoading ? 'bg-muted-foreground animate-pulse' : isPoolConnected ? 'bg-green-500' : 'bg-red-500'}`} />
          <span className="text-muted-foreground">
            {isHealthLoading 
              ? 'Connecting...' 
              : isPoolConnected 
                ? `Connected to ${poolName || 'Pool'}` 
                : 'Disconnected'}
          </span>
        </div>
        <span className="text-xs text-muted-foreground ml-auto">
          Uptime: {formatUptime(uptime)}
        </span>
      </div>

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
          title="Total Hashrate"
          value={formatHashrate(totalHashrate)}
          subtitle={`${totalClientChannels} client channel(s)`}
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
          title="Shares to Pool"
          value={
            <span>
              {shareStats.accepted.toLocaleString()} 
              <span className="text-muted-foreground text-lg"> / {shareStats.submitted.toLocaleString()}</span>
            </span>
          }
          subtitle={`${acceptanceRate}% accepted via ${poolChannelCount} channel(s)`}
        />

        <StatCard
          title="Best Difficulty"
          value={bestDiff > 0 ? formatDifficulty(bestDiff) : '-'}
          subtitle={`from ${clientChannelCount} client channel(s)`}
        />
      </div>

      {/* Main Chart - Real data accumulated over time */}
      <HashrateChart 
        data={hashrateHistory}
        title="Hashrate History"
        description="Real-time data collected since page load"
      />

      {/* Loading State */}
      {poolLoading && (
        <div className="rounded-xl border border-border/40 bg-card/40 backdrop-blur-sm p-8 text-center text-muted-foreground">
          Connecting to monitoring API...
        </div>
      )}

      {/* Actions Bar - Sticky Header */}
      {!poolLoading && (
        <div className="sticky top-0 z-30 bg-background/60 backdrop-blur-xl py-3 -mx-6 px-6 md:-mx-8 md:px-8 border-y border-border/40 transition-all duration-200 shadow-sm supports-[backdrop-filter]:bg-background/60 mt-8 mb-0">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 max-w-7xl mx-auto">
            <div className="flex items-center gap-2 w-full sm:w-auto">
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

            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              <button
                onClick={() => refetchSv1()}
                className="h-9 px-3 rounded-lg border border-border/50 bg-muted/30 hover:bg-background transition-colors flex items-center gap-2 text-sm"
              >
                <RefreshCw className="h-4 w-4" />
                Refresh
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Workers Table */}
      {!poolLoading && (
        <>
          <Sv1ClientTable
            clients={paginatedClients}
            isLoading={sv1Loading}
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
