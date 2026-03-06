import { useState, useEffect } from 'react';
import { StepProps, BitcoinConfig, OperatingSystem } from '../types';
import { Bitcoin, AlertCircle, Apple, Terminal, Pencil, Copy, Check } from 'lucide-react';

/**
 * Compute the default Bitcoin data directory based on OS.
 */
function getDefaultDataDir(os: OperatingSystem): string {
  switch (os) {
    case 'linux':
      return '~/.bitcoin';
    case 'macos':
      return '~/Library/Application Support/Bitcoin';
  }
}

/**
 * Compute the socket path based on OS, network, and data directory.
 */
function computeSocketPath(os: OperatingSystem, network: 'mainnet' | 'testnet4', customDataDir: string): string {
  const dataDir = customDataDir.trim() || getDefaultDataDir(os);
  
  return network === 'mainnet'
    ? `${dataDir}/node.sock`
    : `${dataDir}/testnet4/node.sock`;
}

/**
 * Step 3 (JD mode only): Bitcoin Core Setup
 * Auto-computes socket path based on OS and network selection.
 */
export function BitcoinSetup({ data, updateData, onNext }: StepProps) {
  const [os, setOs] = useState<OperatingSystem>(data.bitcoin?.os || 'linux');
  const [network, setNetwork] = useState<'mainnet' | 'testnet4'>(data.bitcoin?.network || 'mainnet');
  const [customDataDir, setCustomDataDir] = useState(data.bitcoin?.customDataDir || '');
  const [manualSocketPath, setManualSocketPath] = useState(data.bitcoin?.socket_path || '');
  const [isEditingPath, setIsEditingPath] = useState(false);
  const [copiedCommand, setCopiedCommand] = useState(false);

  const computedSocketPath = computeSocketPath(os, network, customDataDir);
  const socketPath = manualSocketPath || computedSocketPath;

  useEffect(() => {
    const config: BitcoinConfig = {
      os,
      network,
      customDataDir,
      socket_path: socketPath,
    };
    updateData({ bitcoin: config });
  }, [os, network, customDataDir, socketPath, updateData]);

  const handlePathClick = () => {
    setIsEditingPath(true);
    setManualSocketPath(socketPath);
  };

  const handlePathChange = (value: string) => {
    setManualSocketPath(value);
  };

  const handlePathBlur = () => {
    if (!manualSocketPath.trim()) {
      setManualSocketPath('');
      setIsEditingPath(false);
    }
  };

  const getBitcoindCommand = () => {
    const baseCmd = 'bitcoin -m node -ipcbind=unix';
    return network === 'mainnet' ? baseCmd : `${baseCmd} -testnet4`;
  };

  const handleCopyCommand = async () => {
    try {
      await navigator.clipboard.writeText(getBitcoindCommand());
      setCopiedCommand(true);
      setTimeout(() => setCopiedCommand(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <div className="space-y-8">
      <div className="text-center">
        <h2 className="text-2xl md:text-3xl font-semibold tracking-tight mb-3">
          Bitcoin Core Configuration
        </h2>
        <p className="text-lg text-muted-foreground">
          Connect to your Bitcoin node for creating custom block templates
        </p>
      </div>

      {/* Info Card */}
      <div className="p-4 rounded-xl bg-warning/10 border border-warning/20">
        <div className="flex gap-3">
          <AlertCircle className="h-5 w-5 text-warning flex-shrink-0 mt-0.5" />
          <div className="text-sm w-full">
            <p className="font-medium text-warning mb-1">Bitcoin Core Required</p>
            <p className="text-muted-foreground mb-2">
              Job Declaration mode requires a synced Bitcoin Core node (v30.2 or later) with IPC enabled.
              Start your Bitcoin node with:
            </p>
            <div className="relative mt-2">
              <pre className="bg-muted p-3 pr-12 rounded text-xs font-mono overflow-x-auto">
                {getBitcoindCommand()}
              </pre>
              <button
                onClick={handleCopyCommand}
                className="absolute top-2 right-2 p-1.5 rounded-md hover:bg-background/50 transition-colors"
                title="Copy command"
              >
                {copiedCommand ? (
                  <Check className="w-4 h-4 text-green-500" />
                ) : (
                  <Copy className="w-4 h-4 text-muted-foreground" />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* OS Selection */}
      <div>
        <label className="block text-sm font-medium mb-3">Operating System</label>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => { setOs('linux'); setManualSocketPath(''); setIsEditingPath(false); }}
            className={`p-4 rounded-xl border-2 transition-all ${
              os === 'linux'
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/50 hover:bg-accent'
            }`}
          >
            <div className="flex flex-col items-center gap-2">
              <Terminal className="h-5 w-5" />
              <span className="font-medium text-sm">Linux</span>
            </div>
          </button>
          <button
            onClick={() => { setOs('macos'); setManualSocketPath(''); setIsEditingPath(false); }}
            className={`p-4 rounded-xl border-2 transition-all ${
              os === 'macos'
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/50 hover:bg-accent'
            }`}
          >
            <div className="flex flex-col items-center gap-2">
              <Apple className="h-5 w-5" />
              <span className="font-medium text-sm">macOS</span>
            </div>
          </button>
        </div>
      </div>

      {/* Network Selection */}
      <div>
        <label className="block text-sm font-medium mb-3">Bitcoin Network</label>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => { setNetwork('mainnet'); setManualSocketPath(''); setIsEditingPath(false); }}
            className={`p-4 rounded-xl border-2 transition-all ${
              network === 'mainnet'
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/50 hover:bg-accent'
            }`}
          >
            <div className="flex items-center gap-2 justify-center">
              <Bitcoin className="h-4 w-4 text-orange-500" />
              <span className="font-medium">Mainnet</span>
            </div>
          </button>
          <button
            onClick={() => { setNetwork('testnet4'); setManualSocketPath(''); setIsEditingPath(false); }}
            className={`p-4 rounded-xl border-2 transition-all ${
              network === 'testnet4'
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/50 hover:bg-accent'
            }`}
          >
            <div className="flex items-center gap-2 justify-center">
              <Bitcoin className="h-4 w-4 text-blue-500" />
              <span className="font-medium">Testnet4</span>
            </div>
          </button>
        </div>
      </div>

      {/* Custom Data Directory (optional) */}
      <div>
        <label className="block text-sm font-medium mb-2">
          Custom Data Directory <span className="text-muted-foreground">(optional)</span>
        </label>
        <input
          type="text"
          value={customDataDir}
          onChange={(e) => { setCustomDataDir(e.target.value); setManualSocketPath(''); setIsEditingPath(false); }}
          placeholder={getDefaultDataDir(os)}
          className="w-full h-10 px-3 rounded-lg border border-input bg-background font-mono text-sm focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/15 outline-none transition-all"
        />
        <p className="text-xs text-muted-foreground mt-2">
          Leave empty to use the default location. Only set if you configured Bitcoin Core with a custom <code className="bg-muted px-1 py-0.5 rounded">-datadir</code>.
        </p>
      </div>

      {/* IPC Socket Path - clickable to edit */}
      <div className="p-4 rounded-xl border border-border bg-muted/50">
        <label className="block text-sm font-medium mb-2">IPC Socket Path</label>
        {isEditingPath ? (
          <input
            type="text"
            value={manualSocketPath}
            onChange={(e) => handlePathChange(e.target.value)}
            onBlur={handlePathBlur}
            autoFocus
            className="w-full h-10 px-3 rounded-lg border border-input bg-background font-mono text-sm focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/15 outline-none transition-all"
          />
        ) : (
          <button
            onClick={handlePathClick}
            className="w-full bg-background p-3 rounded-lg border border-input hover:border-primary/50 transition-colors text-left group"
          >
            <div className="flex items-center justify-between">
              <code className="text-sm font-mono break-all">{socketPath}</code>
              <Pencil className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 ml-2" />
            </div>
          </button>
        )}
        <p className="text-xs text-muted-foreground mt-2">
          Click to edit if your socket is in a different location.
        </p>
      </div>

      {/* Navigation */}
      <div className="flex justify-end">
        <button
          onClick={onNext}
          className="h-10 px-8 rounded-full bg-foreground text-background hover:bg-foreground/90 transition-colors font-medium"
        >
          Continue
        </button>
      </div>
    </div>
  );
}
