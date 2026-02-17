import { useState, useMemo } from 'react';
import { Search, RefreshCw } from 'lucide-react';
import { Shell } from '@/components/layout/Shell';
import { StatCard } from '@/components/data/StatCard';
import { HashrateChart } from '@/components/data/HashrateChart';
import { Sv1ClientTable } from '@/components/data/Sv1ClientTable';
import {
  usePoolData,
  useSv1ClientsData,
} from '@/hooks/usePoolData';
import { useHashrateHistory } from '@/hooks/useHashrateHistory';
import { formatHashrate, formatUptime, formatDifficulty } from '@/lib/utils';
import type { Sv1ClientInfo } from '@/types/api';
import { useUiConfig } from '@/hooks/useUiConfig';

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
  const { config } = useUiConfig();

  // Data from JDC or Translator depending on mode
  const {
    isJdMode,
    global: poolGlobal,
    clientChannels,
    serverChannels,
    isLoading: poolLoading,
    isError: poolError
  } = usePoolData();

  // SV1 clients (always from Translator)
  const { 
    data: sv1Data, 
    isLoading: sv1Loading,
    refetch: refetchSv1,
  } = useSv1ClientsData(0, 1000); // Fetch all for client-side filtering

  // SV1 client stats (from Translator)
  const allClients = sv1Data?.items || [];
  const activeClients = allClients.filter((c: Sv1ClientInfo) => c.hashrate !== null);
  const totalClients = sv1Data?.total || 0;
  const activeCount = activeClients.length;

  // Calculate total hashrate from SV1 clients
  const sv1TotalHashrate = useMemo(() => {
    return allClients.reduce((sum, c) => sum + (c.hashrate || 0), 0);
  }, [allClients]);

  // Total hashrate:
  // - JD mode: from SV2 client channels (poolGlobal.clients.total_hashrate)
  // - Translator-only mode: from SV1 clients
  const totalHashrate = isJdMode 
    ? (poolGlobal?.clients.total_hashrate || 0)
    : sv1TotalHashrate;

  const totalClientChannels = isJdMode 
    ? (poolGlobal?.clients.total_channels || 0)
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

  return (
    <Shell appMode="translator" appName={config.appName}>
      {/* Stats */}
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Hashrate"
          value={formatHashrate(totalHashrate)}
          subtitle={`${totalClientChannels} channel(s)`}
        />
        <StatCard
          title="Workers"
          value={`${activeCount} / ${totalClients}`}
        />
        <StatCard
          title="Shares"
          value={`${shareStats.accepted.toLocaleString()} / ${shareStats.submitted.toLocaleString()}`}
          subtitle={`${acceptanceRate}% accepted`}
        />
        <StatCard
          title="Best Diff"
          value={bestDiff > 0 ? formatDifficulty(bestDiff) : '-'}
        />
      </div>

      {/* Chart */}
      <HashrateChart
        data={hashrateHistory}
        title="Hashrate"
        description={`Uptime: ${formatUptime(uptime)}`}
      />

      {/* Loading / Error */}
      {poolLoading && (
        <div className="rounded-xl border border-border p-6 text-center text-sm text-muted-foreground">
          Connecting to monitoring API...
        </div>
      )}

      {poolError && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-6 text-center text-sm text-red-400">
          Failed to connect. Make sure Translator (and optionally JDC) are running.
        </div>
      )}

      {/* Workers */}
      {!poolLoading && !poolError && (
        <>
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search workers..."
                className="w-full pl-9 h-9 bg-transparent border border-border rounded-lg text-sm outline-none focus:ring-1 focus:ring-primary/30"
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
              />
            </div>
            <button
              onClick={() => refetchSv1()}
              className="h-9 px-3 rounded-lg border border-border hover:bg-foreground/5 transition-colors flex items-center gap-2 text-sm text-muted-foreground"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </button>
          </div>

          <Sv1ClientTable
            clients={paginatedClients}
            isLoading={sv1Loading}
          />

          {filteredClients.length > itemsPerPage && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                {paginatedClients.length} of {filteredClients.length}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-foreground/5 disabled:opacity-40 transition-colors"
                >
                  Prev
                </button>
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-foreground/5 disabled:opacity-40 transition-colors"
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
