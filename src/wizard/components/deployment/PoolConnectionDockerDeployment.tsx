// Pool Connection Docker deployment component
// Calls POST /api/setup to pull images, generate configs, and start containers

import { useState, useEffect } from "react";
import { Play, RefreshCw, Network, CheckCircle2, ChevronDown, ChevronUp, Cpu, Loader2, AlertCircle, Box } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CodeBlock } from '../ui';

type DeployState = 'idle' | 'deploying' | 'success' | 'error';

interface ContainerInfo {
  exists: boolean;
  state: string;
  image?: string;
  ports?: Record<string, number>;
}

export const PoolConnectionDockerDeployment = ({ data }: { data?: any }) => {
  const jdMode = data?.constructTemplates === true;
  // In non-JD mode tProxy is always required, regardless of any stale localStorage skip flag.
  const skippedTproxy = jdMode && data?.skipped_translator_proxy_configuration === true;
  const [deployState, setDeployState] = useState<DeployState>('idle');
  const [error, setError] = useState('');
  const [result, setResult] = useState<{
    mode: string;
    containers: { tproxy?: ContainerInfo; jd_client?: ContainerInfo };
  } | null>(null);
  const [showCpuMiner, setShowCpuMiner] = useState(false);
  const [tproxyRunning, setTproxyRunning] = useState(false);
  const [jdClientRunning, setJdClientRunning] = useState(false);

  useEffect(() => {
    fetch('/api/status')
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => {
        if (!body) return;
        if (body.tproxy?.state === 'running') setTproxyRunning(true);
        if (body.jd_client?.state === 'running') setJdClientRunning(true);
      })
      .catch(() => {});
  }, []);

  const handleDeploy = async () => {
    setDeployState('deploying');
    setError('');

    try {
      const res = await fetch('/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userIdentity: data?.userIdentity || 'default',
          selectedPool: data?.selectedPool || 'community_sri',
          selectedNetwork: data?.selectedNetwork || 'mainnet',
          constructTemplates: jdMode,
          skipTproxy: skippedTproxy,
          // Translator fields
          minIndividualMinerHashrate: data?.minIndividualMinerHashrate,
          aggregateChannels: data?.aggregateChannels,
          enableVardiff: data?.enableVardiff,
          clientSharesPerMinute: data?.clientSharesPerMinute,
          tproxyUpstreamAuthorityPubkey: data?.tproxyUpstreamAuthorityPubkey,
          // JDC fields
          jdcSignature: data?.jdcSignature,
          coinbaseRewardScript: data?.coinbaseRewardScript,
          clientShareBatchSize: data?.clientShareBatchSize,
          clientFeeThreshold: data?.clientFeeThreshold,
          clientMinInterval: data?.clientMinInterval,
          socketPath: data?.socketPath,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(body.error || `Setup failed (${res.status})`);
      }

      const body = await res.json();
      setResult(body);
      setDeployState('success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Deployment failed');
      setDeployState('error');
    }
  };

  const componentsLabel = skippedTproxy
    ? (jdMode ? 'JD Client' : 'None')
    : (jdMode ? 'JD Client + Translator Proxy' : 'Translator Proxy');

  // Build a deploy/restart-aware button label based on running container state
  const buildActionLabel = () => {
    const parts: string[] = [];
    if (jdMode) {
      parts.push(jdClientRunning ? 'Restart JD Client' : 'Deploy JD Client');
    }
    if (!skippedTproxy) {
      parts.push(tproxyRunning ? 'Restart Translator Proxy' : 'Deploy Translator Proxy');
    }
    return parts.join(' + ') || 'Deploy';
  };
  const actionLabel = buildActionLabel();
  const allRestarting =
    (jdMode ? jdClientRunning : true) && (!skippedTproxy ? tproxyRunning : true);
  const ActionIcon = allRestarting ? RefreshCw : Play;

  return (
    <div className="space-y-8">
      {/* Summary of what will be deployed */}
      <div className="rounded-2xl border border-border bg-card p-6">
        <h3 className="text-primary font-semibold flex items-center gap-2 mb-3">
          <Box className="w-4 h-4" /> Deployment Summary
        </h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Components</span>
            <span className="font-mono text-foreground">{componentsLabel}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Pool</span>
            <span className="font-mono text-foreground">{data?.selectedPool || 'community_sri'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Network</span>
            <span className="font-mono text-foreground">{data?.selectedNetwork || 'mainnet'}</span>
          </div>
          {jdMode && data?.integratedBitcoinCore && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Bitcoin Core</span>
              <span className="font-mono text-foreground">Integrated (IPC volume shared)</span>
            </div>
          )}
        </div>
      </div>

      {/* Deploy button / status */}
      {deployState === 'idle' && (
        <div className="flex justify-center">
          <Button onClick={handleDeploy} size="lg" className="group">
            <ActionIcon className="mr-2 w-5 h-5" />
            {actionLabel}
          </Button>
        </div>
      )}

      {deployState === 'deploying' && (
        <div className="rounded-2xl border border-border bg-card p-6">
          <div className="flex items-center gap-3">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
            <div>
              <p className="text-sm font-medium text-foreground">Deploying...</p>
              <p className="text-xs text-muted-foreground">
                Pulling images, generating configs, and starting containers. This may take a minute.
              </p>
            </div>
          </div>
        </div>
      )}

      {deployState === 'error' && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-destructive mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-destructive">Deployment failed</p>
                <p className="text-xs text-destructive/80 mt-1 font-mono">{error}</p>
              </div>
            </div>
          </div>
          <div className="flex justify-center">
            <Button onClick={handleDeploy} variant="secondary">
              <Play className="mr-2 w-4 h-4" />
              Retry
            </Button>
          </div>
        </div>
      )}

      {deployState === 'success' && result && (
        <>
          {/* Container status */}
          <div className="rounded-2xl border border-border bg-card p-6 space-y-3">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-500" />
              Containers Running
            </h3>
            {result.containers.jd_client && (
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                  </span>
                  <span className="text-foreground">JD Client</span>
                </div>
                <span className="font-mono text-xs text-muted-foreground">
                  {result.containers.jd_client.image}
                </span>
              </div>
            )}
            {result.containers.tproxy && (
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                  </span>
                  <span className="text-foreground">Translator Proxy</span>
                </div>
                <span className="font-mono text-xs text-muted-foreground">
                  {result.containers.tproxy.image}
                </span>
              </div>
            )}
          </div>

          {/* Connection instructions */}
          {(() => {
            // Derive endpoint from wizard choices, not from which containers the backend returned.
            // tProxy is the miner-facing endpoint unless it was explicitly skipped (JD mode only).
            const showTproxy = !skippedTproxy;
            const endpoint = showTproxy ? 'Translator Proxy' : 'JD Client';
            const port = showTproxy ? '34255' : '34265';

            return (
              <div className="rounded-2xl border border-border bg-card p-6">
                <div className="flex items-start gap-3">
                  <Network className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <h3 className="text-sm font-semibold text-foreground mb-2">
                      Connect {showTproxy ? 'SV1 Miners' : 'SV2 Miners'} to {endpoint}
                    </h3>
                    <p className="text-sm text-muted-foreground mb-3">
                      {endpoint} is running on port <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">{port}</code>.
                      {showTproxy
                        ? ' Configure your SV1 mining device(s):'
                        : ' Connect your SV2-native mining device(s):'}
                    </p>
                    <div className="bg-muted rounded p-3 mb-4">
                      <code className="text-sm font-mono text-foreground block">
                        stratum+tcp://&lt;host-ip&gt;:{port}
                      </code>
                    </div>
                    {!showTproxy && jdMode && (
                      <p className="text-xs text-muted-foreground mb-4">
                        No Translator Proxy was deployed. Your SV2-native miners connect directly to the JD Client.
                      </p>
                    )}
                    {showTproxy && (
                      <button
                        onClick={() => setShowCpuMiner(!showCpuMiner)}
                        className="w-full flex items-center justify-center gap-2 text-sm font-medium text-foreground bg-muted hover:bg-accent border border-border rounded-xl px-4 py-3 transition-all"
                      >
                        <Cpu className="w-4 h-4" />
                        {showCpuMiner ? (
                          <>
                            <ChevronUp className="w-4 h-4" />
                            Hide CPU Miner Instructions
                          </>
                        ) : (
                          <>
                            <ChevronDown className="w-4 h-4" />
                            I don't have an ASIC, but I want to try with a CPU-miner
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}

          {showCpuMiner && (
            <div className="rounded-2xl border border-border bg-card p-4">
              <div className="flex items-start gap-3">
                <Cpu className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                <div className="flex-1 space-y-3">
                  <h3 className="text-sm font-semibold text-foreground">CPU Miner</h3>
                  <p className="text-sm text-muted-foreground">
                    If you don't have a physical miner, you can test with CPUMiner.
                  </p>
                  <div className="space-y-3">
                    <div>
                      <p className="text-xs text-muted-foreground mb-1 font-semibold">Setup the correct CPUMiner for your OS:</p>
                      <ul className="text-xs text-muted-foreground space-y-1 ml-4 list-disc">
                        <li>Download the binary from <a href="https://sourceforge.net/projects/cpuminer/files/" target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary/80 underline">here</a></li>
                        <li>Or compile from <a href="https://github.com/pooler/cpuminer" target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary/80 underline">github.com/pooler/cpuminer</a></li>
                      </ul>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1 font-semibold">Run CPUMiner:</p>
                      <CodeBlock
                        label="Run cpuminer"
                        code="./minerd -a sha256d -o stratum+tcp://localhost:34255 -q -D -P"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
