import { useState, useEffect, useRef } from 'react';
import {
  rpcVersionToCoreVersion,
  rpcVersionToDisplayVersion,
  formatBitcoinCoreVersion,
  DEFAULT_BITCOIN_PATHS,
  computeDefaultSocketPath,
  type OperatingSystem,
  type BitcoinNetwork,
  inferOsFromDataDir,
  mapHostOsToOperatingSystem,
} from '@sv2-ui/shared';
import { BITCOIN_MESSAGES } from '@/lib/messages';
import { StepProps, BitcoinConfig } from '../types';
import { Check, Loader2, AlertCircle, CheckCircle2, RotateCw, Copy, ExternalLink } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import type { BitcoinRpcDiscoveryResult } from '@/hooks/useBitcoinRpcDiscovery';
import { useHostEnv } from '@/hooks/useHostEnv';
import { BitcoinNetworkSelector } from '../BitcoinNetworkSelector';

interface BitcoinPrereqStepProps extends StepProps {
  discoveredNodes: BitcoinRpcDiscoveryResult[];
  isDiscovering: boolean;
  onRetryDiscovery: () => void;
  onAutoAdvance: () => void;
}

const START_COMMANDS: Record<BitcoinNetwork, string> = {
  mainnet: 'bitcoin -m node -ipcbind=unix',
  testnet4: 'bitcoin -m node -ipcbind=unix -testnet4',
};

const NETWORK_LABELS: Record<BitcoinNetwork, string> = {
  mainnet: 'Mainnet',
  testnet4: 'Testnet4',
};

function InstructionStep({
  number,
  title,
  description,
  children,
}: {
  number: number;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex gap-4 p-4 sm:p-5 [&:not(:last-child)]:border-b [&:not(:last-child)]:border-border">
      <div className="w-7 h-7 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-mono flex-shrink-0">
        {number}
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="font-medium text-sm">{title}</h3>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
        {children}
      </div>
    </div>
  );
}

export function BitcoinPrereqStep({ data, updateData, onNext, discoveredNodes, isDiscovering, onRetryDiscovery, onAutoAdvance }: BitcoinPrereqStepProps) {
  const { hostOs, isLoading: hostOsLoading } = useHostEnv();
  const [selectedNetwork, setSelectedNetwork] = useState<BitcoinNetwork>('mainnet');
  const [copiedNetwork, setCopiedNetwork] = useState<BitcoinNetwork | null>(null);
  const [ipcStatus, setIpcStatus] = useState<'idle' | 'checking' | 'valid' | 'invalid'>('idle');
  const ipcCompletedRef = useRef(false);

  const copy = async (network: BitcoinNetwork) => {
    try {
      await navigator.clipboard.writeText(START_COMMANDS[network]);
      setCopiedNetwork(network);
      setTimeout(() => setCopiedNetwork(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  useEffect(() => {
    if (hostOsLoading) return;

    const pNode = discoveredNodes.find(n => n.network === 'mainnet') ?? discoveredNodes[0];
    const dCoreVersion = pNode ? rpcVersionToCoreVersion(pNode.version) : null;

    if (hostOs) {
      const mapped = mapHostOsToOperatingSystem(hostOs);
      if (mapped) {
        updateData({
          bitcoin: {
            core_version: null,
            os: mapped,
            network: pNode?.network ?? 'mainnet',
            customDataDir: '',
            socket_path: '',
          },
        });
        return;
      }
    }

    if (!data.bitcoin?.os && pNode) {
      updateData({
        bitcoin: {
          core_version: dCoreVersion ?? null,
          os: inferOsFromDataDir(pNode.dataDir),
          network: pNode.network,
          customDataDir: '',
          socket_path: '',
        },
      });
    }
  }, [hostOs, hostOsLoading, discoveredNodes, data.bitcoin?.os, updateData]);

  useEffect(() => {
    if (hostOsLoading) return;
    if (ipcCompletedRef.current) return;
    if (isDiscovering) return;

    if (discoveredNodes.length !== 1) {
      setIpcStatus('idle');
      return;
    }

    const node = discoveredNodes[0];
    const version = rpcVersionToCoreVersion(node.version);
    if (!version || node.initialBlockDownload) {
      setIpcStatus('idle');
      return;
    }

    const os: OperatingSystem = data.bitcoin?.os ?? (
      node.dataDir.includes('Library/Application Support') ? 'macos' : 'linux'
    );
    const socketPath = computeDefaultSocketPath(DEFAULT_BITCOIN_PATHS[os], node.network);

    setIpcStatus('checking');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10_000);

    fetch('/api/validate/bitcoin-socket', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ socket_path: socketPath, network: node.network }),
      signal: controller.signal,
    })
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        clearTimeout(timeoutId);
        if (data?.valid === true) {
          updateData({
            bitcoin: {
              core_version: version,
              os,
              network: node.network,
              customDataDir: '',
              socket_path: socketPath,
              discoveredLogPath: node.logpath,
            } as BitcoinConfig,
          });
          setIpcStatus('valid');
          ipcCompletedRef.current = true;
          setTimeout(() => onAutoAdvance(), 1500);
        } else {
          setIpcStatus('invalid');
          ipcCompletedRef.current = true;
        }
      })
      .catch(() => {
        clearTimeout(timeoutId);
        setIpcStatus('invalid');
        ipcCompletedRef.current = true;
      });

    return () => {
      clearTimeout(timeoutId);
      controller.abort();
    };
  }, [discoveredNodes, hostOsLoading, isDiscovering, updateData, onAutoAdvance, data.bitcoin?.os]);

  const hasDiscovered = discoveredNodes.length > 0;
  const primaryNode = discoveredNodes.find(n => n.network === 'mainnet') ?? discoveredNodes[0];
  const isSyncing = hasDiscovered && discoveredNodes.some(n => n.initialBlockDownload);
  const detectedCoreVersion = primaryNode ? rpcVersionToCoreVersion(primaryNode.version) : null;
  const isUnsupportedVersion = hasDiscovered && !detectedCoreVersion;

  useEffect(() => {
    if (primaryNode) setSelectedNetwork(primaryNode.network);
  }, [primaryNode]);

  const handleRetry = () => {
    ipcCompletedRef.current = false;
    setIpcStatus('idle');
    onRetryDiscovery();
  };

  const mappedHostOs = hostOs ? mapHostOsToOperatingSystem(hostOs) : null;
  const manualOs = data.bitcoin?.os
    ?? mappedHostOs
    ?? (primaryNode ? inferOsFromDataDir(primaryNode.dataDir) : null);

  const handleConfigureManually = () => {
    if (manualOs) {
      const networkChanged = data.bitcoin?.network !== undefined
        && data.bitcoin.network !== selectedNetwork;

      updateData({
        bitcoin: {
          ...(data.bitcoin ?? {}),
          core_version: data.bitcoin?.core_version ?? null,
          os: manualOs,
          network: selectedNetwork,
          customDataDir: data.bitcoin?.customDataDir ?? '',
          socket_path: networkChanged ? '' : data.bitcoin?.socket_path ?? '',
          discoveredLogPath: networkChanged ? undefined : data.bitcoin?.discoveredLogPath,
        },
      });
    }

    onNext();
  };

  const detectedVersionLabel = primaryNode
    ? detectedCoreVersion
      ? formatBitcoinCoreVersion(detectedCoreVersion)
      : rpcVersionToDisplayVersion(primaryNode.version)
    : null;
  const detectedNodeSummary = primaryNode && detectedVersionLabel
    ? `${NETWORK_LABELS[primaryNode.network]} · Bitcoin Core ${detectedVersionLabel}`
    : '';

  const readiness = isDiscovering
    ? {
      tone: 'neutral' as const,
      icon: <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />,
      title: BITCOIN_MESSAGES.detecting,
      description: 'Looking for a running node on this device.',
    }
    : !hasDiscovered
      ? {
        tone: 'warning' as const,
        icon: <AlertCircle className="h-4 w-4" aria-hidden="true" />,
        title: 'Bitcoin Core isn’t detected',
        description: 'Start your node with the command above. If it is already running, wait a moment and check again.',
      }
      : isUnsupportedVersion && primaryNode
        ? {
          tone: 'destructive' as const,
          icon: <AlertCircle className="h-4 w-4" aria-hidden="true" />,
          title: BITCOIN_MESSAGES.unsupportedHeading,
          description: `${BITCOIN_MESSAGES.unsupportedDetected(rpcVersionToDisplayVersion(primaryNode.version))} ${BITCOIN_MESSAGES.upgradeNode}`,
        }
        : isSyncing
          ? {
            tone: 'warning' as const,
            icon: <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />,
            title: BITCOIN_MESSAGES.syncingHeading,
            description: `${detectedNodeSummary}. Keep Bitcoin Core running; this page will update when the initial sync finishes.`,
          }
          : ipcStatus === 'checking'
            ? {
              tone: 'neutral' as const,
              icon: <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />,
              title: 'Node synced. Checking IPC…',
              description: detectedNodeSummary,
            }
            : ipcStatus === 'valid'
              ? {
                tone: 'success' as const,
                icon: <CheckCircle2 className="h-4 w-4" aria-hidden="true" />,
                title: 'Bitcoin Core is ready',
                description: `${detectedNodeSummary}. IPC verified. Continuing automatically…`,
              }
              : ipcStatus === 'invalid'
                ? {
                  tone: 'warning' as const,
                  icon: <AlertCircle className="h-4 w-4" aria-hidden="true" />,
                  title: 'IPC connection not found',
                  description: 'Restart Bitcoin Core with the command above, or configure a custom socket path.',
                }
                : {
                  tone: 'success' as const,
                  icon: <CheckCircle2 className="h-4 w-4" aria-hidden="true" />,
                  title: BITCOIN_MESSAGES.detectedHeading,
                  description: `${detectedNodeSummary}. Continue to configure the connection.`,
                };


  const canConfigureManually = !hostOsLoading
    && !isDiscovering
    && !isSyncing
    && !isUnsupportedVersion
    && ipcStatus !== 'checking'
    && ipcStatus !== 'valid';
  const canRetry = !isDiscovering && (!hasDiscovered || ipcStatus === 'invalid');

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl md:text-3xl font-semibold tracking-tight mb-3">
          {BITCOIN_MESSAGES.prereqHeading}
        </h2>
        <p className="text-base text-muted-foreground">
          {BITCOIN_MESSAGES.versionRequirement}
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          {BITCOIN_MESSAGES.platformInfo}{' '}
          <a
            href="https://github.com/bitcoin-core/libmultiprocess/pull/231"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            {BITCOIN_MESSAGES.windowsSupport}
            <ExternalLink className="w-3 h-3" aria-hidden="true" />
          </a>
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden text-left">
        <InstructionStep
          number={1}
          title={BITCOIN_MESSAGES.installStep}
          description={BITCOIN_MESSAGES.upgradePrompt}
        >
          <div className="mt-2">
            <a
              href="https://bitcoincore.org/en/download/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded"
            >
              Download Bitcoin Core
              <ExternalLink className="w-3 h-3" aria-hidden="true" />
            </a>
          </div>
        </InstructionStep>

        <InstructionStep
          number={2}
          title="Start your node with IPC"
          description="Choose your network, then run the command in a terminal."
        >
          <BitcoinNetworkSelector
            value={selectedNetwork}
            onChange={setSelectedNetwork}
            className="mt-3"
          />
          <div className="relative mt-3">
            <pre
              className="bg-muted/60 p-3 pr-12 rounded-lg text-xs font-mono overflow-x-auto"
              aria-label={`${NETWORK_LABELS[selectedNetwork]} start command`}
            >
              {START_COMMANDS[selectedNetwork]}
            </pre>
            <button
              type="button"
              onClick={() => copy(selectedNetwork)}
              aria-label={copiedNetwork === selectedNetwork ? 'Copied!' : `Copy ${NETWORK_LABELS[selectedNetwork]} command`}
              aria-live="polite"
              className="absolute top-2 right-2 p-1.5 rounded-md hover:bg-background/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 transition-colors"
            >
              {copiedNetwork === selectedNetwork
                ? <Check className="w-4 h-4 text-success" aria-hidden="true" />
                : <Copy className="w-4 h-4 text-muted-foreground" aria-hidden="true" />}
            </button>
          </div>
        </InstructionStep>

        <InstructionStep
          number={3}
          title="Wait for the node to sync"
          description="Keep Bitcoin Core running until the initial block download is complete. We’ll detect when it is ready."
        />
      </div>

      <Alert
        variant={readiness.tone}
        icon={readiness.icon}
        aria-live={readiness.tone === 'destructive' ? 'assertive' : 'polite'}
      >
        <p className="font-medium">{readiness.title}</p>
        <p className="mt-1 text-xs leading-relaxed opacity-80">{readiness.description}</p>
      </Alert>

      {(canConfigureManually || canRetry) && (
        <div className="flex flex-wrap items-center justify-center gap-3">
          {!hasDiscovered && canRetry && (
            <button
              type="button"
              onClick={handleRetry}
              className="inline-flex h-11 items-center gap-2 rounded-full bg-primary px-6 font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              <RotateCw className="h-4 w-4" aria-hidden="true" />
              Check again
            </button>
          )}

          {canConfigureManually && (
            <button
              type="button"
              onClick={handleConfigureManually}
              className={hasDiscovered
                ? 'h-11 px-8 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 transition-colors font-medium'
                : 'h-11 px-5 rounded-full text-sm text-muted-foreground hover:text-foreground hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 transition-colors font-medium'}
            >
              {hasDiscovered ? 'Configure connection' : 'Configure manually'}
            </button>
          )}

          {hasDiscovered && canRetry && (
            <button
              type="button"
              onClick={handleRetry}
              className="inline-flex h-11 items-center gap-2 rounded-full border border-border bg-background px-5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              <RotateCw className="h-4 w-4" aria-hidden="true" />
              Check again
            </button>
          )}
        </div>
      )}
    </div>
  );
}
