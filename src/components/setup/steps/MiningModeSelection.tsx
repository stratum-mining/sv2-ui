import { useEffect, useRef, useState } from 'react';
import type { MiningMode, StepProps } from '../types';
import { Miner3D, type MinerPhase } from './Miner3D';

export function MiningModeSelection({ data, updateData, onNext }: StepProps) {
  const [phase, setPhase] = useState<MinerPhase>('idle');
  const [selectedMode, setSelectedMode] = useState<MiningMode | null>(null);
  const nextRef = useRef(onNext);
  nextRef.current = onNext;

  // Glow builds for 700 ms, then hand off to SetupWizard's white flash
  useEffect(() => {
    if (phase !== 'arming') return;
    const t = setTimeout(() => nextRef.current?.(), 700);
    return () => clearTimeout(t);
  }, [phase]);

  const handleSelect = (miningMode: MiningMode) => {
    if (phase !== 'idle') return;
    setSelectedMode(miningMode);
    // Only reset downstream state if the user actually changed mode. Picking
    // the same mode (Reconfigure flow) preserves existing pool/fallback work.
    if (miningMode !== data.miningMode) {
      updateData({ miningMode, mode: null, pool: null, fallbackPools: [], bitcoin: null, jdc: null, translator: null });
    }
    setPhase('arming');
  };

  const [isDark, setIsDark] = useState(() =>
    typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
  );
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const obs = new MutationObserver(() =>
      setIsDark(document.documentElement.classList.contains('dark'))
    );
    obs.observe(document.documentElement, { attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);

  const isArming = phase === 'arming';
  const isBusy   = phase !== 'idle';

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 py-12 relative overflow-hidden">

      {/* Base ambient glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(circle at 50% 34%, hsl(var(--primary) / 0.08), transparent 36%), radial-gradient(circle at 50% 60%, hsl(var(--primary) / 0.04), transparent 55%)',
        }}
        aria-hidden
      />

      {/* ── Miner hero ── */}
      <Miner3D phase={phase} />

      {/* ── Logo + CTA ── */}
      <div
        className="relative z-10 w-full max-w-[440px] flex flex-col items-center gap-5 mt-3 animate-fade-in-up"
        style={{
          animationDelay: '0.08s',
          opacity: isArming ? 0 : undefined,
          transition: isArming ? 'opacity 0.5s ease' : undefined,
        }}
      >
        <img
          src="/sv2-logo-240x40.png"
          srcSet="/sv2-logo-240x40.png 1x, /sv2-logo-480x80.png 2x"
          alt="Stratum V2"
          width="144"
          height="24"
          className="h-5 w-auto"
          style={isDark ? undefined : { filter: 'brightness(0.3)' }}
        />

        <div className="w-full">
          <p className="text-center text-muted-foreground text-sm mb-3 tracking-wide">
            Choose how you'll mine bitcoin
          </p>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => handleSelect('solo')}
              disabled={isBusy}
              aria-pressed={selectedMode === 'solo'}
              className={`group rounded-xl border bg-card p-5 text-left transition-all duration-300 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
                selectedMode === 'solo'
                  ? 'border-primary/55 bg-primary/[0.05]'
                  : 'border-border hover:border-primary/45 hover:bg-primary/[0.03]'
              }`}
              style={
                selectedMode === 'solo'
                  ? { boxShadow: '0 0 30px hsl(var(--primary) / 0.12), inset 0 0 0 1px hsl(var(--primary) / 0.14)' }
                  : undefined
              }
            >
              <div className="text-foreground font-medium text-sm mb-1">Solo</div>
              <div className="text-muted-foreground text-xs leading-relaxed">Full block reward</div>
            </button>

            <button
              type="button"
              onClick={() => handleSelect('pool')}
              disabled={isBusy}
              aria-pressed={selectedMode === 'pool'}
              className={`group rounded-xl border bg-card p-5 text-left transition-all duration-300 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
                selectedMode === 'pool'
                  ? 'border-primary/55 bg-primary/[0.05]'
                  : 'border-border hover:border-primary/45 hover:bg-primary/[0.03]'
              }`}
              style={
                selectedMode === 'pool'
                  ? { boxShadow: '0 0 30px hsl(var(--primary) / 0.12), inset 0 0 0 1px hsl(var(--primary) / 0.14)' }
                  : undefined
              }
            >
              <div className="text-foreground font-medium text-sm mb-1">Pool</div>
              <div className="text-muted-foreground text-xs leading-relaxed">Regular payouts</div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
