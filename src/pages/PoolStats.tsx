import { useMemo } from 'react';
import { Shell } from '@/components/layout/Shell';
import { StatCard } from '@/components/data/StatCard';
import { UpstreamChannelTable } from '@/components/data/UpstreamChannelTable';
import { usePoolData } from '@/hooks/usePoolData';
import { formatHashrate, formatDifficulty, formatUptime } from '@/lib/utils';
import { useUiConfig } from '@/hooks/useUiConfig';

/**
 * Pool Statistics page.
 * Shows detailed information about the upstream connection to the Pool.
 * Data comes from JDC (if JD mode) or Translator (if non-JD mode).
 * All data is real - no mock/simulated values.
 */
export function PoolStats() {
  const { 
    modeLabel, 
    isJdMode, 
    global: poolGlobal, 
    channels: poolChannels,
    isLoading, 
    isError 
  } = usePoolData();
  const { config } = useUiConfig();

  // Calculate stats from channels
  const stats = useMemo(() => {
    if (!poolChannels) {
      return {
        sharesAccepted: 0,
        sharesSubmitted: 0,
        shareWorkSum: 0,
        bestDiff: 0,
        extendedCount: 0,
        standardCount: 0,
      };
    }

    // Shares accepted by pool
    const extAccepted = poolChannels.extended_channels.reduce((sum, ch) => sum + ch.shares_accepted, 0);
    const stdAccepted = poolChannels.standard_channels.reduce((sum, ch) => sum + ch.shares_accepted, 0);
    
    // Submitted = sum of shares_submitted across all upstream channels
    const extSubmitted = poolChannels.extended_channels.reduce((sum, ch) => sum + ch.shares_submitted, 0);
    const stdSubmitted = poolChannels.standard_channels.reduce((sum, ch) => sum + ch.shares_submitted, 0);
    const sharesSubmitted = extSubmitted + stdSubmitted;
    
    // Share work sum
    const extWork = poolChannels.extended_channels.reduce((sum, ch) => sum + ch.share_work_sum, 0);
    const stdWork = poolChannels.standard_channels.reduce((sum, ch) => sum + ch.share_work_sum, 0);
    
    // Best difficulty
    const extBest = Math.max(...poolChannels.extended_channels.map(ch => ch.best_diff), 0);
    const stdBest = Math.max(...poolChannels.standard_channels.map(ch => ch.best_diff), 0);

    return {
      sharesAccepted: extAccepted + stdAccepted,
      sharesSubmitted,
      shareWorkSum: extWork + stdWork,
      bestDiff: Math.max(extBest, stdBest),
      extendedCount: poolChannels.total_extended,
      standardCount: poolChannels.total_standard,
    };
  }, [poolChannels]);

  // Calculate acceptance rate
  const acceptanceRate = stats.sharesSubmitted > 0 
    ? ((stats.sharesAccepted / stats.sharesSubmitted) * 100).toFixed(2) 
    : '100.00';

  return (
    <Shell appMode="translator" appName={config.appName}>
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-semibold">Pool Statistics</h2>
          <p className="text-sm text-muted-foreground">
            Upstream connection via {modeLabel}{isJdMode ? ' (JD enabled)' : ''}
          </p>
        </div>

        {isLoading && (
          <div className="rounded-xl border border-border p-6 text-center text-sm text-muted-foreground">
            Loading pool statistics...
          </div>
        )}

        {isError && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-6 text-center text-sm text-red-400">
            Failed to connect. Make sure {modeLabel} is running.
          </div>
        )}

        {!isLoading && !isError && (
          <>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              <StatCard
                title="Shares"
                value={`${stats.sharesAccepted.toLocaleString()} / ${stats.sharesSubmitted.toLocaleString()}`}
                subtitle={`${acceptanceRate}% accepted`}
              />
              <StatCard
                title="Best Diff"
                value={formatDifficulty(stats.bestDiff)}
              />
              <StatCard
                title="Work Sum"
                value={stats.shareWorkSum.toLocaleString()}
              />
              <StatCard
                title="Hashrate"
                value={formatHashrate(poolGlobal?.server.total_hashrate || 0)}
              />
              <StatCard
                title="Channels"
                value={`${stats.extendedCount} ext / ${stats.standardCount} std`}
              />
              <StatCard
                title="Uptime"
                value={formatUptime(poolGlobal?.uptime_secs || 0)}
              />
            </div>

            <UpstreamChannelTable
              extendedChannels={poolChannels?.extended_channels || []}
              standardChannels={poolChannels?.standard_channels || []}
              isLoading={isLoading}
            />
          </>
        )}
      </div>
    </Shell>
  );
}
