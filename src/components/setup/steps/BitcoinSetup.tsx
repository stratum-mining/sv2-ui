import { useState, useEffect } from 'react';
import {
  DEFAULT_BITCOIN_PATHS,
  SUPPORTED_BITCOIN_CORE_VERSIONS,
  computeDefaultSocketPath,
  rpcVersionToCoreVersion,
} from '@sv2-ui/shared';
import type { BitcoinCoreVersion, OperatingSystem, BitcoinNetwork } from '@sv2-ui/shared';
import { BITCOIN_MESSAGES } from '@/lib/messages';
import { StepProps, BitcoinConfig } from '../types';
import { Bitcoin, Apple, Terminal, Pencil, Check, Loader2, AlertCircle, CheckCircle2, RotateCw } from 'lucide-react';
import { useBitcoinSocketValidation } from '@/hooks/useBitcoinSocketValidation';
import type { BitcoinRpcDiscoveryResult } from '@/hooks/useBitcoinRpcDiscovery';

interface BitcoinSetupProps extends StepProps {
  notice?: string | null;
  onDismissNotice?: () => void;
  discoveredNodes?: BitcoinRpcDiscoveryResult[];
}

export function BitcoinSetup({ data, updateData, onNext, notice, onDismissNotice, discoveredNodes }: BitcoinSetupProps) {
  const [coreVersion, setCoreVersion] = useState<BitcoinCoreVersion | null>(data.bitcoin?.core_version ?? null);
  const [os, setOs] = useState<OperatingSystem>(data.bitcoin?.os || 'linux');
  const [network, setNetwork] = useState<BitcoinNetwork>(data.bitcoin?.network || 'mainnet');
  const [customDataDir, setCustomDataDir] = useState(data.bitcoin?.customDataDir || '');
  const [manualSocketPath, setManualSocketPath] = useState(data.bitcoin?.socket_path || '');
  const [isEditingPath, setIsEditingPath] = useState(false);
  const [discoveryApplied, setDiscoveryApplied] = useState(false);
  const dataDir = customDataDir.trim() || DEFAULT_BITCOIN_PATHS[os];
  const computedSocketPath = computeDefaultSocketPath(dataDir, network);
  const socketPath = manualSocketPath || computedSocketPath;

  useEffect(() => {
    if (discoveredNodes && discoveredNodes.length > 0 && !discoveryApplied) {
      const primary = discoveredNodes.find(n => n.network === 'mainnet') ?? discoveredNodes[0];
      const inferredOs: OperatingSystem = primary.dataDir.includes('Library/Application Support')
        ? 'macos'
        : 'linux';
      const detectedVersion = rpcVersionToCoreVersion(primary.version);

      setOs(inferredOs);
      setNetwork(primary.network);
      if (detectedVersion) {
        setCoreVersion(detectedVersion);
      }
      setDiscoveryApplied(true);
    }
  }, [discoveredNodes, discoveryApplied]);

  useEffect(() => {
    updateData({
      bitcoin: {
        core_version: coreVersion,
        os,
        network,
        customDataDir,
        socket_path: socketPath,
        ...(discoveryApplied && discoveredNodes?.length ? { discoveredLogPath: (discoveredNodes.find(n => n.network === network) ?? discoveredNodes[0])?.logpath } : {}),
      } as BitcoinConfig,
    });
  }, [coreVersion, os, network, customDataDir, socketPath, updateData, discoveryApplied, discoveredNodes]);

  const {
    isChecking,
    isRefreshing,
    isValid,
    error: socketError,
    isRetryable,
    retry: retrySocketValidation,
  } = useBitcoinSocketValidation(socketPath, network, coreVersion);

  const resetPath = () => { setManualSocketPath(''); setIsEditingPath(false); };

  const selBtn = (active: boolean) =>
    `relative p-4 rounded-xl border transition-all flex flex-col items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${active ? 'border-primary bg-primary/[0.04]' : 'border-border bg-card hover:border-primary/45 hover:bg-primary/[0.02]'
    }`;

  return (
    <div className="space-y-8">
      <div className="text-center">
        <h2 className="text-2xl md:text-3xl font-semibold tracking-tight mb-3">
          Bitcoin Core Connection
        </h2>
        <p className="text-lg text-muted-foreground">
          Tell us how to connect to your running Bitcoin node
        </p>
        <p className="text-sm text-muted-foreground mt-3">
          {BITCOIN_MESSAGES.platformInfo}
        </p>
      </div>

      {discoveryApplied && (
        <div
          className="p-3 rounded-lg bg-success/10 border border-success/20 text-sm text-success flex gap-3 items-start"
          role="status"
          aria-live="polite"
        >
          <CheckCircle2 className="h-4 w-4 flex-shrink-0 mt-0.5" aria-hidden="true" />
          <div>
            <span className="font-medium">Pre-filled from detected node</span>
            <p className="text-xs mt-1 opacity-80">
              Network: {network} • Version: {rpcVersionToCoreVersion(discoveredNodes?.find(n => n.network === network)?.version ?? discoveredNodes?.[0]?.version ?? 0) ?? 'Unknown'}
            </p>
          </div>
        </div>
      )}

      <div role="group" aria-labelledby="os-label">
        <p id="os-label" className="block text-sm font-medium mb-3">Operating System</p>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => { setOs('linux'); resetPath(); }}
            className={selBtn(os === 'linux')}
            aria-pressed={os === 'linux'}
          >
            {os === 'linux' && <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-primary flex items-center justify-center" aria-hidden="true"><Check className="w-3 h-3 text-background" /></div>}
            <Terminal className="h-5 w-5" aria-hidden="true" />
            <span className={`font-medium text-sm ${os === 'linux' ? 'text-primary' : ''}`}>Linux</span>
          </button>
          <button
            type="button"
            onClick={() => { setOs('macos'); resetPath(); }}
            className={selBtn(os === 'macos')}
            aria-pressed={os === 'macos'}
          >
            {os === 'macos' && <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-primary flex items-center justify-center" aria-hidden="true"><Check className="w-3 h-3 text-background" /></div>}
            <Apple className="h-5 w-5" aria-hidden="true" />
            <span className={`font-medium text-sm ${os === 'macos' ? 'text-primary' : ''}`}>macOS</span>
          </button>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          {BITCOIN_MESSAGES.windowsOmitted}
        </p>
      </div>

      <div>
        <label htmlFor="core-version" className="block text-sm font-medium mb-3">
          {BITCOIN_MESSAGES.versionLabel}
        </label>
        {notice && (
          <div
            className="mb-3 p-3 rounded-lg bg-destructive/[0.08] text-sm text-destructive flex gap-3 items-start"
            role="alert"
            aria-live="assertive"
          >
            <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" aria-hidden="true" />
            <span>{notice}</span>
          </div>
        )}
        <select
          id="core-version"
          value={coreVersion ?? ''}
          onChange={(e) => {
            setCoreVersion(e.target.value ? (e.target.value as BitcoinCoreVersion) : null);
            onDismissNotice?.();
          }}
          className="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/15 outline-none transition-all"
        >
          <option value="" disabled>{BITCOIN_MESSAGES.selectPlaceholder}</option>
          {SUPPORTED_BITCOIN_CORE_VERSIONS.map((version) => (
            <option key={version} value={version}>
              Bitcoin Core {version}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground mt-2">
          {BITCOIN_MESSAGES.genericUpgrade}
        </p>
        {!coreVersion && (
          <p className="text-xs text-destructive mt-2">
            {BITCOIN_MESSAGES.selectVersionPrompt}
          </p>
        )}
      </div>

      <div role="group" aria-labelledby="network-label">
        <p id="network-label" className="block text-sm font-medium mb-3">Bitcoin Network</p>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => { setNetwork('mainnet'); resetPath(); }}
            className={selBtn(network === 'mainnet')}
            aria-pressed={network === 'mainnet'}
          >
            {network === 'mainnet' && <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-primary flex items-center justify-center" aria-hidden="true"><Check className="w-3 h-3 text-background" /></div>}
            <div className="flex items-center gap-2">
              <Bitcoin className="h-4 w-4 text-orange-500" aria-hidden="true" />
              <span className={`font-medium text-sm ${network === 'mainnet' ? 'text-primary' : ''}`}>Mainnet</span>
            </div>
          </button>
          <button
            type="button"
            onClick={() => { setNetwork('testnet4'); resetPath(); }}
            className={selBtn(network === 'testnet4')}
            aria-pressed={network === 'testnet4'}
          >
            {network === 'testnet4' && <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-primary flex items-center justify-center" aria-hidden="true"><Check className="w-3 h-3 text-background" /></div>}
            <div className="flex items-center gap-2">
              <Bitcoin className="h-4 w-4 text-blue-500" aria-hidden="true" />
              <span className={`font-medium text-sm ${network === 'testnet4' ? 'text-primary' : ''}`}>Testnet4</span>
            </div>
          </button>
        </div>
      </div>

      <div>
        <label htmlFor="data-dir" className="block text-sm font-medium mb-2">
          Custom Data Directory <span className="text-muted-foreground">(optional)</span>
        </label>
        <input
          id="data-dir"
          type="text"
          value={customDataDir}
          onChange={(e) => { setCustomDataDir(e.target.value); resetPath(); }}
          placeholder={DEFAULT_BITCOIN_PATHS[os]}
          autoComplete="off"
          className="w-full h-10 px-3 rounded-lg border border-input bg-background font-mono text-sm focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/15 outline-none transition-all"
        />
        <p className="text-xs text-muted-foreground mt-2">
          Leave empty to use the default. Only set if you used a custom <code className="bg-muted px-1 py-0.5 rounded">-datadir</code>.
        </p>
      </div>

      <div className="p-4 rounded-xl bg-muted/40">
        <label htmlFor="socket-path" className="block text-sm font-medium mb-2">IPC Socket Path</label>
        {isEditingPath ? (
          <input
            id="socket-path"
            type="text"
            value={manualSocketPath}
            onChange={(e) => setManualSocketPath(e.target.value)}
            onBlur={() => { if (!manualSocketPath.trim()) resetPath(); }}
            autoFocus
            autoComplete="off"
            aria-describedby="socket-path-hint"
            className="w-full h-10 px-3 rounded-lg border border-input bg-background font-mono text-sm focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/15 outline-none transition-all"
          />
        ) : (
          <button
            type="button"
            id="socket-path"
            onClick={() => { setIsEditingPath(true); setManualSocketPath(socketPath); }}
            aria-label={`IPC socket path: ${socketPath}. Click to edit.`}
            className="w-full bg-background/60 p-3 rounded-lg hover:bg-background/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 transition-colors text-left group"
          >
            <div className="flex items-center justify-between">
              <code className="text-sm font-mono break-all">{socketPath}</code>
              <Pencil className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 ml-2" aria-hidden="true" />
            </div>
          </button>
        )}
        <p id="socket-path-hint" className="text-xs text-muted-foreground mt-2">Click to edit if your socket is in a different location.</p>

        {isChecking && (
          <div
            className="mt-3 p-3 rounded-lg bg-muted/50 text-sm text-muted-foreground flex gap-3 items-center"
            role="status"
            aria-live="polite"
          >
            <Loader2 className="h-4 w-4 animate-spin flex-shrink-0" aria-hidden="true" />
            <span>Checking socket path...</span>
          </div>
        )}
        {!isChecking && isValid && (
          <div
            className="mt-3 p-3 rounded-lg bg-success/10 border border-success/20 text-sm text-success flex gap-3 items-center"
            role="status"
            aria-live="polite"
          >
            <CheckCircle2 className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
            <span>Socket is listening</span>
          </div>
        )}
        {!isChecking && socketError && (
          <div
            className="mt-3 p-3 rounded-lg bg-destructive/[0.08] text-sm text-destructive flex gap-3 items-start"
            role="alert"
            aria-live="assertive"
          >
            <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" aria-hidden="true" />
            <div className="flex-1 min-w-0 space-y-3">
              <span className="block">{socketError}</span>
              <button
                type="button"
                onClick={() => retrySocketValidation()}
                disabled={isRefreshing}
                className="inline-flex h-8 items-center gap-2 rounded-md border border-destructive/30 bg-background px-3 text-xs font-medium text-destructive transition-colors hover:bg-destructive/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/30 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isRefreshing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                {isRefreshing ? 'Checking...' : 'Retry'}
              </button>
              {isRetryable && (
                <p className="text-xs text-destructive/80">Rechecking automatically while Bitcoin Core starts.</p>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="flex justify-center">
        <button
          type="button"
          onClick={onNext}
          disabled={!coreVersion || isChecking || !!socketError}
          className="h-11 px-10 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Continue
        </button>
      </div>
    </div>
  );
}
