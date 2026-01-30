import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatHashrate, formatDifficulty, truncateHex, formatNumber } from '@/lib/utils';
import type { ServerExtendedChannelInfo, ServerStandardChannelInfo } from '@/types/api';

interface UpstreamChannelTableProps {
  extendedChannels: ServerExtendedChannelInfo[];
  standardChannels: ServerStandardChannelInfo[];
  isLoading?: boolean;
}

/**
 * Table component for displaying upstream connection channels.
 * Shows channels to the upstream server (Pool for JDC, Pool or JDC for Translator).
 * Matches Replit UI styling - rounded-xl, glass effect.
 */
export function UpstreamChannelTable({
  extendedChannels,
  standardChannels,
  isLoading,
}: UpstreamChannelTableProps) {
  if (isLoading) {
    return (
      <div className="rounded-xl border border-border/40 bg-card/40 backdrop-blur-sm overflow-hidden shadow-sm">
        <div className="p-8 text-center text-muted-foreground">
          Loading channels...
        </div>
      </div>
    );
  }

  const allChannels = [
    ...extendedChannels.map((c) => ({ ...c, type: 'extended' as const })),
    ...standardChannels.map((c) => ({ ...c, type: 'standard' as const })),
  ];

  if (allChannels.length === 0) {
    return (
      <div className="rounded-xl border border-border/40 bg-card/40 backdrop-blur-sm overflow-hidden shadow-sm">
        <div className="p-8 text-center text-muted-foreground">
          No upstream channels
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border/40 bg-card/40 backdrop-blur-sm overflow-hidden shadow-sm">
      <Table>
        <TableHeader className="bg-muted/30">
          <TableRow className="hover:bg-transparent border-border/40">
            <TableHead className="w-[80px]">Channel</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>User Identity</TableHead>
            <TableHead className="text-right">Hashrate</TableHead>
            <TableHead className="text-right">Shares</TableHead>
            <TableHead className="text-right hidden md:table-cell">Best Diff</TableHead>
            <TableHead className="hidden lg:table-cell">Target</TableHead>
            <TableHead className="hidden xl:table-cell">Version Rolling</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {allChannels.map((channel) => (
            <TableRow key={`${channel.type}-${channel.channel_id}`} className="hover:bg-muted/20 border-border/40">
              <TableCell className="font-mono text-xs">
                {channel.channel_id}
              </TableCell>
              <TableCell>
                <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                  channel.type === 'extended' 
                    ? 'bg-primary/10 text-primary border-primary/20' 
                    : 'bg-muted text-muted-foreground border-border'
                }`}>
                  {channel.type}
                </span>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {channel.user_identity || '-'}
              </TableCell>
              <TableCell className="text-right font-mono font-medium">
                {formatHashrate(channel.nominal_hashrate)}
              </TableCell>
              <TableCell className="text-right font-mono">
                {formatNumber(channel.shares_accepted)}
              </TableCell>
              <TableCell className="text-right font-mono hidden md:table-cell text-muted-foreground">
                {formatDifficulty(channel.best_diff)}
              </TableCell>
              <TableCell className="hidden lg:table-cell font-mono text-xs text-muted-foreground">
                {truncateHex(channel.target_hex, 8)}
              </TableCell>
              <TableCell className="hidden xl:table-cell">
                {channel.type === 'extended' && 'version_rolling' in channel ? (
                  <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                    (channel as ServerExtendedChannelInfo).version_rolling 
                      ? 'bg-green-500/10 text-green-500 border-green-500/20' 
                      : 'bg-muted text-muted-foreground border-border'
                  }`}>
                    {(channel as ServerExtendedChannelInfo).version_rolling ? 'Yes' : 'No'}
                  </span>
                ) : (
                  '-'
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
