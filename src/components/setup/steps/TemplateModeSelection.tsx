import { StepProps } from '../types';
import { Cpu, Zap } from 'lucide-react';

/**
 * Step 2: Template Mode Selection (JD vs No-JD)
 * 
 * JD (Job Declaration):
 * - Miner creates own block templates
 * - Requires: Bitcoin Core + JDC + Translator Proxy
 * 
 * No-JD (Standard):
 * - Uses pool's or solo template provider's block templates
 * - Simpler setup
 * - Requires: Translator Proxy only
 */
export function TemplateModeSelection({ data, updateData, onNext }: StepProps) {
  const isSoloMode = data.miningMode === 'solo';
  
  const handleSelect = (mode: 'jd' | 'no-jd') => {
    updateData({ mode });
    // Call onNext synchronously - the wizard now uses a ref to get latest data
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

      <div className="grid gap-4 md:grid-cols-2">
        {/* JD Mode */}
        <button
          onClick={() => handleSelect('jd')}
          className="group p-8 rounded-2xl border-2 border-border hover:border-primary/50 hover:bg-accent transition-all text-left relative"
        >
          <div className="flex flex-col items-center text-center gap-4">
            <div className="p-4 rounded-full bg-primary/5 group-hover:bg-primary/20 transition-colors">
              <Cpu className="w-8 h-8 text-primary" />
            </div>
            <div>
              <h3 className="text-xl font-semibold mb-2 group-hover:text-primary transition-colors">
                Custom Templates (JD)
              </h3>
              <p className="text-sm text-muted-foreground mb-3">
                Create your own block templates using your Bitcoin node. Full control over transaction selection.
              </p>
              <div className="text-xs text-muted-foreground font-mono">
                Requires: Bitcoin Core
              </div>
            </div>
          </div>
        </button>

        {/* No-JD Mode */}
        <button
          onClick={() => handleSelect('no-jd')}
          className="group p-8 rounded-2xl border-2 border-border hover:border-primary/50 hover:bg-accent transition-all text-left relative"
        >
          <div className="flex flex-col items-center text-center gap-4">
            <div className="p-4 rounded-full bg-primary/5 group-hover:bg-primary/20 transition-colors">
              <Zap className="w-8 h-8 text-primary" />
            </div>
            <div>
              <h3 className="text-xl font-semibold mb-2 group-hover:text-primary transition-colors">
                {isSoloMode ? 'Provided Templates' : 'Pool Templates'}
              </h3>
              <p className="text-sm text-muted-foreground mb-3">
                {isSoloMode 
                  ? 'Use templates from a template provider. Simpler setup without running Bitcoin Core.'
                  : 'Use templates provided by the pool. Simpler setup without running Bitcoin Core.'}
              </p>
              <div className="text-xs text-muted-foreground font-mono">
                Simpler setup
              </div>
            </div>
          </div>
        </button>
      </div>
    </div>
  );
}
