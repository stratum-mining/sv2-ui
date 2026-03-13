import { useState, useEffect } from 'react';
import { StepProps, BitcoinConfig, OperatingSystem } from '../types';
import { Bitcoin, Apple, Terminal, Pencil, Check } from 'lucide-react';

function getDefaultDataDir(os: OperatingSystem): string {
  return os === 'linux' ? '~/.bitcoin' : '~/Library/Application Support/Bitcoin';
}

function computeSocketPath(os: OperatingSystem, network: 'mainnet' | 'testnet4', customDataDir: string): string {
  const dataDir = customDataDir.trim() || getDefaultDataDir(os);
  return network === 'mainnet' ? `${dataDir}/node.sock` : `${dataDir}/testnet4/node.sock`;
}

export function BitcoinSetup({ data, updateData, onNext }: StepProps) {
  const [os, setOs] = useState<OperatingSystem>(data.bitcoin?.os || 'linux');
  const [network, setNetwork] = useState<'mainnet' | 'testnet4'>(data.bitcoin?.network || 'mainnet');
  const [customDataDir, setCustomDataDir] = useState(data.bitcoin?.customDataDir || '');
  const [manualSocketPath, setManualSocketPath] = useState(data.bitcoin?.socket_path || '');
  const [isEditingPath, setIsEditingPath] = useState(false);
  const computedSocketPath = computeSocketPath(os, network, customDataDir);
  const socketPath = manualSocketPath || computedSocketPath;

  useEffect(() => {
    updateData({ bitcoin: { os, network, customDataDir, socket_path: socketPath } as BitcoinConfig });
  }, [os, network, customDataDir, socketPath, updateData]);

  const resetPath = () => { setManualSocketPath(''); setIsEditingPath(false); };

  const selBtn = (active: boolean) =>
    `relative p-4 rounded-xl border transition-all flex flex-col items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
      active ? 'border-primary bg-primary/[0.04]' : 'border-border bg-card hover:border-primary/45 hover:bg-primary/[0.02]'
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
      </div>

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
          placeholder={getDefaultDataDir(os)}
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
      </div>

      <div className="flex justify-center">
        <button
          type="button"
          onClick={onNext}
          className="h-11 px-10 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 transition-colors font-medium"
        >
          Continue
        </button>
      </div>
    </div>
  );
}
