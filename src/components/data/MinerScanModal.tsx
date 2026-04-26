import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { defaultTranslatorPoolUrl, isConcreteTranslatorPoolUrl } from '@/lib/minerPool';
import {
  scanAsicNetwork,
  updateAsicPoolsByIp,
} from '@/hooks/usePoolData';
import { useMinerConnectionInfo } from '@/hooks/useMinerConnectionInfo';
import type { AsicDiscoveredMiner, AsicPoolGroupConfig, AsicScanResponse } from '@/types/api';

interface MinerScanModalProps {
  open: boolean;
  onClose: () => void;
  onRefresh: () => void;
}

function scanTargetForHost(host?: string | null) {
  const parts = (host || '').split('.');
  if (
    parts.length === 4 &&
    parts.every((part) => /^\d+$/.test(part) && Number(part) >= 0 && Number(part) <= 255)
  ) {
    return `${parts.slice(0, 3).join('.')}.0/24`;
  }
  return '192.168.1.0/24';
}

function poolGroups(url: string, username: string, password: string): AsicPoolGroupConfig[] {
  return [{
    name: 'default',
    quota: 1,
    pools: [{ url, username, password }],
  }];
}

function minerLabel(miner: AsicDiscoveredMiner) {
  return [miner.make, miner.model].filter(Boolean).join(' ') || miner.ip;
}

export function MinerScanModal({ open, onClose, onRefresh }: MinerScanModalProps) {
  const { data: minerConnection } = useMinerConnectionInfo();
  const [target, setTarget] = useState(() => scanTargetForHost());
  const [targetEdited, setTargetEdited] = useState(false);
  const [scan, setScan] = useState<AsicScanResponse | null>(null);
  const [selectedIps, setSelectedIps] = useState<Set<string>>(() => new Set());
  const [isScanning, setIsScanning] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const found = useMemo(() => scan?.found ?? [], [scan]);
  const selectedFound = useMemo(
    () => found.filter((miner) => selectedIps.has(miner.ip)),
    [found, selectedIps]
  );
  const translatorEndpoint = minerConnection?.translator_url || defaultTranslatorPoolUrl(minerConnection?.host);
  const translatorEndpointReady = isConcreteTranslatorPoolUrl(translatorEndpoint);
  const allFoundSelected = found.length > 0 && selectedFound.length === found.length;

  useEffect(() => {
    if (targetEdited) return;
    setTarget(scanTargetForHost(minerConnection?.host));
  }, [minerConnection?.host, targetEdited]);

  if (!open) return null;

  const runScan = async () => {
    setIsScanning(true);
    setError(null);
    setStatus(null);
    try {
      const targets = target.split(',').map((item) => item.trim()).filter(Boolean);
      const response = await scanAsicNetwork(targets);
      setScan(response);
      setSelectedIps(new Set(response.found.map((miner) => miner.ip)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not find miners');
    } finally {
      setIsScanning(false);
    }
  };

  const toggleMiner = (miner: AsicDiscoveredMiner) => {
    setSelectedIps((current) => {
      const next = new Set(current);
      if (next.has(miner.ip)) {
        next.delete(miner.ip);
      } else {
        next.add(miner.ip);
      }
      return next;
    });
  };

  const toggleAllFound = () => {
    setSelectedIps(allFoundSelected ? new Set() : new Set(found.map((miner) => miner.ip)));
  };

  const addSelected = async () => {
    if (!translatorEndpointReady) {
      setError('Set SV2_UI_MINER_HOST to the address miners can reach, then restart sv2-ui.');
      return;
    }
    if (selectedFound.length === 0) return;

    setIsAdding(true);
    setError(null);
    setStatus(null);
    try {
      await Promise.all(
        selectedFound.map((miner) => updateAsicPoolsByIp(
          miner.ip,
          poolGroups(translatorEndpoint, miner.hostname || miner.ip, 'x')
        ))
      );
      setStatus(`${selectedFound.length} miner${selectedFound.length === 1 ? '' : 's'} updated`);
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to configure selected miners');
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
      <div className="max-h-[calc(100vh-2rem)] w-full max-w-5xl overflow-y-auto rounded-lg border border-border bg-background shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="text-base font-semibold">Add miners</h2>
            <p className="text-xs text-muted-foreground">
              Found miners can be pointed to this dashboard.
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="space-y-5 p-5">
          <div className="rounded-md border border-border p-4">
            <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
              <div className="space-y-2">
                <div className="text-sm font-medium">Find miners automatically</div>
                <div className="text-xs text-muted-foreground">
                  Search a CIDR range or exact IP list, then select miners from the results below.
                </div>
                <Input
                  value={target}
                  onChange={(event) => {
                    setTargetEdited(true);
                    setTarget(event.target.value);
                  }}
                  placeholder="192.168.1.0/24 or comma-separated IPs"
                />
              </div>
              <Button
                className="lg:self-end"
                onClick={runScan}
                disabled={isScanning || !target.trim()}
              >
                {isScanning ? 'Finding miners...' : 'Find miners'}
              </Button>
            </div>
          </div>

          <div className="rounded-md border border-border">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div>
                <div className="text-sm font-medium">Discovered miners</div>
                <div className="text-xs text-muted-foreground">
                  {scan ? `${found.length} of ${scan.total_targets} targets` : 'Ready to find miners'}
                </div>
              </div>
              {found.length > 0 && (
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-border"
                    checked={allFoundSelected}
                    onChange={toggleAllFound}
                  />
                  Select all
                </label>
              )}
            </div>

            {found.length === 0 ? (
              <div className="flex min-h-[180px] flex-col items-center justify-center gap-2 px-6 text-center">
                <div className="text-sm font-medium">
                  {scan ? 'No miners found' : 'No miners found yet'}
                </div>
                <div className="max-w-md text-xs text-muted-foreground">
                  {scan
                    ? 'Try a narrower range or point the miner to this dashboard from its admin page.'
                    : 'Use the prefilled range or enter specific miner IP addresses.'}
                </div>
              </div>
            ) : (
              <Table className="min-w-[640px]">
                <TableHeader className="bg-muted/30">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-[44px]" />
                    <TableHead>Miner</TableHead>
                    <TableHead>Endpoint</TableHead>
                    <TableHead className="hidden md:table-cell">Firmware</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {found.map((miner) => (
                    <TableRow
                      key={miner.ip}
                      className="cursor-pointer hover:bg-muted/20"
                      onClick={() => toggleMiner(miner)}
                    >
                      <TableCell>
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-border"
                          checked={selectedIps.has(miner.ip)}
                          onClick={(event) => event.stopPropagation()}
                          onChange={() => toggleMiner(miner)}
                          aria-label={`Select miner ${miner.ip}`}
                        />
                      </TableCell>
                      <TableCell className="font-medium">{minerLabel(miner)}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {miner.ip}{miner.port ? `:${miner.port}` : ''}
                      </TableCell>
                      <TableCell className="hidden md:table-cell font-mono text-xs text-muted-foreground">
                        {miner.firmware_version || miner.firmware || '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>

          {translatorEndpointReady ? (
            <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              Selected miners will be pointed to <span className="font-mono text-foreground">{translatorEndpoint}</span>.
            </div>
          ) : (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-500">
              Could not detect a miner-reachable Translator address. Set
              <span className="font-mono"> SV2_UI_MINER_HOST</span> to the IP or hostname miners
              can reach, then restart sv2-ui.
            </div>
          )}

          {status && (
            <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-500">
              {status}
            </div>
          )}
          {error && (
            <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-500">
              {error}
            </div>
          )}

          <div className="flex items-center justify-between border-t border-border pt-4">
            <div className="text-sm text-muted-foreground">
              {selectedFound.length} of {found.length} selected
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={onClose}>Cancel</Button>
              <Button
                onClick={addSelected}
                disabled={isAdding || selectedFound.length === 0 || !translatorEndpointReady}
              >
                {isAdding ? 'Adding selected miners...' : 'Add selected miners'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
