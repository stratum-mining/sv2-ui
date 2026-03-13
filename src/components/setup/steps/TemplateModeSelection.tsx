import { StepProps } from '../types';

export function TemplateModeSelection({ data, updateData, onNext }: StepProps) {
  const isSoloMode = data.miningMode === 'solo';

  const handleSelect = (mode: 'jd' | 'no-jd') => {
    updateData({ mode });
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
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <button
          type="button"
          onClick={() => handleSelect('jd')}
          className="group p-5 rounded-xl border border-border bg-card hover:border-primary/45 hover:bg-primary/[0.03] transition-all text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          <div className="font-medium text-sm mb-1 group-hover:text-primary transition-colors">
            Custom Templates (JD)
          </div>
          <div className="text-xs text-muted-foreground leading-relaxed mb-3">
            Create your own block templates using your Bitcoin node. Full control over transaction selection.
          </div>
          <div className="text-xs text-muted-foreground font-mono">Requires: Bitcoin Core</div>
        </button>

        <button
          type="button"
          onClick={() => handleSelect('no-jd')}
          className="group p-5 rounded-xl border border-border bg-card hover:border-primary/45 hover:bg-primary/[0.03] transition-all text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          <div className="font-medium text-sm mb-1 group-hover:text-primary transition-colors">
            {isSoloMode ? 'Provided Templates' : 'Pool Templates'}
          </div>
          <div className="text-xs text-muted-foreground leading-relaxed mb-3">
            {isSoloMode
              ? 'Use templates from a template provider. Simpler setup without running Bitcoin Core.'
              : 'Use templates provided by the pool. Simpler setup without running Bitcoin Core.'}
          </div>
          <div className="text-xs text-muted-foreground font-mono">Simpler setup</div>
        </button>
      </div>
    </div>
  );
}
