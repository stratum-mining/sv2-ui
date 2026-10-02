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
import { Loader2, AlertCircle, CheckCircle2, RotateCw, ExternalLink } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import type { BitcoinRpcDiscoveryResult } from '@/hooks/useBitcoinRpcDiscovery';
import { useHostEnv } from '@/hooks/useHostEnv';

const NETWORK_LABELS: Record<BitcoinNetwork, string> = {
  mainnet: 'Mainnet',
  testnet4: 'Testnet4',
};

interface BitcoinPrereqStepProps extends StepProps {
  discoveredNodes: BitcoinRpcDiscoveryResult[];
  isDiscovering: boolean;
  onRetryDiscovery: () => void;
  onAutoAdvance: () => void;
}

import { BitcoinStartupInstructions } from '../BitcoinStartupInstructions';

export function BitcoinPrereqStep({ data, updateData, onNext, discoveredNodes, isDiscovering, onRetryDiscovery, onAutoAdvance }: BitcoinPrereqStepProps) {
  const { hostOs, isLoading: hostOsLoading } = useHostEnv();
  const [selectedNetwork, setSelectedNetwork] = useState<BitcoinNetwork>('mainnet');
  const [ipcStatus, setIpcStatus] = useState<'idle' | 'checking' | 'valid' | 'invalid'>('idle');
  const ipcCompletedRef = useRef(false);
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

      <BitcoinStartupInstructions 
        network={selectedNetwork}
        onNetworkChange={setSelectedNetwork}
      />

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
