import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn, formatHashrate, formatUptime } from '@/lib/utils';
import { runAsicAction } from '@/hooks/usePoolData';
import type { AsicMinerCapabilities } from '@/types/api';
import type { DownstreamWorkerRow } from './DownstreamWorkerTable';

interface MinerManagementModalProps {
  open: boolean;
  workers: DownstreamWorkerRow[];
  onClose: () => void;
  onRefresh: () => void;
}

function formatText(value: string | number | null | undefined) {
  return value == null || value === '' ? '-' : String(value);
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

function formatUptimeSeconds(value: number | null | undefined) {
  return value == null ? '-' : formatUptime(Math.max(0, Math.round(value)));
}

function formatBool(value: boolean | null | undefined) {
  if (value == null) return '-';
  return value ? 'Yes' : 'No';
}

function DetailField({
  label,
  value,
  className,
}: {
  label: string;
  value: string | number | null | undefined;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="truncate font-mono text-sm">{formatText(value)}</div>
    </div>
  );
}

const CAPABILITY_LABELS: Array<[keyof AsicMinerCapabilities, string]> = [
  ['telemetry', 'Telemetry'],
  ['restart', 'Restart'],
  ['pause', 'Pause'],
  ['resume', 'Resume'],
  ['blink_led', 'Blink LED'],
  ['pools_config', 'Pool config'],
  ['power_limit', 'Power limit'],
  ['tuning_config', 'Tuning config'],
];

export function MinerManagementModal({ open, workers, onClose, onRefresh }: MinerManagementModalProps) {
  const [isWorking, setIsWorking] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedWorkers = useMemo(
    () => workers.filter((worker) => worker.channel_type === 'sv1' && worker.peer_ip && worker.asic_client_id != null),
    [workers]
  );
  const telemetryAvailableWorkers = useMemo(
    () => selectedWorkers.filter((worker) => worker.asic_probe_status === 'available'),
    [selectedWorkers]
  );
  const single = selectedWorkers.length === 1 ? selectedWorkers[0] : null;

  useEffect(() => {
    if (!open) return;
    setStatus(null);
    setError(null);
  }, [open]);

  if (!open) return null;

  const applyToSelected = async (operation: (worker: DownstreamWorkerRow) => Promise<void>, actionLabel: string) => {
    setIsWorking(true);
    setError(null);
    setStatus(null);
    try {
      const results = await Promise.allSettled(selectedWorkers.map(operation));
      const failures = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected');
      const successCount = results.length - failures.length;

      if (successCount > 0) {
        setStatus(`${actionLabel} sent to ${successCount} miner(s)`);
      }

      if (failures.length > 0) {
        const firstError = failures[0].reason instanceof Error
          ? failures[0].reason.message
          : String(failures[0].reason || 'Miner operation failed');
        setError(`${failures.length} miner(s) failed: ${firstError}`);
      }

      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Miner operation failed');
    } finally {
      setIsWorking(false);
    }
  };

  const runAction = (action: 'blink' | 'reboot' | 'pause' | 'resume') => {
    if (selectedWorkers.length === 0) {
      setError('Select at least one SV1 miner endpoint.');
      return;
    }
    if (action === 'reboot' && !window.confirm(`Reboot ${selectedWorkers.length} miner(s)?`)) return;
    const actionLabel = action === 'resume' ? 'Start' : action === 'pause' ? 'Stop' : action === 'blink' ? 'Blink' : 'Reboot';
    void applyToSelected(
      (worker) => runAsicAction(worker.asic_client_id!, action),
      actionLabel
    );
  };

  const asic = single?.asic ?? null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-6xl flex-col rounded-lg border border-border bg-background shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="text-base font-semibold">
              {single ? `Manage ${single.peer_ip}` : `Manage ${selectedWorkers.length} miners`}
            </h2>
            <p className="text-xs text-muted-foreground">
              {single?.asic ? `${single.asic.make} ${single.asic.model}` : 'ASIC controls use asic-rs capabilities reported by the miner.'}
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="grid min-h-0 gap-5 overflow-y-auto p-5 lg:grid-cols-[1fr_360px]">
          <div className="space-y-5">
            {asic ? (
              <>
                <section className="rounded-lg border border-border p-4">
                  <div className="mb-3 text-sm font-medium">Telemetry</div>
                  <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
                    <DetailField label="Status" value={asic.is_mining ? 'Mining' : 'Stopped'} />
                    <DetailField label="Hashrate" value={asic.hashrate_hs != null ? formatHashrate(asic.hashrate_hs) : '-'} />
                    <DetailField label="Expected Hashrate" value={asic.expected_hashrate_hs != null ? formatHashrate(asic.expected_hashrate_hs) : '-'} />
                    <DetailField label="Power Draw" value={formatPower(asic.power_w)} />
                    <DetailField label="Efficiency" value={formatEfficiency(asic.efficiency_j_th)} />
                    <DetailField label="Average Temp" value={formatTemperature(asic.average_temperature_c)} />
                    <DetailField label="Fluid Temp" value={formatTemperature(asic.fluid_temperature_c)} />
                    <DetailField label="Uptime" value={formatUptimeSeconds(asic.uptime_secs)} />
                  </div>
                </section>

                <section className="rounded-lg border border-border p-4">
                  <div className="mb-3 text-sm font-medium">Device</div>
                  <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
                    <DetailField label="IP" value={asic.ip} />
                    <DetailField label="Make" value={asic.make} />
                    <DetailField label="Model" value={asic.model} />
                    <DetailField label="Firmware" value={asic.firmware} />
                    <DetailField label="Firmware Version" value={asic.firmware_version} />
                    <DetailField label="Serial" value={asic.serial_number} />
                    <DetailField label="MAC" value={asic.mac_address} />
                    <DetailField label="Hostname" value={asic.hostname} />
                    <DetailField label="API Version" value={asic.api_version} />
                    <DetailField label="Control Board" value={asic.control_board_version} />
                    <DetailField label="Light Flashing" value={formatBool(asic.light_flashing)} />
                    <DetailField label="Last Updated" value={new Date(asic.last_updated_at * 1000).toLocaleString()} />
                  </div>
                </section>

                <section className="rounded-lg border border-border p-4">
                  <div className="mb-3 text-sm font-medium">Hardware</div>
                  <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
                    <DetailField label="Expected Hashboards" value={asic.expected_hashboards} />
                    <DetailField label="Expected Chips" value={asic.expected_chips} />
                    <DetailField label="Total Chips" value={asic.total_chips} />
                    <DetailField label="Expected Fans" value={asic.expected_fans} />
                  </div>
                </section>

                {asic.hashboards.length > 0 && (
                  <section className="rounded-lg border border-border p-4">
                    <div className="mb-3 text-sm font-medium">Hashboards</div>
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[820px] text-sm">
                        <thead className="text-xs text-muted-foreground">
                          <tr className="border-b border-border">
                            <th className="py-2 text-left font-medium">Board</th>
                            <th className="py-2 text-right font-medium">Hashrate</th>
                            <th className="py-2 text-right font-medium">Expected</th>
                            <th className="py-2 text-right font-medium">Board Temp</th>
                            <th className="py-2 text-right font-medium">Intake</th>
                            <th className="py-2 text-right font-medium">Outlet</th>
                            <th className="py-2 text-right font-medium">Chips</th>
                            <th className="py-2 text-right font-medium">Voltage</th>
                            <th className="py-2 text-right font-medium">Freq</th>
                            <th className="py-2 text-right font-medium">Active</th>
                          </tr>
                        </thead>
                        <tbody>
                          {asic.hashboards.map((board) => (
                            <tr key={board.position} className="border-b border-border/60 last:border-0">
                              <td className="py-2 font-mono">{board.position}</td>
                              <td className="py-2 text-right font-mono">{board.hashrate_hs != null ? formatHashrate(board.hashrate_hs) : '-'}</td>
                              <td className="py-2 text-right font-mono">{board.expected_hashrate_hs != null ? formatHashrate(board.expected_hashrate_hs) : '-'}</td>
                              <td className="py-2 text-right font-mono">{formatTemperature(board.board_temperature_c)}</td>
                              <td className="py-2 text-right font-mono">{formatTemperature(board.intake_temperature_c)}</td>
                              <td className="py-2 text-right font-mono">{formatTemperature(board.outlet_temperature_c)}</td>
                              <td className="py-2 text-right font-mono">{board.working_chips ?? '-'} / {board.expected_chips ?? '-'}</td>
                              <td className="py-2 text-right font-mono">{board.voltage_v == null ? '-' : `${board.voltage_v.toFixed(2)} V`}</td>
                              <td className="py-2 text-right font-mono">{board.frequency_mhz == null ? '-' : `${Math.round(board.frequency_mhz)} MHz`}</td>
                              <td className="py-2 text-right font-mono">{formatBool(board.active)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                )}

                {(asic.fans.length > 0 || asic.psu_fans.length > 0) && (
                  <section className="rounded-lg border border-border p-4">
                    <div className="mb-3 text-sm font-medium">Fans</div>
                    <div className="grid gap-3 md:grid-cols-2">
                      {[
                        ['Fans', asic.fans] as const,
                        ['PSU Fans', asic.psu_fans] as const,
                      ].map(([label, fans]) => (
                        <div key={label} className="rounded-md bg-muted/30 p-3">
                          <div className="mb-2 text-xs font-medium text-muted-foreground">{label}</div>
                          <div className="grid grid-cols-2 gap-2 text-sm">
                            {fans.length === 0 ? (
                              <span className="text-muted-foreground">-</span>
                            ) : fans.map((fan) => (
                              <div key={`${label}-${fan.position}`} className="flex justify-between gap-3 font-mono">
                                <span>{fan.position}</span>
                                <span>{fan.rpm == null ? '-' : `${fan.rpm.toLocaleString()} RPM`}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {asic.pools.length > 0 && (
                  <section className="rounded-lg border border-border p-4">
                    <div className="mb-3 text-sm font-medium">Pools</div>
                    <div className="space-y-3">
                      {asic.pools.map((group) => (
                        <div key={group.name} className="rounded-md bg-muted/30 p-3">
                          <div className="mb-2 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                            <span>{group.name}</span>
                            <span>quota {group.quota}</span>
                          </div>
                          <div className="space-y-2">
                            {group.pools.map((pool, index) => (
                              <div key={`${group.name}-${pool.position ?? index}`} className="grid gap-2 text-sm md:grid-cols-[1fr_96px_96px_96px]">
                                <span className="truncate font-mono">{pool.url || '-'}</span>
                                <span className={cn('font-mono', pool.active ? 'text-emerald-500' : 'text-muted-foreground')}>
                                  {pool.active ? 'active' : 'inactive'}
                                </span>
                                <span className="font-mono">{pool.alive == null ? '-' : pool.alive ? 'alive' : 'dead'}</span>
                                <span className="font-mono">{pool.accepted_shares ?? 0}/{pool.rejected_shares ?? 0}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {asic.messages.length > 0 && (
                  <section className="rounded-lg border border-border p-4">
                    <div className="mb-3 text-sm font-medium">Messages</div>
                    <div className="space-y-2">
                      {asic.messages.slice(0, 8).map((message) => (
                        <div key={`${message.timestamp}-${message.code}-${message.message}`} className="rounded-md bg-muted/30 p-3 text-sm">
                          <div className="mb-1 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                            <span>{message.severity}</span>
                            <span>{new Date(message.timestamp * 1000).toLocaleString()}</span>
                          </div>
                          <div className="font-mono text-xs text-muted-foreground">{message.code}</div>
                          <div>{message.message}</div>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                <section className="rounded-lg border border-border p-4">
                  <div className="mb-3 text-sm font-medium">Capabilities</div>
                  <div className="flex flex-wrap gap-2">
                    {CAPABILITY_LABELS.map(([key, label]) => (
                      <span
                        key={key}
                        className={cn(
                          'rounded-full border px-2.5 py-1 text-xs font-medium',
                          asic.capabilities[key]
                            ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-500'
                            : 'border-border bg-muted text-muted-foreground'
                        )}
                      >
                        {label}
                      </span>
                    ))}
                  </div>
                </section>
              </>
            ) : (
              <div className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
                ASIC telemetry is not available for this selection.
              </div>
            )}
          </div>

          <div className="space-y-5">
            <div className="space-y-3 rounded-lg border border-border p-4">
              <div className="text-sm font-medium">Controls</div>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" onClick={() => runAction('resume')} disabled={isWorking || selectedWorkers.length === 0}>
                  Start
                </Button>
                <Button variant="outline" onClick={() => runAction('pause')} disabled={isWorking || selectedWorkers.length === 0}>
                  Stop
                </Button>
                <Button variant="outline" onClick={() => runAction('blink')} disabled={isWorking || selectedWorkers.length === 0}>
                  Blink
                </Button>
                <Button variant="outline" onClick={() => runAction('reboot')} disabled={isWorking || selectedWorkers.length === 0}>
                  Reboot
                </Button>
              </div>
              {status && <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-500">{status}</div>}
              {error && (
                <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-500">
                  {error}
                </div>
              )}
              {selectedWorkers.length > 0 && telemetryAvailableWorkers.length < selectedWorkers.length && (
                <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                  Actions are sent to selected miner endpoints. Miners without a supported reachable
                  management API will report an error.
                </div>
              )}
            </div>

            <div className="rounded-lg border border-border p-4 text-sm">
              <div className="mb-3 font-medium">Selection</div>
              <div className="space-y-2 text-muted-foreground">
                <div className="flex justify-between gap-3">
                  <span>Miners</span>
                  <span className="font-mono text-foreground">{selectedWorkers.length}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span>Telemetry available</span>
                  <span className="font-mono text-foreground">{telemetryAvailableWorkers.length}</span>
                </div>
                {single && (
                  <>
                    <div className="flex justify-between gap-3">
                      <span>Worker</span>
                      <span className="truncate font-mono text-foreground">{single.user_identity || '-'}</span>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span>Endpoint</span>
                      <span className="font-mono text-foreground">{single.peer_ip}:{single.peer_port ?? '-'}</span>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
