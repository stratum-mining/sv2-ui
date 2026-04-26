import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TRANSLATOR_PORT, JDC_PORT, JDC_AUTHORITY_PUBLIC_KEY } from '@/lib/ports';
import { useMinerConnectionInfo } from '@/hooks/useMinerConnectionInfo';

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
  centered?: boolean;
  onAddMiner?: () => void;
}

export function MinerConnectionInfo({ isJdMode, centered = false, onAddMiner }: MinerConnectionInfoProps) {
  const { data: minerConnection } = useMinerConnectionInfo();
  const fallbackTranslatorUrl = `stratum+tcp://<your-machine-ip>:${TRANSLATOR_PORT}`;
  const fallbackJdcUrl = `stratum2+tcp://<your-machine-ip>:${JDC_PORT}/${JDC_AUTHORITY_PUBLIC_KEY}`;
  const translatorUrl = minerConnection?.translator_url || fallbackTranslatorUrl;
  const jdcUrl = minerConnection?.jdc_url || fallbackJdcUrl;
  const hasDetectedHost = Boolean(minerConnection?.host);

  const hint = (
    <p className="text-xs text-muted-foreground">
      {hasDetectedHost ? (
        <>
          Use this miner-facing address if it is reachable from the same network as your miners.
        </>
      ) : (
        <>
          Replace <code className="font-mono bg-muted px-1 py-0.5 rounded text-foreground">&lt;your-machine-ip&gt;</code> with your local network IP (e.g. <code className="font-mono bg-muted px-1 py-0.5 rounded text-foreground">192.168.1.100</code>).
        </>
      )}
    </p>
  );

  const wrapperClass = (() => {
    if (centered) return 'flex flex-wrap justify-center gap-3';
    if (onAddMiner && isJdMode) return 'grid gap-3 lg:grid-cols-3';
    if (onAddMiner || isJdMode) return 'grid gap-3 md:grid-cols-2';
    return 'grid gap-3';
  })();

  return (
    <div className={wrapperClass}>
      <div className={`p-4 rounded-xl border border-border bg-card space-y-2${centered ? ' w-full max-w-sm' : ''}`}>
        <div className="font-semibold text-sm">SV1 Firmware</div>
        <div className="text-xs text-muted-foreground">Point to the Translator Proxy</div>
        <CopyableAddress address={translatorUrl} />
        {hint}
      </div>

      {isJdMode && (
        <div className={`p-4 rounded-xl border border-border bg-card space-y-2${centered ? ' w-full max-w-sm' : ''}`}>
          <div className="font-semibold text-sm">SV2 Firmware</div>
          <div className="text-xs text-muted-foreground">Point directly to the JD Client</div>
          <CopyableAddress address={jdcUrl} />
          {hint}
        </div>
      )}

      {onAddMiner && (
        <div className={`flex flex-col justify-between gap-4 p-4 rounded-xl border border-dashed border-border bg-card${centered ? ' w-full max-w-sm' : ''}`}>
          <div className="space-y-2">
            <div className="font-semibold text-sm">Add a miner</div>
            <div className="text-xs text-muted-foreground">
              Automatically find compatible SV1 miners on your local network and point them to this dashboard.
            </div>
          </div>
          <Button className="w-full" onClick={onAddMiner}>
            Add miner
          </Button>
        </div>
      )}
    </div>
  );
}
