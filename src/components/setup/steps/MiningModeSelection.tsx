import { StepProps } from '../types';
import { Users, User } from 'lucide-react';

/**
 * Step 1: Mining Mode Selection (Solo vs Pool)
 */
export function MiningModeSelection({ updateData, onNext }: StepProps) {
  const handleSelect = (miningMode: 'solo' | 'pool') => {
    updateData({ miningMode, mode: miningMode === 'solo' ? 'no-jd' : null });
    // Call onNext synchronously - the wizard now uses a ref to get latest data
    onNext();
  };

  return (
    <div className="space-y-8">
      <div className="text-center">
        <h2 className="text-2xl md:text-3xl font-semibold tracking-tight mb-3">
          Choose Your Mining Setup
        </h2>
        <p className="text-lg text-muted-foreground">
          Select how you want to participate in bitcoin mining
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Solo */}
        <button
          onClick={() => handleSelect('solo')}
          className="group p-8 rounded-2xl border-2 border-border hover:border-primary/50 hover:bg-accent transition-all text-left relative"
        >
          <div className="flex flex-col items-center text-center gap-4">
            <div className="p-4 rounded-full bg-primary/5 group-hover:bg-primary/20 transition-colors">
              <User className="w-8 h-8 text-primary" />
            </div>
            <div>
              <h3 className="text-xl font-semibold mb-2 group-hover:text-primary transition-colors">
                Solo Mining
              </h3>
              <p className="text-sm text-muted-foreground">
                Full block reward when the pool finds a block
              </p>
            </div>
          </div>
        </button>

        {/* Pool */}
        <button
          onClick={() => handleSelect('pool')}
          className="group p-8 rounded-2xl border-2 border-border hover:border-primary/50 hover:bg-accent transition-all text-left relative"
        >
          <div className="flex flex-col items-center text-center gap-4">
            <div className="p-4 rounded-full bg-primary/5 group-hover:bg-primary/20 transition-colors">
              <Users className="w-8 h-8 text-primary" />
            </div>
            <div>
              <h3 className="text-xl font-semibold mb-2 group-hover:text-primary transition-colors">
                Pool Mining
              </h3>
              <p className="text-sm text-muted-foreground">
                Regular payouts based on shares
              </p>
            </div>
          </div>
        </button>
      </div>
    </div>
  );
}
