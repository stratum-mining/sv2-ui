import { useState } from 'react';
import { StepProps } from '../types';
import { 
  CheckCircle2, 
  Server, 
  Bitcoin,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';

interface ReviewStartProps extends StepProps {
  onComplete: () => void;
}

/**
 * Final step: Review configuration and start mining (sv2-wizard inspired)
 */
export function ReviewStart({ data, onComplete }: ReviewStartProps) {
  const queryClient = useQueryClient();
  const [isStarting, setIsStarting] = useState(false);
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

      if (!response.ok) {
        const msg = errorData.error || errorData.message || `Failed to start services (${response.status})`;
        throw new Error(msg);
      }

      // Invalidate setup status so dashboard gets fresh data
      await queryClient.invalidateQueries({ queryKey: ['setup-status'] });

      // Wait a moment for services to start
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      onComplete();
    } catch (err) {
      console.error('Failed to start services:', err);
      let message = 'Failed to start services';
      if (err instanceof Error) {
        if (err.message.includes('fetch') || err.message.includes('Network')) {
          message = 'Cannot reach the server. Make sure the backend is running (npm run dev:server or npm run dev:full).';
        } else {
          message = err.message;
        }
      }
      setError(message);
      setIsStarting(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="text-center">
        <h2 className="text-2xl md:text-3xl font-semibold tracking-tight mb-3">
          Review & Start
        </h2>
        <p className="text-lg text-muted-foreground">
          Review your configuration and start the SV2 stack
        </p>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20">
          <div className="flex gap-3">
            <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-destructive mb-1">Error</div>
              <div className="text-sm text-muted-foreground">{error}</div>
            </div>
          </div>
        </div>
      )}

      {/* Configuration Summary */}
      <div className="space-y-3">
        {/* Mining Mode */}
        <div className="p-6 rounded-xl border border-border bg-card">
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-mono">1</span>
            Mining Setup
          </h3>
          <p className="text-sm text-muted-foreground">
            {isSoloMode ? 'Solo Mining' : 'Pool Mining'}
          </p>
        </div>

        {/* Template Mode (Pool mode only) */}
        {!isSoloMode && (
          <div className="p-6 rounded-xl border border-border bg-card">
            <h3 className="font-semibold mb-3 flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-mono">2</span>
              Block Templates
            </h3>
            <p className="text-sm text-muted-foreground">
              {isJdMode ? 'Custom Templates (Job Declaration)' : 'Pool Templates'}
            </p>
          </div>
        )}

        {/* Pool/Solo Pool */}
        {data.pool && (
          <div className="p-6 rounded-xl border border-border bg-card">
            <h3 className="font-semibold mb-3 flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-mono">
                {isSoloMode ? '2' : '3'}
              </span>
              <Server className="w-4 h-4" />
              {isSoloMode ? 'Solo Pool' : 'Pool Configuration'}
            </h3>
            <div className="text-sm space-y-2 text-muted-foreground">
              <div><span className="font-medium text-foreground">Pool:</span> {data.pool.name || 'Custom'}</div>
              <div><span className="font-medium text-foreground">Address:</span> {data.pool.address}:{data.pool.port}</div>
              <div className="font-mono text-xs truncate">
                <span className="font-medium text-foreground">Authority Key:</span> {data.pool.authority_public_key}
              </div>
            </div>
          </div>
        )}

        {/* Bitcoin Core (JD mode only, pool mode only) */}
        {isJdMode && !isSoloMode && data.bitcoin && (
          <div className="p-6 rounded-xl border border-border bg-card">
            <h3 className="font-semibold mb-3 flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-mono">4</span>
              <Bitcoin className="w-4 h-4" />
              Bitcoin Core
            </h3>
            <div className="text-sm space-y-2 text-muted-foreground">
              <div><span className="font-medium text-foreground">Network:</span> {data.bitcoin.network}</div>
              <div className="font-mono text-xs truncate">
                <span className="font-medium text-foreground">Socket:</span> {data.bitcoin.socket_path}
              </div>
            </div>
          </div>
        )}

        {/* Mining Identity */}
        <div className="p-6 rounded-xl border border-border bg-card">
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-mono">
              {isSoloMode ? '3' : (isJdMode ? '5' : '4')}
            </span>
            Mining Identity
          </h3>
          <div className="text-sm space-y-2 text-muted-foreground">
            <div><span className="font-medium text-foreground">{isSoloMode ? 'Bitcoin Address' : 'Pool Username'}:</span> {data.translator?.user_identity ?? data.jdc?.user_identity ?? '-'}</div>
            {isJdMode && data.jdc?.coinbase_reward_address && (
              <div className="font-mono text-xs truncate">
                <span className="font-medium text-foreground">Fallback Address:</span> {data.jdc.coinbase_reward_address}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* What happens next */}
      <div className="p-4 rounded-xl bg-primary/10 border border-primary/20">
        <div className="flex gap-3">
          <CheckCircle2 className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
          <div className="text-sm space-y-2">
            <p className="font-medium text-primary">Ready to start!</p>
            <p className="text-muted-foreground">
              Clicking "Start Mining" will:
            </p>
            <ul className="list-disc list-inside text-muted-foreground text-xs space-y-1">
              {isJdMode && <li>Start the JD Client container</li>}
              <li>Start the Translator Proxy container</li>
              <li>Configure networking between services</li>
              <li>Redirect you to the monitoring dashboard</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex justify-end gap-3">
        <button
          onClick={handleStart}
          disabled={isStarting}
          className="h-11 px-10 rounded-full bg-foreground text-background hover:bg-foreground/90 disabled:opacity-50 transition-colors font-medium text-base"
        >
          {isStarting ? (
            <span className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Starting...
            </span>
          ) : (
            'Start Mining'
          )}
        </button>
      </div>
    </div>
  );
}
