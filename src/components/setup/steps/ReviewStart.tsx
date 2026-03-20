import React, { useState, useEffect } from 'react';
import { StepProps } from '../types';
import { CheckCircle2, Loader2, AlertCircle } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { MinerConnectionInfo } from '../MinerConnectionInfo';

interface ReviewStartProps extends StepProps {
  onComplete: () => void;
}

export function ReviewStart({ data, onComplete }: ReviewStartProps) {
  const queryClient = useQueryClient();
  const [isStarting, setIsStarting] = useState(false);
  const [started, setStarted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isJdMode = data.mode === 'jd';
  const isSoloMode = data.miningMode === 'solo';

  const handleStart = async () => {
    setIsStarting(true);
    setError(null);
    try {
      const response = await fetch('/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const errorData = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(errorData.error || errorData.message || `Failed (${response.status})`);
      await queryClient.invalidateQueries({ queryKey: ['setup-status'] });
      await new Promise(resolve => setTimeout(resolve, 2000));
      setStarted(true);
      setIsStarting(false);
    } catch (err) {
      let message = 'Failed to start services';
      if (err instanceof Error) {
        message = err.message.includes('fetch') || err.message.includes('Network')
          ? 'Cannot reach the server. Make sure the backend is running.'
          : err.message;
      }
      setError(message);
      setIsStarting(false);
    }
  };

  const [countdown, setCountdown] = useState(5);

  useEffect(() => {
    if (!started) return;
    if (countdown === 0) { onComplete(); return; }
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [started, countdown, onComplete]);

  if (started) {
    return (
      <div className="space-y-8">
        <div className="text-center">
          <h2 className="text-2xl md:text-3xl font-semibold tracking-tight mb-3">Client is running!</h2>
          <p className="text-lg text-muted-foreground">Point your mining devices to the addresses below</p>
        </div>
        <MinerConnectionInfo isJdMode={isJdMode} centered />
        <div className="flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={onComplete}
            className="h-11 px-10 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 transition-colors font-medium"
          >
            Go to Dashboard
          </button>
          <p className="text-xs text-muted-foreground">Redirecting in {countdown}s…</p>
        </div>
      </div>
    );
  }

  const SectionLabel = ({ n, label }: { n: string; label: React.ReactNode }) => (
    <div className="flex items-center gap-2 mb-2">
      <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-mono" aria-hidden="true">{n}</span>
      <span className="font-medium text-sm">{label}</span>
    </div>
  );

  return (
    <div className="space-y-8">
      <div className="text-center">
        <h2 className="text-2xl md:text-3xl font-semibold tracking-tight mb-3">Review & Start</h2>
        <p className="text-lg text-muted-foreground">Review your configuration and start the SV2 client</p>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-destructive/[0.08] flex gap-3" role="alert" aria-live="assertive">
          <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" aria-hidden="true" />
          <div>
            <div className="font-medium text-sm text-destructive mb-1">Error</div>
            <div className="text-sm text-muted-foreground">{error}</div>
          </div>
        </div>
      )}

      {/* Summary */}
      <div className="space-y-px">
        <div className="p-5 rounded-t-xl border border-border bg-card">
          <SectionLabel n="1" label="Mining Setup" />
          <p className="text-sm text-muted-foreground pl-7">{isSoloMode ? 'Solo Mining' : 'Pool Mining'}</p>
        </div>

        {!isSoloMode && (
          <div className="p-5 border-x border-b border-border bg-card">
            <SectionLabel n="2" label="Block Templates" />
            <p className="text-sm text-muted-foreground pl-7">
              {isJdMode ? 'Custom Templates (Job Declaration)' : 'Pool Templates'}
            </p>
          </div>
        )}

        {data.pool && (
          <div className="p-5 border-x border-b border-border bg-card">
            <SectionLabel n={isSoloMode ? '2' : '3'} label={isSoloMode ? 'Solo Pool' : 'Pool'} />
            <div className="text-sm text-muted-foreground space-y-1 pl-7">
              <div><span className="text-foreground">{data.pool.name || 'Custom'}</span></div>
              <div className="font-mono text-xs">{data.pool.address}:{data.pool.port}</div>
              <div className="font-mono text-xs truncate text-muted-foreground/70">{data.pool.authority_public_key}</div>
            </div>
          </div>
        )}

        {isJdMode && !isSoloMode && data.bitcoin && (
          <div className="p-5 border-x border-b border-border bg-card">
            <SectionLabel n="4" label="Bitcoin Core" />
            <div className="text-sm text-muted-foreground space-y-1 pl-7">
              <div>{data.bitcoin.network}</div>
              <div className="font-mono text-xs truncate">{data.bitcoin.socket_path}</div>
            </div>
          </div>
        )}

        <div className="p-5 rounded-b-xl border-x border-b border-border bg-card">
          <SectionLabel n={isSoloMode ? '3' : (isJdMode ? '5' : '4')} label="Mining Identity" />
          <div className="text-sm text-muted-foreground space-y-1 pl-7">
            <div className="font-mono text-xs">{data.translator?.user_identity ?? data.jdc?.user_identity ?? '—'}</div>
            {isJdMode && data.jdc?.coinbase_reward_address && (
              <div className="font-mono text-xs text-muted-foreground/70">{data.jdc.coinbase_reward_address}</div>
            )}
          </div>
        </div>
      </div>

      <div className="p-4 rounded-xl bg-primary/[0.08] flex gap-3">
        <CheckCircle2 className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
        <div className="text-sm">
          <p className="font-medium text-primary mb-1">Ready to start</p>
          <ul className="text-muted-foreground text-xs space-y-0.5 list-disc list-inside">
            {isJdMode && <li>Start the JD Client container</li>}
            <li>Start the Translator Proxy container</li>
            <li>Configure networking between services</li>
            <li>Redirect to the monitoring dashboard</li>
          </ul>
        </div>
      </div>

      <div className="flex justify-center">
        <button
          type="button"
          onClick={handleStart}
          disabled={isStarting}
          className="h-11 px-10 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:opacity-50 transition-colors font-medium"
        >
          {isStarting ? (
            <span className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Starting...
            </span>
          ) : 'Start Mining'}
        </button>
      </div>
    </div>
  );
}
