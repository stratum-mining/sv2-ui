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
import { Button } from '@/components/ui/button';
import { cn, formatDifficulty, formatHashrate, formatUptime } from '@/lib/utils';
import type { AsicMinerTelemetry } from '@/types/api';

export type ChannelType = 'sv1' | 'sv2_standard' | 'sv2_extended';
export type AsicProbeStatus = 'not_applicable' | 'probing' | 'available' | 'unavailable';

export interface DownstreamWorkerRow {
  row_id: string;
  connection_id: number;
  channel_id: number | null;
  asic_client_id?: number | null;
  peer_ip?: string | null;
  peer_port?: number | null;
  asic?: AsicMinerTelemetry | null;
  asic_status?: string | null;
  asic_probe_status?: AsicProbeStatus;
  asic_error?: string | null;
  miner_status?: string | null;
  asic_make?: string | null;
  asic_model?: string | null;
  asic_firmware_version?: string | null;
  asic_hashrate_hs?: number | null;
  asic_expected_hashrate_hs?: number | null;
  asic_temperature_c?: number | null;
  asic_fluid_temperature_c?: number | null;
  asic_power_w?: number | null;
  asic_efficiency_j_th?: number | null;
  asic_uptime_secs?: number | null;
  channel_type: ChannelType;
  user_identity: string;
  estimated_hashrate: number | null;
  best_diff: number | null;
}

export type DownstreamWorkerSortKey =
  | 'connection_id'
  | 'channel_id'
  | 'peer_ip'
  | 'asic_status'
  | 'miner_status'
  | 'asic_make'
  | 'asic_model'
  | 'asic_firmware_version'
  | 'asic_hashrate_hs'
  | 'asic_expected_hashrate_hs'
  | 'asic_temperature_c'
  | 'asic_fluid_temperature_c'
  | 'asic_power_w'
  | 'asic_efficiency_j_th'
  | 'asic_uptime_secs'
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
  selectedIds?: Set<string>;
  onToggleWorker?: (worker: DownstreamWorkerRow) => void;
  onToggleAll?: (workers: DownstreamWorkerRow[]) => void;
  onManageWorker?: (worker: DownstreamWorkerRow) => void;
  showAsicTelemetry?: boolean;
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

function getMinerEndpoint(worker: DownstreamWorkerRow) {
  if (!worker.peer_ip) return '-';
  return worker.peer_port ? `${worker.peer_ip}:${worker.peer_port}` : worker.peer_ip;
}

function getAsicStatus(worker: DownstreamWorkerRow) {
  if (!worker.peer_ip) return '-';
  if (worker.asic_status) return worker.asic_status;
  if (worker.asic) return 'Available';
  return '-';
}

function getAsicStatusClassName(worker: DownstreamWorkerRow) {
  const status = getAsicStatus(worker);
  if (status === 'Available') return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
  if (status === 'No telemetry') return 'bg-muted text-muted-foreground border-border';
  return 'bg-transparent text-muted-foreground border-transparent';
}

function getMinerStatus(worker: DownstreamWorkerRow) {
  if (worker.miner_status) return worker.miner_status;
  if (!worker.asic) return '-';
  return worker.asic.is_mining ? 'Mining' : 'Stopped';
}

function getMinerStatusClassName(worker: DownstreamWorkerRow) {
  const status = getMinerStatus(worker);
  if (status === 'Mining') return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
  if (status === 'Stopped') return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
  return 'bg-transparent text-muted-foreground border-transparent';
}

function getAsicStatusTitle(worker: DownstreamWorkerRow) {
  const status = getAsicStatus(worker);
  if (worker.asic_error) {
    return worker.asic_error;
  }
  if (status === 'No telemetry') {
    return 'No ASIC telemetry is available for this row.';
  }
  return undefined;
}

function formatTemperature(value: number | null | undefined) {
  return value == null ? '-' : `${Math.round(value)} C`;
}

function formatPower(value: number | null | undefined) {
  return value == null ? '-' : `${Math.round(value).toLocaleString()} W`;
}

function formatEfficiency(value: number | null | undefined) {
  return value == null ? '-' : `${value.toFixed(1)} J/TH`;
}

function formatTelemetryUptime(value: number | null | undefined) {
  return value == null ? '-' : formatUptime(Math.max(0, Math.round(value)));
}

function formatTextValue(value: string | null | undefined) {
  return value || '-';
}

export function isManageableWorker(worker: DownstreamWorkerRow) {
  return worker.channel_type === 'sv1' && !!worker.peer_ip && worker.asic_client_id != null && worker.asic_probe_status === 'available';
}

export function canOpenMinerManagement(worker: DownstreamWorkerRow) {
  return worker.channel_type === 'sv1' && !!worker.peer_ip && worker.asic_client_id != null;
}

function isSelectable(worker: DownstreamWorkerRow) {
  return canOpenMinerManagement(worker);
}

function getManageTitle(worker: DownstreamWorkerRow) {
  if (canOpenMinerManagement(worker)) return 'Manage miner';
  if (worker.channel_type !== 'sv1') return 'ASIC management is only available for SV1 miners connected through the Translator.';
  if (worker.asic_client_id == null) return 'No matching Translator SV1 miner is available for this row.';
  if (!worker.peer_ip) return 'No miner endpoint is available for this row.';
  return 'No miner endpoint is available for this row.';
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
  selectedIds,
  onToggleWorker,
  onToggleAll,
  onManageWorker,
  showAsicTelemetry = true,
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

  const showSelection = showAsicTelemetry && Boolean(onToggleWorker);
  const showManage = showAsicTelemetry && Boolean(onManageWorker);
  const canManageWorker = (worker: DownstreamWorkerRow) => Boolean(showManage && canOpenMinerManagement(worker));
  const tableMinWidth = showAsicTelemetry
    ? (showManage ? 'min-w-[2520px]' : 'min-w-[2440px]')
    : (showManage ? 'min-w-[1220px]' : 'min-w-[1120px]');

  return (
    <div className={TABLE_CONTAINER_CLASS_NAME}>
      {workers.length === 0 ? (
        <div className="p-8 text-center text-muted-foreground">
          No workers connected
        </div>
      ) : (
        <Table className={cn(tableMinWidth)}>
          <TableHeader className="bg-muted/30">
            <TableRow className="hover:bg-transparent">
              {showSelection && (
                <TableHead className="w-[44px]">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-border"
                    checked={workers.some(isSelectable) && workers.filter(isSelectable).every((worker) => selectedIds?.has(worker.row_id))}
                    disabled={!workers.some(isSelectable)}
                    onChange={() => onToggleAll?.(workers.filter(isSelectable))}
                    aria-label="Select all visible miners"
                  />
                </TableHead>
              )}
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
              <TableHead className="w-[180px] cursor-pointer select-none whitespace-nowrap" onClick={() => onSort('peer_ip')}>
                <span className="flex items-center gap-1 whitespace-nowrap hover:text-foreground transition-colors">
                  Connection IP <SortIcon column="peer_ip" sortKey={sortKey} sortDir={sortDir} />
                </span>
              </TableHead>
              <TableHead className="w-[160px] cursor-pointer select-none whitespace-nowrap" onClick={() => onSort('channel_type')}>
                <span className="flex items-center gap-1 whitespace-nowrap hover:text-foreground transition-colors">
                  Channel Type <SortIcon column="channel_type" sortKey={sortKey} sortDir={sortDir} />
                </span>
              </TableHead>
              <TableHead className="min-w-[220px] cursor-pointer select-none" onClick={() => onSort('user_identity')}>
                <span className="flex items-center gap-1 hover:text-foreground transition-colors">
                  User Identity <SortIcon column="user_identity" sortKey={sortKey} sortDir={sortDir} />
                </span>
              </TableHead>
              <TableHead className="min-w-[180px] text-right cursor-pointer select-none" onClick={() => onSort('estimated_hashrate')}>
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
                  className="w-[120px] text-right cursor-pointer select-none whitespace-nowrap"
                  onClick={() => onSort('best_diff')}
                >
                  <span className="flex items-center justify-end gap-1 whitespace-nowrap hover:text-foreground transition-colors">
                    Best Diff <SortIcon column="best_diff" sortKey={sortKey} sortDir={sortDir} />
                  </span>
                </TableHead>
              )}
              {showAsicTelemetry && (
                <>
                  <TableHead className="w-[152px] cursor-pointer select-none whitespace-nowrap" onClick={() => onSort('asic_status')}>
                    <span className="flex items-center gap-1 whitespace-nowrap hover:text-foreground transition-colors">
                      ASIC Telemetry <SortIcon column="asic_status" sortKey={sortKey} sortDir={sortDir} />
                      <InfoPopover>
                        Shows whether this dashboard can read telemetry from a supported miner
                        management API. Rented or proxied hashpower, unsupported miners, or miners
                        whose management API is unreachable can be connected without exposing
                        telemetry here.
                      </InfoPopover>
                    </span>
                  </TableHead>
                  <TableHead className="w-[132px] cursor-pointer select-none whitespace-nowrap" onClick={() => onSort('miner_status')}>
                    <span className="flex items-center gap-1 whitespace-nowrap hover:text-foreground transition-colors">
                      Miner Status <SortIcon column="miner_status" sortKey={sortKey} sortDir={sortDir} />
                    </span>
                  </TableHead>
                  <TableHead className="w-[120px] cursor-pointer select-none whitespace-nowrap" onClick={() => onSort('asic_make')}>
                    <span className="flex items-center gap-1 whitespace-nowrap hover:text-foreground transition-colors">
                      Make <SortIcon column="asic_make" sortKey={sortKey} sortDir={sortDir} />
                    </span>
                  </TableHead>
                  <TableHead className="w-[132px] cursor-pointer select-none whitespace-nowrap" onClick={() => onSort('asic_model')}>
                    <span className="flex items-center gap-1 whitespace-nowrap hover:text-foreground transition-colors">
                      Model <SortIcon column="asic_model" sortKey={sortKey} sortDir={sortDir} />
                    </span>
                  </TableHead>
                  <TableHead className="w-[152px] cursor-pointer select-none whitespace-nowrap" onClick={() => onSort('asic_firmware_version')}>
                    <span className="flex items-center gap-1 whitespace-nowrap hover:text-foreground transition-colors">
                      Firmware <SortIcon column="asic_firmware_version" sortKey={sortKey} sortDir={sortDir} />
                    </span>
                  </TableHead>
                  <TableHead className="w-[156px] text-right cursor-pointer select-none whitespace-nowrap" onClick={() => onSort('asic_hashrate_hs')}>
                    <span className="flex items-center justify-end gap-1 whitespace-nowrap hover:text-foreground transition-colors">
                      ASIC Hashrate <SortIcon column="asic_hashrate_hs" sortKey={sortKey} sortDir={sortDir} />
                    </span>
                  </TableHead>
                  <TableHead className="w-[176px] text-right cursor-pointer select-none whitespace-nowrap" onClick={() => onSort('asic_expected_hashrate_hs')}>
                    <span className="flex items-center justify-end gap-1 whitespace-nowrap hover:text-foreground transition-colors">
                      Expected Hashrate <SortIcon column="asic_expected_hashrate_hs" sortKey={sortKey} sortDir={sortDir} />
                    </span>
                  </TableHead>
                  <TableHead className="w-[120px] text-right cursor-pointer select-none whitespace-nowrap" onClick={() => onSort('asic_power_w')}>
                    <span className="flex items-center justify-end gap-1 whitespace-nowrap hover:text-foreground transition-colors">
                      Power Draw <SortIcon column="asic_power_w" sortKey={sortKey} sortDir={sortDir} />
                    </span>
                  </TableHead>
                  <TableHead className="w-[132px] text-right cursor-pointer select-none whitespace-nowrap" onClick={() => onSort('asic_efficiency_j_th')}>
                    <span className="flex items-center justify-end gap-1 whitespace-nowrap hover:text-foreground transition-colors">
                      Efficiency J/TH <SortIcon column="asic_efficiency_j_th" sortKey={sortKey} sortDir={sortDir} />
                    </span>
                  </TableHead>
                  <TableHead className="w-[120px] text-right cursor-pointer select-none whitespace-nowrap" onClick={() => onSort('asic_temperature_c')}>
                    <span className="flex items-center justify-end gap-1 whitespace-nowrap hover:text-foreground transition-colors">
                      Avg Temp <SortIcon column="asic_temperature_c" sortKey={sortKey} sortDir={sortDir} />
                    </span>
                  </TableHead>
                  <TableHead className="w-[120px] text-right cursor-pointer select-none whitespace-nowrap" onClick={() => onSort('asic_fluid_temperature_c')}>
                    <span className="flex items-center justify-end gap-1 whitespace-nowrap hover:text-foreground transition-colors">
                      Fluid Temp <SortIcon column="asic_fluid_temperature_c" sortKey={sortKey} sortDir={sortDir} />
                    </span>
                  </TableHead>
                  <TableHead className="w-[112px] text-right cursor-pointer select-none whitespace-nowrap" onClick={() => onSort('asic_uptime_secs')}>
                    <span className="flex items-center justify-end gap-1 whitespace-nowrap hover:text-foreground transition-colors">
                      Uptime <SortIcon column="asic_uptime_secs" sortKey={sortKey} sortDir={sortDir} />
                    </span>
                  </TableHead>
                </>
              )}
              {showManage && (
                <TableHead className="sticky right-0 z-10 w-[96px] bg-card text-right">
                  Manage
                </TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {workers.map((worker) => (
              <TableRow
                key={worker.row_id}
                className={cn('hover:bg-muted/20 group', canManageWorker(worker) && 'cursor-pointer')}
                onClick={() => {
                  if (canManageWorker(worker)) {
                    onManageWorker?.(worker);
                  }
                }}
              >
                {showSelection && (
                  <TableCell>
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-border"
                      checked={isSelectable(worker) && (selectedIds?.has(worker.row_id) ?? false)}
                      disabled={!isSelectable(worker)}
                      onClick={(event) => event.stopPropagation()}
                      onChange={() => onToggleWorker?.(worker)}
                      aria-label={`Select miner ${worker.connection_id}`}
                    />
                  </TableCell>
                )}
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {worker.connection_id}
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {worker.channel_id ?? '-'}
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {getMinerEndpoint(worker)}
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
                <TableCell className="max-w-[260px] text-muted-foreground">
                  <span className="block truncate">{worker.user_identity || '-'}</span>
                </TableCell>
                <TableCell className="text-right font-mono font-medium">
                  {worker.estimated_hashrate !== null ? `~${formatHashrate(worker.estimated_hashrate)}` : '-'}
                </TableCell>
                {showBestDiff && (
                  <TableCell className="text-right font-mono text-muted-foreground">
                    {worker.best_diff !== null && worker.best_diff > 0 ? formatDifficulty(worker.best_diff) : '-'}
                  </TableCell>
                )}
                {showAsicTelemetry && (
                  <>
                    <TableCell>
                      <span
                        className={cn('inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold', getAsicStatusClassName(worker))}
                        title={getAsicStatusTitle(worker)}
                      >
                        {getAsicStatus(worker)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span
                        className={cn('inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold', getMinerStatusClassName(worker))}
                      >
                        {getMinerStatus(worker)}
                      </span>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {formatTextValue(worker.asic_make)}
                    </TableCell>
                    <TableCell className="max-w-[160px] font-mono text-xs text-muted-foreground">
                      <span className="block truncate">{formatTextValue(worker.asic_model)}</span>
                    </TableCell>
                    <TableCell className="max-w-[180px] font-mono text-xs text-muted-foreground">
                      <span className="block truncate">{formatTextValue(worker.asic_firmware_version)}</span>
                    </TableCell>
                    <TableCell className="text-right font-mono text-muted-foreground">
                      {worker.asic_hashrate_hs != null ? formatHashrate(worker.asic_hashrate_hs) : '-'}
                    </TableCell>
                    <TableCell className="text-right font-mono text-muted-foreground">
                      {worker.asic_expected_hashrate_hs != null ? formatHashrate(worker.asic_expected_hashrate_hs) : '-'}
                    </TableCell>
                    <TableCell className="text-right font-mono text-muted-foreground">
                      {formatPower(worker.asic_power_w)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-muted-foreground">
                      {formatEfficiency(worker.asic_efficiency_j_th)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-muted-foreground">
                      {formatTemperature(worker.asic_temperature_c)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-muted-foreground">
                      {formatTemperature(worker.asic_fluid_temperature_c)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-muted-foreground">
                      {formatTelemetryUptime(worker.asic_uptime_secs)}
                    </TableCell>
                  </>
                )}
                {showManage && (
                  <TableCell className="sticky right-0 z-10 bg-card text-right">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={!canOpenMinerManagement(worker)}
                      title={getManageTitle(worker)}
                      onClick={(event) => {
                        event.stopPropagation();
                        onManageWorker?.(worker);
                      }}
                    >
                      Manage
                    </Button>
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
