import { useState, useMemo } from 'react';
import { Activity, Server, Search, RefreshCw, ArrowUpRight } from 'lucide-react';
import { Shell } from '@/components/layout/Shell';
import { StatCard } from '@/components/data/StatCard';
import { HashrateChart } from '@/components/data/HashrateChart';
import { Sv1ClientTable } from '@/components/data/Sv1ClientTable';
import { NoServicesPage } from '@/pages/NoServicesPage';
import { 
  usePoolData, 
  useSv1ClientsData, 
  useTranslatorHealth,
  useJdcHealth,
} from '@/hooks/usePoolData';
import { useHashrateHistory, useRecordHashrate } from '@/context/HashrateHistoryContext';
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

  // ============================================
  // ALL HOOKS MUST BE CALLED BEFORE ANY RETURNS
  // (React rules of hooks)
  // ============================================

  // Health checks for status indicators
  const { data: translatorOk, isLoading: translatorLoading, refetch: refetchTranslator } = useTranslatorHealth();
  const { data: jdcOk, isLoading: jdcLoading, refetch: refetchJdc } = useJdcHealth();

  // Data from JDC or Translator depending on mode
  const { 
    modeLabel, 
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
  } = useSv1ClientsData(0, 1000);

  // Get hashrate history from context
  const hashrateHistory = useHashrateHistory();

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

  const uptime = poolGlobal?.uptime_secs || 0;

  // Record hashrate to global history (persists across tab switches)
  useRecordHashrate(totalHashrate);

  // Shares data from upstream SERVER channels (shares sent TO the Pool)
  const shareStats = useMemo(() => {
    if (!serverChannels) {
      return { accepted: 0, submitted: 0 };
    }
    
    const extAccepted = serverChannels.extended_channels.reduce((sum, ch) => sum + ch.shares_accepted, 0);
    const stdAccepted = serverChannels.standard_channels.reduce((sum, ch) => sum + ch.shares_accepted, 0);
    const extSubmitted = serverChannels.extended_channels.reduce((sum, ch) => sum + ch.shares_submitted, 0);
    const stdSubmitted = serverChannels.standard_channels.reduce((sum, ch) => sum + ch.shares_submitted, 0);
    
    return {
      accepted: extAccepted + stdAccepted,
      submitted: extSubmitted + stdSubmitted,
    };
  }, [serverChannels]);

  // Best difficulty
  const bestDiff = useMemo(() => {
    if (!isJdMode) {
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
    : null;

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

  // ============================================
  // CONDITIONAL RENDERING (after all hooks)
  // ============================================

  // Check if no services are connected
  const noServicesConnected = !translatorOk && !jdcOk && !translatorLoading && !jdcLoading;
  const healthCheckLoading = translatorLoading || jdcLoading;
  
  const handleRefreshConnections = () => {
    refetchTranslator();
    refetchJdc();
  };

  // If no services are connected, show the NoServicesPage (without Shell/sidebar)
  if (noServicesConnected) {
    return (
      <NoServicesPage 
        isLoading={healthCheckLoading}
        onRefresh={handleRefreshConnections}
      />
    );
  }

  return (
    <Shell appMode="translator">
      {/* Connection Status Banner */}
      <div className="flex items-center gap-4 text-sm mb-2">
        <div className="flex items-center gap-2">
          <div className={`h-2 w-2 rounded-full ${translatorOk ? 'bg-sv2-green' : 'bg-sv2-red'}`} />
          <span className="text-muted-foreground">Translator</span>
        </div>
        {isJdMode && (
          <div className="flex items-center gap-2">
            <div className={`h-2 w-2 rounded-full ${jdcOk ? 'bg-sv2-green' : 'bg-sv2-red'}`} />
            <span className="text-muted-foreground">JDC</span>
          </div>
        )}
        <span className="text-xs text-muted-foreground ml-auto">
          Pool data via {modeLabel} • Uptime: {formatUptime(uptime)}
        </span>
      </div>

      {/* Main Dashboard Content */}
      <>
          {/* Hero Stats Section */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <StatCard
              title="Total Hashrate"
              value={formatHashrate(totalHashrate)}
              icon={<Activity className="h-4 w-4 text-primary" />}
            />

            <StatCard
              title="Active Workers"
              value={
                <span>
                  {activeCount} <span className="text-muted-foreground text-lg">/ {totalClients}</span>
                </span>
              }
              icon={<Server className="h-4 w-4 text-primary" />}
              subtitle={undefined}
            />

            <StatCard
              title="Shares to Pool"
              value={
                <span>
                  {shareStats.accepted.toLocaleString()} 
                  <span className="text-muted-foreground text-lg"> / {shareStats.submitted.toLocaleString()}</span>
                </span>
              }
              icon={<ArrowUpRight className="h-4 w-4 text-sv2-green" />}
              subtitle={acceptanceRate ? `${acceptanceRate}% accepted` : undefined}
            />

            <StatCard
              title="Best Difficulty"
              value={bestDiff > 0 ? formatDifficulty(bestDiff) : '-'}
              icon={<Activity className="h-4 w-4 text-primary" />}
              subtitle={undefined}
            />
          </div>

          {/* Main Chart */}
          <HashrateChart 
            data={hashrateHistory}
            title="Hashrate History"
            description="Real-time data collected since page load"
          />

          {/* Loading / Error States */}
          {poolLoading && (
            <div className="rounded-xl border border-border/40 bg-card/40 backdrop-blur-sm p-8 text-center text-muted-foreground">
              Connecting to monitoring API...
            </div>
          )}

          {poolError && (
            <div className="rounded-xl border border-sv2-red/40 bg-sv2-red/10 backdrop-blur-sm p-8 text-center text-sv2-red">
              Failed to connect. Make sure Translator (and optionally JDC) are running with monitoring enabled.
            </div>
          )}

          {/* Actions Bar */}
          {!poolLoading && !poolError && (
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
          {!poolLoading && !poolError && (
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
        </>
    </Shell>
  );
}
