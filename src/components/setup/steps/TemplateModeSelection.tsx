import { StepProps } from '../types';

export function TemplateModeSelection({ data, updateData, onNext }: StepProps) {
  const isSoloMode = data.miningMode === 'solo';
  const primaryTitle = isSoloMode ? 'Sovereign Solo' : 'Custom Templates';
  const primaryDescription = isSoloMode
    ? 'Create your own block templates locally with Bitcoin Core. No solo pool required.'
    : 'Create your own block templates locally, using your Bitcoin node.';
  const secondaryTitle = isSoloMode ? 'Solo Pool' : 'Pool Templates';
  const secondaryDescription = isSoloMode
    ? 'Connect to a solo pool that provides templates and handles payouts to your address.'
    : 'Use templates provided by the pool. Simpler setup without running a node.';
  const secondaryFooter = isSoloMode ? 'Simpler setup with a solo pool' : 'Simpler setup';

  const handleSelect = (mode: 'jd' | 'no-jd') => {
    if (mode === data.mode) {
      // Same mode — preserve everything (Reconfigure walk-through).
      onNext();
      return;
    }
    updateData({
      mode,
      pool: mode === 'jd' ? null : data.pool,
      fallbackPools: mode === 'jd' ? [] : data.fallbackPools,
      bitcoin: mode === 'jd' ? data.bitcoin : null,
      jdc: mode === 'jd' ? data.jdc : null,
    });
    onNext();
  };

  return (
    <div className="space-y-8">
      <div className="text-center">
        <h2 className="text-2xl md:text-3xl font-semibold tracking-tight mb-3">
          Block Template Selection
        </h2>
        <p className="text-lg text-muted-foreground">
          Choose who creates your block templates
        </p>
        <p className="text-sm text-muted-foreground mt-3">
          Bitcoin Core IPC currently supports Linux and macOS. Windows is not supported yet.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <button
          type="button"
          onClick={() => handleSelect('jd')}
          className="group flex flex-col items-start p-5 rounded-xl border border-border bg-card hover:border-primary/45 hover:bg-primary/[0.03] transition-all text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          <div className="font-medium text-sm mb-1 group-hover:text-primary transition-colors">
            {primaryTitle}
          </div>
          <div className="text-xs text-muted-foreground leading-relaxed mb-3">
            {primaryDescription}
          </div>
          <div className="mt-auto text-xs text-muted-foreground font-mono">Requires: Fully synchronized Bitcoin node on Linux or macOS</div>
        </button>

        <button
          type="button"
          onClick={() => handleSelect('no-jd')}
          className="group flex flex-col items-start p-5 rounded-xl border border-border bg-card hover:border-primary/45 hover:bg-primary/[0.03] transition-all text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          <div className="font-medium text-sm mb-1 group-hover:text-primary transition-colors">
            {secondaryTitle}
          </div>
          <div className="text-xs text-muted-foreground leading-relaxed mb-3">
            {secondaryDescription}
          </div>
          <div className="mt-auto text-xs text-muted-foreground font-mono">{secondaryFooter}</div>
        </button>
      </div>
    </div>
  );
}
