import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TRANSLATOR_PORT, JDC_PORT, JDC_AUTHORITY_PUBLIC_KEY } from '@/lib/ports';
import { useMinerConnectionInfo } from '@/hooks/useMinerConnectionInfo';
import { cn } from '@/lib/utils';

function CopyableAddress({
  address,
  compact = false,
}: {
  address: string;
  compact?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className={cn(
        'flex min-w-0 items-center gap-2 bg-muted font-mono',
        compact ? 'rounded-md px-2.5 py-1.5 text-xs' : 'rounded-lg px-3 py-2 text-sm'
      )}
    >
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
  variant?: 'cards' | 'compact';
}

export function MinerConnectionInfo({
  isJdMode,
  centered = false,
  onAddMiner,
  variant = 'cards',
}: MinerConnectionInfoProps) {
  const { data: minerConnection } = useMinerConnectionInfo();
  const [compactProtocol, setCompactProtocol] = useState<'sv1' | 'sv2'>('sv1');
  const fallbackTranslatorUrl = `stratum+tcp://<your-machine-ip>:${TRANSLATOR_PORT}`;
  const fallbackJdcUrl = `stratum2+tcp://<your-machine-ip>:${JDC_PORT}/${JDC_AUTHORITY_PUBLIC_KEY}`;
  const translatorUrl = minerConnection?.translator_url || fallbackTranslatorUrl;
  const jdcUrl = minerConnection?.jdc_url || fallbackJdcUrl;
  const hasDetectedHost = Boolean(minerConnection?.host);
  const compactAddress = compactProtocol === 'sv2' && isJdMode ? jdcUrl : translatorUrl;
  const compactTarget = compactProtocol === 'sv2' && isJdMode
    ? 'SV2 miner endpoint'
    : 'SV1 miner endpoint';

  const renderHint = (protocol: 'sv1' | 'sv2') => {
    const target = protocol === 'sv1'
      ? 'Point Stratum V1 miners here to connect through the Translation Proxy.'
      : 'Point Stratum V2 miners here to use the JDC for local template construction.';

    return (
      <p className="text-xs text-muted-foreground">
        {target}
        {!hasDetectedHost && (
          <>
            {' '}Replace <code className="font-mono bg-muted px-1 py-0.5 rounded text-foreground">&lt;your-machine-ip&gt;</code> with your local network IP (e.g. <code className="font-mono bg-muted px-1 py-0.5 rounded text-foreground">192.168.1.100</code>).
          </>
        )}
      </p>
    );
  };

  if (variant === 'compact') {
    return (
      <div className="rounded-xl border border-border bg-card p-2.5 shadow-sm">
        <div className="grid min-w-0 gap-2 md:grid-cols-[auto_minmax(9rem,13rem)_minmax(0,1fr)_auto] md:items-center">
          {isJdMode ? (
            <div className="inline-flex w-fit rounded-md bg-muted p-0.5 text-xs">
              {(['sv1', 'sv2'] as const).map((protocol) => (
                <button
                  key={protocol}
                  type="button"
                  onClick={() => setCompactProtocol(protocol)}
                  className={cn(
                    'rounded-sm px-2.5 py-1 font-medium uppercase transition-colors',
                    compactProtocol === protocol
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {protocol}
                </button>
              ))}
            </div>
          ) : (
            <span className="w-fit rounded-md bg-muted px-2.5 py-1 text-xs font-medium uppercase text-muted-foreground">
              SV1
            </span>
          )}

          <div className="text-xs font-medium leading-tight text-muted-foreground">
            {compactTarget}
          </div>

          <div className="min-w-0">
            <CopyableAddress address={compactAddress} compact />
          </div>

          {onAddMiner && (
            <Button className="h-8 w-full shrink-0 md:w-auto" size="sm" onClick={onAddMiner}>
              Add miner
            </Button>
          )}
        </div>
      </div>
    );
  }

  const wrapperClass = (() => {
    if (centered) return 'flex flex-wrap justify-center gap-3';
    if (isJdMode) return 'grid gap-3 md:grid-cols-2';
    return 'grid gap-3';
  })();

  return (
    <div className={wrapperClass}>
      <div className={`p-4 rounded-xl border border-border bg-card space-y-2${centered ? ' w-full max-w-sm' : ''}`}>
        <div className="font-semibold text-sm">Stratum V1 miner endpoint</div>
        <CopyableAddress address={translatorUrl} />
        {renderHint('sv1')}
      </div>

      {isJdMode && (
        <div className={`p-4 rounded-xl border border-border bg-card space-y-2${centered ? ' w-full max-w-sm' : ''}`}>
          <div className="font-semibold text-sm">Stratum V2 miner endpoint</div>
          <CopyableAddress address={jdcUrl} />
          {renderHint('sv2')}
        </div>
      )}
    </div>
  );
}
