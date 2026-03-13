import { useState } from 'react';
import { StepProps } from '../types';
import { Copy, Check, ExternalLink, Download, Zap, Clock } from 'lucide-react';

export function BitcoinPrereqStep({ onNext }: StepProps) {
  const [copiedMainnet, setCopiedMainnet] = useState(false);
  const [copiedTestnet, setCopiedTestnet] = useState(false);

  const copy = async (text: string, which: 'mainnet' | 'testnet') => {
    try {
      await navigator.clipboard.writeText(text);
      if (which === 'mainnet') {
        setCopiedMainnet(true);
        setTimeout(() => setCopiedMainnet(false), 2000);
      } else {
        setCopiedTestnet(true);
        setTimeout(() => setCopiedTestnet(false), 2000);
      }
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const mainnetCmd = 'bitcoin -m node -ipcbind=unix';
  const testnetCmd = 'bitcoin -m node -ipcbind=unix -testnet4';

  return (
    <div className="space-y-8 text-center">
      <div>
        <h2 className="text-2xl md:text-3xl font-semibold tracking-tight mb-3">
          Start Bitcoin Core
        </h2>
        <p className="text-lg text-muted-foreground">
          Job Declaration requires Bitcoin Core v30.2+ running with IPC enabled
        </p>
      </div>

      <div className="text-left space-y-3">
        {/* Step 1 */}
        <div className="flex gap-4 p-4 rounded-xl border border-border bg-card">
          <div className="w-7 h-7 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-mono flex-shrink-0 mt-0.5">1</div>
          <div className="flex-1 min-w-0">
            <div className="font-medium text-sm mb-1 flex items-center gap-2">
              <Download className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
              Install Bitcoin Core v30.2+
            </div>
            <p className="text-xs text-muted-foreground mb-2">
              Download the latest release with IPC support.
            </p>
            <a
              href="https://bitcoincore.org/en/download/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded"
            >
              bitcoincore.org/en/download
              <ExternalLink className="w-3 h-3" aria-hidden="true" />
            </a>
          </div>
        </div>

        {/* Step 2 */}
        <div className="flex gap-4 p-4 rounded-xl border border-border bg-card">
          <div className="w-7 h-7 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-mono flex-shrink-0 mt-0.5">2</div>
          <div className="flex-1 min-w-0">
            <div className="font-medium text-sm mb-3 flex items-center gap-2">
              <Zap className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
              Start with IPC enabled
            </div>

            <div className="space-y-2">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Mainnet</p>
              <div className="relative">
                <pre
                  className="bg-muted/60 p-3 pr-12 rounded-lg text-xs font-mono overflow-x-auto"
                  aria-label="Mainnet start command"
                >
                  {mainnetCmd}
                </pre>
                <button
                  type="button"
                  onClick={() => copy(mainnetCmd, 'mainnet')}
                  aria-label={copiedMainnet ? 'Copied!' : 'Copy mainnet command'}
                  aria-live="polite"
                  className="absolute top-2 right-2 p-1.5 rounded-md hover:bg-background/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 transition-colors"
                >
                  {copiedMainnet
                    ? <Check className="w-4 h-4 text-green-500" aria-hidden="true" />
                    : <Copy className="w-4 h-4 text-muted-foreground" aria-hidden="true" />}
                </button>
              </div>

              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider pt-1">Testnet4</p>
              <div className="relative">
                <pre
                  className="bg-muted/60 p-3 pr-12 rounded-lg text-xs font-mono overflow-x-auto"
                  aria-label="Testnet4 start command"
                >
                  {testnetCmd}
                </pre>
                <button
                  type="button"
                  onClick={() => copy(testnetCmd, 'testnet')}
                  aria-label={copiedTestnet ? 'Copied!' : 'Copy testnet4 command'}
                  aria-live="polite"
                  className="absolute top-2 right-2 p-1.5 rounded-md hover:bg-background/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 transition-colors"
                >
                  {copiedTestnet
                    ? <Check className="w-4 h-4 text-green-500" aria-hidden="true" />
                    : <Copy className="w-4 h-4 text-muted-foreground" aria-hidden="true" />}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Step 3 */}
        <div className="flex gap-4 p-4 rounded-xl border border-border bg-card">
          <div className="w-7 h-7 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-mono flex-shrink-0 mt-0.5">3</div>
          <div className="flex-1">
            <div className="font-medium text-sm flex items-center gap-2">
              <Clock className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
              Wait for initial sync
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-center">
        <button
          type="button"
          onClick={onNext}
          className="h-11 px-10 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 transition-colors font-medium"
        >
          Configure Connection
        </button>
      </div>
    </div>
  );
}
