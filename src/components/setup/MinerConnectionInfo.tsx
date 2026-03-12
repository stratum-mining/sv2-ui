import { useState } from 'react';
import { Copy, Check, Wifi } from 'lucide-react';
import { TRANSLATOR_PORT, JDC_PORT } from '@/lib/ports';

function CopyableAddress({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex items-center gap-2 bg-muted rounded-lg px-3 py-2 font-mono text-sm">
      <span className="flex-1 truncate">{address}</span>
      <button
        onClick={handleCopy}
        className="flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors"
        title="Copy to clipboard"
      >
        {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
      </button>
    </div>
  );
}

interface MinerConnectionInfoProps {
  isJdMode: boolean;
}

export function MinerConnectionInfo({ isJdMode }: MinerConnectionInfoProps) {
  const translatorUrl = `stratum+tcp://<your-machine-ip>:${TRANSLATOR_PORT}`;
  const jdcUrl = `stratum+tcp://<your-machine-ip>:${JDC_PORT}`;

  return (
    <div className="space-y-3">
      {/* SV1 — always shown */}
      <div className="p-5 rounded-xl border border-border bg-card space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Wifi className="w-4 h-4 text-primary" />
          </div>
          <div>
            <div className="font-semibold text-sm">SV1 Firmware</div>
            <div className="text-xs text-muted-foreground">Point to the Translator Proxy</div>
          </div>
        </div>
        <CopyableAddress address={translatorUrl} />
        <p className="text-xs text-muted-foreground">
          Replace <code className="font-mono bg-muted-foreground/20 px-1 py-0.5 rounded">&lt;your-machine-ip&gt;</code> with
          the local network IP of the machine running SV2{' '}
          <span className="whitespace-nowrap">(e.g. <code className="font-mono bg-muted-foreground/20 px-1 py-0.5 rounded">192.168.1.100</code>)</span>.
        </p>
      </div>

      {/* SV2 — only in JD mode */}
      {isJdMode && (
        <div className="p-5 rounded-xl border border-border bg-card space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Wifi className="w-4 h-4 text-primary" />
            </div>
            <div>
              <div className="font-semibold text-sm">SV2 Firmware</div>
              <div className="text-xs text-muted-foreground">Point directly to the JD Client</div>
            </div>
          </div>
          <CopyableAddress address={jdcUrl} />
        </div>
      )}
    </div>
  );
}
