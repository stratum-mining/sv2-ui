import { useMemo } from 'react';
import { Shell } from '@/components/layout/Shell';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { StatCard } from '@/components/data/StatCard';
import { UpstreamChannelTable } from '@/components/data/UpstreamChannelTable';
import { usePoolData } from '@/hooks/usePoolData';
import { formatHashrate, formatDifficulty, formatUptime } from '@/lib/utils';
import { 
  AlertTriangle,
  CheckCircle2,
  Activity,
  Network,
  Clock,
  Server,
  ArrowUpRight,
} from 'lucide-react';
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
      <div className="space-y-8">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Pool Statistics</h2>
          <p className="text-muted-foreground">
            Real-time telemetry for upstream stratum connection via {modeLabel}.
            {isJdMode && ' (Job Declaration enabled)'}
          </p>
        </div>

        {/* Loading / Error States */}
        {isLoading && (
          <div className="rounded-xl border border-border/40 bg-card/40 backdrop-blur-sm p-8 text-center text-muted-foreground">
            Loading pool statistics...
          </div>
        )}

        {isError && (
          <div className="flex items-center gap-3 rounded-xl border border-red-500/40 bg-red-500/10 px-5 py-4 text-sm text-red-500">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>Failed to connect to monitoring API. Make sure {modeLabel} is running.</span>
          </div>
        )}

        {!isLoading && !isError && (
          <>
            {/* Primary Stats Grid */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <StatCard
                title="Shares Submitted"
                value={
                  <span>
                    {stats.sharesAccepted.toLocaleString()}
                    <span className="text-muted-foreground text-lg"> / {stats.sharesSubmitted.toLocaleString()}</span>
                  </span>
                }
                icon={<CheckCircle2 className="h-4 w-4 text-green-500" />}
                subtitle={`${acceptanceRate}% acceptance rate`}
              />

              <StatCard
                title="Best Difficulty"
                value={formatDifficulty(stats.bestDiff)}
                icon={<ArrowUpRight className="h-4 w-4 text-primary" />}
                subtitle="Highest share difficulty"
              />

              <StatCard
                title="Share Work Sum"
                value={stats.shareWorkSum.toLocaleString()}
                icon={<Activity className="h-4 w-4 text-green-500" />}
                subtitle="Cumulative work submitted"
              />

              <StatCard
                title="Pool Channels"
                value={
                  <span>
                    {stats.extendedCount} <span className="text-muted-foreground text-lg">ext</span>
                    {' / '}
                    {stats.standardCount} <span className="text-muted-foreground text-lg">std</span>
                  </span>
                }
                icon={<Network className="h-4 w-4 text-purple-500" />}
                subtitle={isJdMode ? 'JD Mode Active' : 'Direct to Pool'}
              />
            </div>

            {/* Secondary Stats */}
            <div className="grid gap-4 md:grid-cols-3">
              <StatCard
                title="Upstream Hashrate"
                value={formatHashrate(poolGlobal?.server?.total_hashrate || 0)}
                icon={<Activity className="h-4 w-4 text-green-500" />}
                subtitle="Reported to pool"
              />

              <StatCard
                title="Uptime"
                value={formatUptime(poolGlobal?.uptime_secs || 0)}
                icon={<Clock className="h-4 w-4 text-blue-500" />}
                subtitle="Connection duration"
              />

              <StatCard
                title="Data Source"
                value={modeLabel}
                icon={<Server className="h-4 w-4 text-primary" />}
                subtitle={isJdMode ? 'Job Declaration Protocol' : 'Standard Stratum V2'}
              />
            </div>

            {/* Connection Details Card */}
            <Card className="glass-card border-none shadow-md bg-card/40">
              <CardHeader>
                <CardTitle>Connection Details</CardTitle>
                <CardDescription>Upstream channel information</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Data Source</p>
                    <p className="font-medium">{modeLabel}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Protocol</p>
                    <p className="font-medium">Stratum V2</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Mode</p>
                    <p className="font-medium">{isJdMode ? 'Job Declaration' : 'Standard'}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Extended Channels</p>
                    <p className="font-medium">{stats.extendedCount}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Standard Channels</p>
                    <p className="font-medium">{stats.standardCount}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Status</p>
                    <p className="font-medium text-green-500">Connected</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Channels Table */}
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold">Pool Channels</h3>
                <p className="text-sm text-muted-foreground">
                  Active mining channels with the upstream pool
                </p>
              </div>
              <UpstreamChannelTable
                extendedChannels={poolChannels?.extended_channels || []}
                standardChannels={poolChannels?.standard_channels || []}
                isLoading={isLoading}
              />
            </div>
          </>
        )}
      </div>
    </Shell>
  );
}
