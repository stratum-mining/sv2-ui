import { useState } from 'react';
import { Check, Copy, ExternalLink } from 'lucide-react';
import { BitcoinNetwork } from '@sv2-ui/shared';
import { BITCOIN_MESSAGES } from '@/lib/messages';
import { BitcoinNetworkSelector } from './BitcoinNetworkSelector';

const NETWORK_LABELS: Record<BitcoinNetwork, string> = {
  mainnet: 'Mainnet',
  testnet4: 'Testnet4',
};

export function InstructionStep({
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

interface BitcoinStartupInstructionsProps {
  network: BitcoinNetwork;
  onNetworkChange?: (network: BitcoinNetwork) => void;
  customDataDir?: string;
  className?: string;
}

export function BitcoinStartupInstructions({
  network,
  onNetworkChange,
  customDataDir,
  className = '',
}: BitcoinStartupInstructionsProps) {
  const [copiedNetwork, setCopiedNetwork] = useState<BitcoinNetwork | null>(null);

  const getCommand = () => {
    let cmd = 'bitcoin -m node -ipcbind=unix';
    if (network === 'testnet4') cmd += ' -testnet4';
    if (customDataDir) cmd += ` -datadir="${customDataDir}"`;
    return cmd;
  };

  const copy = async () => {
    const cmd = getCommand();
    try {
      await navigator.clipboard.writeText(cmd);
      setCopiedNetwork(network);
      setTimeout(() => setCopiedNetwork(null), 2000);
    } catch (err) {
      console.error('Failed to copy', err);
    }
  };

  return (
    <div className={`rounded-xl border border-border bg-card overflow-hidden text-left ${className}`}>
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
        {onNetworkChange && (
          <BitcoinNetworkSelector
            value={network}
            onChange={onNetworkChange}
            className="mt-3"
          />
        )}
        <div className="relative mt-3">
          <pre
            className="bg-muted/60 p-3 pr-12 rounded-lg text-xs font-mono overflow-x-auto whitespace-pre-wrap break-all"
            aria-label={`${NETWORK_LABELS[network]} start command`}
          >
            {getCommand()}
          </pre>
          <button
            type="button"
            onClick={copy}
            aria-label={copiedNetwork === network ? 'Copied!' : `Copy command`}
            aria-live="polite"
            className="absolute top-2 right-2 p-1.5 rounded-md hover:bg-background/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 transition-colors"
          >
            {copiedNetwork === network ? (
              <Check className="w-4 h-4 text-success" aria-hidden="true" />
            ) : (
              <Copy className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
            )}
          </button>
        </div>
      </InstructionStep>

      <InstructionStep
        number={3}
        title="Wait for the node to sync"
        description="Keep Bitcoin Core running until the initial block download is complete. We’ll detect when it is ready."
      />
    </div>
  );
}
