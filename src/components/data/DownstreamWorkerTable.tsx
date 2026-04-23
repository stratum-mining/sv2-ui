import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { InfoPopover } from '@/components/ui/info-popover';
import { cn, formatDifficulty, formatHashrate } from '@/lib/utils';

export type ChannelType = 'sv1' | 'sv2_standard' | 'sv2_extended';

export interface DownstreamWorkerRow {
  connection_id: number;
  channel_id: number | null;
  channel_type: ChannelType;
  user_identity: string;
  estimated_hashrate: number | null;
  best_diff: number | null;
}

export type DownstreamWorkerSortKey =
  | 'connection_id'
  | 'channel_id'
  | 'channel_type'
  | 'user_identity'
  | 'estimated_hashrate'
  | 'best_diff';

interface DownstreamWorkerTableProps {
  workers: DownstreamWorkerRow[];
  isLoading?: boolean;
  sortKey: DownstreamWorkerSortKey;
  sortDir: 'asc' | 'desc';
  onSort: (key: DownstreamWorkerSortKey) => void;
  showBestDiff?: boolean;
}

const TABLE_CONTAINER_CLASS_NAME = 'glass-table shadow-sm';

function SortIcon({
  column,
  sortKey,
  sortDir,
}: {
  column: DownstreamWorkerSortKey;
  sortKey: DownstreamWorkerSortKey;
  sortDir: 'asc' | 'desc';
}) {
  if (column !== sortKey) return <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground/50" />;
  return sortDir === 'asc'
    ? <ChevronUp className="h-3.5 w-3.5" />
    : <ChevronDown className="h-3.5 w-3.5" />;
}

function getChannelTypeLabel(channelType: ChannelType) {
  switch (channelType) {
    case 'sv1':
      return 'SV1';
    case 'sv2_standard':
      return 'SV2 Standard';
    case 'sv2_extended':
      return 'SV2 Extended';
  }
}

function getChannelTypeClassName(channelType: ChannelType) {
  switch (channelType) {
    case 'sv1':
      return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
    case 'sv2_standard':
      return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
    case 'sv2_extended':
      return 'bg-sky-500/10 text-sky-500 border-sky-500/20';
  }
}

/**
 * Shared worker table for downstream connections across dashboard modes.
 */
export function DownstreamWorkerTable({
  workers,
  isLoading,
  sortKey,
  sortDir,
  onSort,
  showBestDiff = true,
}: DownstreamWorkerTableProps) {
  if (isLoading) {
    return (
      <div className={TABLE_CONTAINER_CLASS_NAME}>
        <div className="p-8 text-center text-muted-foreground">
          Loading workers...
        </div>
      </div>
    );
  }

  return (
    <div className={TABLE_CONTAINER_CLASS_NAME}>
      {workers.length === 0 ? (
        <div className="p-8 text-center text-muted-foreground">
          No workers connected
        </div>
      ) : (
        <Table>
          <TableHeader className="bg-muted/30">
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-[132px] cursor-pointer select-none whitespace-nowrap" onClick={() => onSort('connection_id')}>
                <span className="flex items-center gap-1 whitespace-nowrap hover:text-foreground transition-colors">
                  Connection Id
                  <SortIcon column="connection_id" sortKey={sortKey} sortDir={sortDir} />
                  <InfoPopover>
                    Worker channels with the same connection ID belong to the same downstream
                    connection.
                  </InfoPopover>
                </span>
              </TableHead>
              <TableHead className="w-[120px] cursor-pointer select-none whitespace-nowrap" onClick={() => onSort('channel_id')}>
                <span className="flex items-center gap-1 whitespace-nowrap hover:text-foreground transition-colors">
                  Channel Id <SortIcon column="channel_id" sortKey={sortKey} sortDir={sortDir} />
                </span>
              </TableHead>
              <TableHead className="w-[220px] cursor-pointer select-none whitespace-nowrap" onClick={() => onSort('channel_type')}>
                <span className="flex items-center gap-1 whitespace-nowrap hover:text-foreground transition-colors">
                  Channel Type <SortIcon column="channel_type" sortKey={sortKey} sortDir={sortDir} />
                </span>
              </TableHead>
              <TableHead className="cursor-pointer select-none" onClick={() => onSort('user_identity')}>
                <span className="flex items-center gap-1 hover:text-foreground transition-colors">
                  User Identity <SortIcon column="user_identity" sortKey={sortKey} sortDir={sortDir} />
                </span>
              </TableHead>
              <TableHead className="text-right cursor-pointer select-none" onClick={() => onSort('estimated_hashrate')}>
                <span className="flex items-center justify-end gap-1 hover:text-foreground transition-colors">
                  Estimated Hashrate
                  <SortIcon column="estimated_hashrate" sortKey={sortKey} sortDir={sortDir} />
                  <InfoPopover>
                    Your proxy cannot directly measure how fast your miner is hashing. It estimates
                    hashrate indirectly: it knows the difficulty of the work it assigned you, and it
                    counts the valid shares you submit. From those two values it calculates how much
                    hashing you must be doing. This is your estimated hashrate. Sampled every 5
                    seconds. May take up to 60 seconds to reflect your miner's actual output after
                    connecting.
                  </InfoPopover>
                </span>
              </TableHead>
              {showBestDiff && (
                <TableHead
                  className="hidden lg:table-cell text-right cursor-pointer select-none"
                  onClick={() => onSort('best_diff')}
                >
                  <span className="flex items-center justify-end gap-1 hover:text-foreground transition-colors">
                    Best Diff <SortIcon column="best_diff" sortKey={sortKey} sortDir={sortDir} />
                  </span>
                </TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {workers.map((worker) => (
              <TableRow key={`${worker.connection_id}-${worker.channel_type}-${worker.channel_id ?? 'na'}-${worker.user_identity}`} className="hover:bg-muted/20 group">
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {worker.connection_id}
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {worker.channel_id ?? '-'}
                </TableCell>
                <TableCell>
                  <span
                    className={cn(
                      'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold',
                      getChannelTypeClassName(worker.channel_type)
                    )}
                  >
                    {getChannelTypeLabel(worker.channel_type)}
                  </span>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {worker.user_identity || '-'}
                </TableCell>
                <TableCell className="text-right font-mono font-medium">
                  {worker.estimated_hashrate !== null ? `~${formatHashrate(worker.estimated_hashrate)}` : '-'}
                </TableCell>
                {showBestDiff && (
                  <TableCell className="hidden lg:table-cell text-right font-mono text-muted-foreground">
                    {worker.best_diff !== null && worker.best_diff > 0 ? formatDifficulty(worker.best_diff) : '-'}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
