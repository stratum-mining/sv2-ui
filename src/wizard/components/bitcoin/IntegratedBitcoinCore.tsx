import { useState, useEffect, useRef, useCallback } from "react";
import { Play, Square, ChevronDown, ChevronUp, Loader2, Server, Pickaxe, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { BitcoinNetwork } from '../types';

interface BitcoinStatusResponse {
  container: 'not_found' | 'running' | 'stopped';
  build: {
    state: 'idle' | 'building' | 'built' | 'error';
    progress?: string;
    error?: string;
  };
  blockchainInfo?: {
    chain: string;
    blocks: number;
    headers: number;
    verificationprogress: number;
    initialblockdownload: boolean;
  };
}

interface RegtestInfo {
  address: string;
  balance: string;
  blocks: number;
}

export const IntegratedBitcoinCore = ({
  network,
  onRunning,
}: {
  network: BitcoinNetwork;
  onRunning?: () => void;
}) => {
  const [status, setStatus] = useState<BitcoinStatusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [logs, setLogs] = useState('');
  const [buildLogs, setBuildLogs] = useState('');
  const [regtestInfo, setRegtestInfo] = useState<RegtestInfo | null>(null);
  const [mining, setMining] = useState(false);
  const [copied, setCopied] = useState(false);
  const logRef = useRef<HTMLPreElement>(null);
  const buildLogRef = useRef<HTMLPreElement>(null);
  const hasNotifiedRunning = useRef(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/bitcoin/status?network=${network}`);
      if (res.ok) {
        const data: BitcoinStatusResponse = await res.json();
        setStatus(data);

        if (data.container === 'running' && !hasNotifiedRunning.current) {
          hasNotifiedRunning.current = true;
          setShowLogs(true);
          onRunning?.();
        }
      }
    } catch {
      // API not available
    }
  }, [network, onRunning]);

  const fetchLogs = useCallback(async () => {
    try {
      const res = await fetch(`/api/bitcoin/logs?network=${network}&tail=100`);
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs || '');
      }
    } catch {
      // ignore
    }
  }, [network]);

  const fetchBuildLogs = useCallback(async () => {
    try {
      const res = await fetch(`/api/bitcoin/build-logs?network=${network}`);
      if (res.ok) {
        const data = await res.json();
        setBuildLogs(data.logs || '');
      }
    } catch {
      // ignore
    }
  }, [network]);

  const fetchRegtestInfo = useCallback(async () => {
    if (network !== 'regtest') return;
    try {
      const res = await fetch('/api/bitcoin/regtest-info');
      if (res.ok) {
        setRegtestInfo(await res.json());
      }
    } catch {
      // ignore
    }
  }, [network]);

  const handleMineBlocks = async (numBlocks: number) => {
    setMining(true);
    try {
      await fetch('/api/bitcoin/regtest-mine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blocks: numBlocks }),
      });
      await fetchRegtestInfo();
    } catch {
      // ignore
    } finally {
      setMining(false);
    }
  };

  const handleCopyAddress = async () => {
    if (regtestInfo?.address) {
      await navigator.clipboard.writeText(regtestInfo.address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Poll status every 3s
  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 3000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  // Poll build logs every 2s while building
  const isBuilding = status?.build.state === 'building';
  useEffect(() => {
    if (!isBuilding) return;
    fetchBuildLogs();
    const interval = setInterval(fetchBuildLogs, 2000);
    return () => clearInterval(interval);
  }, [isBuilding, fetchBuildLogs]);

  // Poll container logs every 3s when visible and running
  const isRunning = status?.container === 'running';
  useEffect(() => {
    if (!showLogs || !isRunning) return;
    fetchLogs();
    const interval = setInterval(fetchLogs, 3000);
    return () => clearInterval(interval);
  }, [showLogs, isRunning, fetchLogs]);

  // Fetch regtest info when running
  useEffect(() => {
    if (!isRunning || network !== 'regtest') return;
    fetchRegtestInfo();
    const interval = setInterval(fetchRegtestInfo, 5000);
    return () => clearInterval(interval);
  }, [isRunning, network, fetchRegtestInfo]);

  // Auto-scroll build logs
  useEffect(() => {
    if (buildLogRef.current) {
      buildLogRef.current.scrollTop = buildLogRef.current.scrollHeight;
    }
  }, [buildLogs]);

  // Auto-scroll container logs
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logs]);

  const handleStart = async () => {
    setLoading(true);
    hasNotifiedRunning.current = false;
    try {
      await fetch('/api/bitcoin/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ network }),
      });
      // Immediately poll for updated status
      await fetchStatus();
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const handleStop = async () => {
    setLoading(true);
    try {
      await fetch('/api/bitcoin/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ network }),
      });
      hasNotifiedRunning.current = false;
      await fetchStatus();
      setShowLogs(false);
      setLogs('');
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const isStopped = status?.container === 'stopped';
  const hasError = status?.build.state === 'error';
  const isIdle =
    !isBuilding && !isRunning && !isStopped && !hasError;

  const syncProgress = status?.blockchainInfo
    ? (status.blockchainInfo.verificationprogress * 100).toFixed(2)
    : null;

  return (
    <div className="border border-border bg-card rounded-2xl p-6">
      <h3 className="text-primary font-semibold flex items-center gap-2 mb-2">
        <Server className="w-4 h-4" /> Integrated Bitcoin Core Stack
      </h3>
      <p className="text-sm text-muted-foreground mb-4">
        Alternatively, run a Docker-managed Bitcoin Core node with IPC support.
      </p>

      {/* Status + Actions */}
      <div className="space-y-4">
        {/* Idle state — show start button */}
        {isIdle && (
          <Button
            onClick={handleStart}
            disabled={loading}
            className="group"
          >
            {loading ? (
              <Loader2 className="mr-2 w-4 h-4 animate-spin" />
            ) : (
              <Play className="mr-2 w-4 h-4" />
            )}
            Start Integrated Bitcoin Core ({network})
          </Button>
        )}

        {/* Building state — show spinner + scrollable build log */}
        {isBuilding && (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
              <div>
                <p className="text-sm font-medium text-foreground">
                  Building Bitcoin Core image...
                </p>
                <p className="text-xs text-muted-foreground">
                  Pulling image and starting container...
                </p>
              </div>
            </div>
            <pre
              ref={buildLogRef}
              className="bg-black text-green-400 font-mono text-xs p-3 rounded-lg max-h-64 overflow-y-auto whitespace-pre-wrap break-all"
            >
              {buildLogs || 'Starting build...'}
            </pre>
          </div>
        )}

        {/* Error state */}
        {hasError && (
          <div className="space-y-3">
            <div className="bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
              <p className="text-sm text-destructive font-medium">Build failed</p>
              {status?.build.error && (
                <p className="text-xs text-destructive/80 mt-1 font-mono">
                  {status.build.error}
                </p>
              )}
            </div>
            <Button
              onClick={handleStart}
              disabled={loading}
              variant="secondary"
              size="sm"
            >
              {loading ? (
                <Loader2 className="mr-2 w-4 h-4 animate-spin" />
              ) : (
                <Play className="mr-2 w-4 h-4" />
              )}
              Retry
            </Button>
          </div>
        )}

        {/* Running state — green dot, sync info, logs toggle, stop button */}
        {isRunning && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
                </span>
                <span className="text-sm font-medium text-foreground">
                  Bitcoin Core running
                </span>
              </div>
              <Button
                onClick={handleStop}
                disabled={loading}
                variant="destructive"
                size="sm"
              >
                {loading ? (
                  <Loader2 className="mr-2 w-4 h-4 animate-spin" />
                ) : (
                  <Square className="mr-2 w-3 h-3" />
                )}
                Stop
              </Button>
            </div>

            {/* Sync progress (hide for regtest — IBD is always reported due to synthetic timestamps) */}
            {status?.blockchainInfo && network !== 'regtest' && (
              <div className="bg-muted rounded-lg px-3 py-2 space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Chain</span>
                  <span className="font-mono text-foreground">
                    {status.blockchainInfo.chain}
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Blocks</span>
                  <span className="font-mono text-foreground">
                    {status.blockchainInfo.blocks.toLocaleString()} / {status.blockchainInfo.headers.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Sync</span>
                  <span className="font-mono text-foreground">
                    {syncProgress}%
                    {status.blockchainInfo.initialblockdownload && (
                      <span className="ml-1 text-muted-foreground">(IBD)</span>
                    )}
                  </span>
                </div>
                {/* Progress bar */}
                <div className="w-full bg-muted-foreground/20 rounded-full h-1.5 mt-1">
                  <div
                    className="bg-primary h-1.5 rounded-full transition-all duration-500"
                    style={{
                      width: `${Math.min(parseFloat(syncProgress || '0'), 100)}%`,
                    }}
                  />
                </div>
              </div>
            )}

            {/* Regtest wallet info */}
            {network === 'regtest' && regtestInfo && (
              <div className="bg-muted rounded-lg px-3 py-3 space-y-2">
                <p className="text-xs font-semibold text-primary uppercase tracking-widest">Regtest Wallet</p>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Balance</span>
                  <span className="font-mono text-foreground">{regtestInfo.balance} BTC</span>
                </div>
                <div className="flex justify-between text-xs items-center gap-2">
                  <span className="text-muted-foreground shrink-0">Address</span>
                  <div className="flex items-center gap-1 min-w-0">
                    <span className="font-mono text-foreground text-[11px] truncate">{regtestInfo.address}</span>
                    <button onClick={handleCopyAddress} className="shrink-0 text-muted-foreground hover:text-foreground transition-colors">
                      {copied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <Button
                    onClick={() => handleMineBlocks(1)}
                    disabled={mining}
                    variant="secondary"
                    size="sm"
                    className="text-xs h-7"
                  >
                    {mining ? <Loader2 className="mr-1 w-3 h-3 animate-spin" /> : <Pickaxe className="mr-1 w-3 h-3" />}
                    Mine 1 Block
                  </Button>
                  <Button
                    onClick={() => handleMineBlocks(10)}
                    disabled={mining}
                    variant="secondary"
                    size="sm"
                    className="text-xs h-7"
                  >
                    {mining ? <Loader2 className="mr-1 w-3 h-3 animate-spin" /> : <Pickaxe className="mr-1 w-3 h-3" />}
                    Mine 10 Blocks
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground pt-1">
                  This is a local regtest environment for testing. Coins have no real value.
                </p>
              </div>
            )}

            {/* Logs toggle */}
            <button
              onClick={() => setShowLogs(!showLogs)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {showLogs ? (
                <ChevronUp className="w-3 h-3" />
              ) : (
                <ChevronDown className="w-3 h-3" />
              )}
              {showLogs ? 'Hide logs' : 'Show logs'}
            </button>

            {/* Log viewer */}
            {showLogs && (
              <pre
                ref={logRef}
                className="bg-black text-green-400 font-mono text-xs p-3 rounded-lg max-h-64 overflow-y-auto whitespace-pre-wrap break-all"
              >
                {logs || 'Waiting for logs...'}
              </pre>
            )}
          </div>
        )}

        {/* Stopped state */}
        {isStopped && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="inline-flex rounded-full h-2.5 w-2.5 bg-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                Bitcoin Core stopped
              </span>
            </div>
            <Button
              onClick={handleStart}
              disabled={loading}
              variant="secondary"
              size="sm"
            >
              {loading ? (
                <Loader2 className="mr-2 w-4 h-4 animate-spin" />
              ) : (
                <Play className="mr-2 w-4 h-4" />
              )}
              Restart
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};
