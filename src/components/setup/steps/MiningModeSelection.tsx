import { useEffect, useRef, useState } from 'react';
import { StepProps } from '../types';

type Phase = 'idle' | 'fueling' | 'launching';

const CX = 220; // rocket centre x in 440-wide viewBox

export function MiningModeSelection({ updateData, onNext }: StepProps) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [selectedMode, setSelectedMode] = useState<'solo' | 'pool' | null>(null);
  const nextRef = useRef(onNext);
  nextRef.current = onNext;

  useEffect(() => {
    if (phase !== 'fueling') return;
    const t = setTimeout(() => setPhase('launching'), 900);
    return () => clearTimeout(t);
  }, [phase]);

  useEffect(() => {
    if (phase !== 'launching') return;
    const t = setTimeout(() => nextRef.current(), 1080);
    return () => clearTimeout(t);
  }, [phase]);

  const handleSelect = (miningMode: 'solo' | 'pool') => {
    if (phase !== 'idle') return;
    setSelectedMode(miningMode);
    updateData({ miningMode, mode: miningMode === 'solo' ? 'no-jd' : null });
    setPhase('fueling');
  };

  const isFueling   = phase === 'fueling';
  const isLaunching = phase === 'launching';
  const isActive    = isFueling || isLaunching;
  const isPool      = selectedMode === 'pool';

  const [isDark, setIsDark] = useState(() =>
    typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
  );
  useEffect(() => {
    const obs = new MutationObserver(() =>
      setIsDark(document.documentElement.classList.contains('dark'))
    );
    obs.observe(document.documentElement, { attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);

  const [flameTilt, setFlameTilt] = useState(0); // -1 to 1

  function rocketShapes(rcx: number) {
    const tiltDeg = isActive ? 0 : flameTilt * 7;
    return (
      <>
        {/* Flame — tilts with mouse */}
        <g style={{
          transform: `skewX(${tiltDeg}deg)`,
          transformBox: 'fill-box',
          transformOrigin: 'top center',
          transition: 'transform 0.2s ease-out',
        }}>
          {/* Outer plume */}
          <path
            d={`M ${rcx-13} 196 C ${rcx-17} 215, ${rcx-4} 248, ${rcx} 263 C ${rcx+4} 248, ${rcx+17} 215, ${rcx+13} 196 Z`}
            style={{
              fill: 'hsl(var(--primary) / 0.42)',
              transformBox: 'fill-box', transformOrigin: 'top center',
              animation: isFueling ? 'sv2-flame-hot 0.18s ease-in-out infinite' : 'sv2-flame-idle 1.4s ease-in-out infinite',
            }}
          />
          {/* Core flame */}
          <path
            d={`M ${rcx-7} 196 C ${rcx-9} 212, ${rcx-2} 242, ${rcx} 255 C ${rcx+2} 242, ${rcx+9} 212, ${rcx+7} 196 Z`}
            style={{
              fill: 'hsl(var(--primary) / 0.88)',
              transformBox: 'fill-box', transformOrigin: 'top center',
              animation: isFueling ? 'sv2-flame-hot 0.18s ease-in-out infinite' : 'sv2-flame-idle 1.4s 0.15s ease-in-out infinite',
            }}
          />
          {/* Hot inner spike */}
          <path
            d={`M ${rcx-3} 196 C ${rcx-4} 211, ${rcx} 234, ${rcx} 244 C ${rcx} 234, ${rcx+4} 211, ${rcx+3} 196 Z`}
            style={{
              fill: 'hsl(var(--primary))',
              transformBox: 'fill-box', transformOrigin: 'top center',
              animation: isFueling ? 'sv2-flame-hot 0.18s ease-in-out infinite' : 'sv2-flame-idle 1.4s 0.3s ease-in-out infinite',
            }}
          />
          {/* Mach shock diamonds */}
          <ellipse cx={rcx} cy={202} rx={6} ry={3.5}
            style={{ fill: 'hsl(var(--cyan-400))', transformBox: 'fill-box', transformOrigin: 'center',
              animation: isFueling ? 'sv2-mach 0.18s ease-in-out infinite alternate' : 'sv2-mach-idle 1.1s ease-in-out infinite' }}
          />
          <ellipse cx={rcx} cy={213} rx={4.5} ry={2.5}
            style={{ fill: 'hsl(var(--cyan-400))', transformBox: 'fill-box', transformOrigin: 'center',
              animation: isFueling ? 'sv2-mach 0.18s 0.05s ease-in-out infinite alternate' : 'sv2-mach-idle 1.1s 0.2s ease-in-out infinite' }}
          />
          <ellipse cx={rcx} cy={222} rx={3} ry={2}
            style={{ fill: 'hsl(var(--cyan-400))', transformBox: 'fill-box', transformOrigin: 'center',
              animation: isFueling ? 'sv2-mach 0.18s 0.09s ease-in-out infinite alternate' : 'sv2-mach-idle 1.1s 0.4s ease-in-out infinite' }}
          />
        </g>

        {/* Nose cone */}
        <path
          d={`M ${rcx} 28 C ${rcx-2} 44, ${rcx-18} 62, ${rcx-20} 78 L ${rcx+20} 78 C ${rcx+18} 62, ${rcx+2} 44 ${rcx} 28 Z`}
          style={{ fill: 'hsl(var(--primary) / 0.08)', stroke: 'hsl(var(--primary))', strokeWidth: 1.5, strokeLinejoin: 'round' }}
        />
        <line x1={rcx-6} y1={38} x2={rcx-14} y2={68}
          style={{ stroke: 'hsl(var(--primary))', strokeWidth: 0.5, opacity: 0.22 }}
        />

        {/* Main body */}
        <rect x={rcx-20} y={78} width={40} height={96} rx={2}
          style={{ fill: 'hsl(var(--primary) / 0.05)', stroke: 'hsl(var(--primary))', strokeWidth: 1.5 }}
        />

        {/* Panel lines */}
        <line x1={rcx-20} y1={96}  x2={rcx+20} y2={96}  style={{ stroke: 'hsl(var(--primary))', strokeWidth: 0.5, opacity: 0.22 }} />
        <line x1={rcx-20} y1={130} x2={rcx+20} y2={130} style={{ stroke: 'hsl(var(--primary))', strokeWidth: 1.0, opacity: 0.45 }} />
        <line x1={rcx-20} y1={158} x2={rcx+20} y2={158} style={{ stroke: 'hsl(var(--primary))', strokeWidth: 0.5, opacity: 0.22 }} />
        <line x1={rcx-8}  y1={84}  x2={rcx-8}  y2={128} style={{ stroke: 'hsl(var(--primary))', strokeWidth: 0.6, opacity: 0.28 }} />

        {/* Window */}
        <circle cx={rcx} cy={113} r={13}
          style={{ fill: 'hsl(var(--primary) / 0.07)', stroke: 'hsl(var(--primary))', strokeWidth: 1.4 }}
        />
        <circle cx={rcx} cy={113} r={6}
          style={{ fill: 'hsl(var(--primary) / 0.14)', stroke: 'hsl(var(--primary))', strokeWidth: 0.8 }}
        />

        {/* RCS thrusters */}
        <circle cx={rcx-22} cy={143} r={2.5}
          style={{ fill: 'hsl(var(--primary) / 0.1)', stroke: 'hsl(var(--primary))', strokeWidth: 1 }}
        />
        <circle cx={rcx+22} cy={143} r={2.5}
          style={{ fill: 'hsl(var(--primary) / 0.1)', stroke: 'hsl(var(--primary))', strokeWidth: 1 }}
        />

        {/* Fuel vents */}
        {isFueling && (
          <>
            <rect x={rcx-34} y={140} width={13} height={3} rx={1.5}
              style={{ fill: 'hsl(var(--primary) / 0.45)', animation: 'sv2-vent 0.22s ease-in-out infinite alternate' }}
            />
            <rect x={rcx+21} y={140} width={13} height={3} rx={1.5}
              style={{ fill: 'hsl(var(--primary) / 0.45)', animation: 'sv2-vent 0.22s ease-in-out infinite alternate' }}
            />
          </>
        )}

        {/* Fins */}
        <path d={`M ${rcx-20} 150 L ${rcx-42} 182 L ${rcx-20} 172 Z`}
          style={{ fill: 'hsl(var(--primary) / 0.1)', stroke: 'hsl(var(--primary))', strokeWidth: 1.4, strokeLinejoin: 'round' }}
        />
        <line x1={rcx-22} y1={155} x2={rcx-39} y2={178}
          style={{ stroke: 'hsl(var(--primary))', strokeWidth: 0.5, opacity: 0.28 }}
        />
        <path d={`M ${rcx+20} 150 L ${rcx+42} 182 L ${rcx+20} 172 Z`}
          style={{ fill: 'hsl(var(--primary) / 0.1)', stroke: 'hsl(var(--primary))', strokeWidth: 1.4, strokeLinejoin: 'round' }}
        />
        <line x1={rcx+22} y1={155} x2={rcx+39} y2={178}
          style={{ stroke: 'hsl(var(--primary))', strokeWidth: 0.5, opacity: 0.28 }}
        />

        {/* Nozzle bell */}
        <path d={`M ${rcx-16} 172 L ${rcx-19} 196 L ${rcx+19} 196 L ${rcx+16} 172 Z`}
          style={{ fill: 'hsl(var(--primary) / 0.07)', stroke: 'hsl(var(--primary))', strokeWidth: 1.4, strokeLinejoin: 'round' }}
        />
        <line x1={rcx-10} y1={175} x2={rcx-13} y2={194}
          style={{ stroke: 'hsl(var(--primary))', strokeWidth: 0.5, opacity: 0.22 }}
        />
        <line x1={rcx+10} y1={175} x2={rcx+13} y2={194}
          style={{ stroke: 'hsl(var(--primary))', strokeWidth: 0.5, opacity: 0.22 }}
        />
      </>
    );
  }

  const rocketAnim = {
    transformBox: 'fill-box',
    transformOrigin: 'center bottom',
    animation: isLaunching
      ? 'sv2-launch 1.1s cubic-bezier(0.18, 0, 0.06, 1) forwards'
      : isFueling
        ? 'sv2-vibrate 0.09s linear infinite'
        : 'none',
  } as React.CSSProperties;

  return (
    <div
      className="min-h-screen bg-background flex flex-col items-center justify-center relative overflow-hidden"
      style={{
        transition: 'opacity 0.55s ease',
        opacity: isLaunching ? 0 : 1,
        transitionDelay: isLaunching ? '360ms' : '0ms',
      }}
      onMouseMove={isActive ? undefined : (e) => {
        const r = e.currentTarget.getBoundingClientRect();
        setFlameTilt((e.clientX - (r.left + r.width / 2)) / (r.width / 2));
      }}
      onMouseLeave={() => setFlameTilt(0)}
    >
      {/* Ambient glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at 50% 55%, hsl(var(--primary) / 0.05) 0%, transparent 58%)' }}
        aria-hidden
      />

      <svg
        viewBox="0 0 440 268"
        width="100%"
        style={{ maxWidth: 640, overflow: 'visible', flexShrink: 0 }}
        shapeRendering="geometricPrecision"
        aria-hidden
      >
        {/* Speed lines on launch */}
        {isLaunching && (
          <g stroke="hsl(var(--primary))" strokeWidth="1.5" strokeLinecap="round">
            <line x1={CX-14} y1="5"  x2={CX-14} y2="28"  opacity="0.35" />
            <line x1={CX-6}  y1="2"  x2={CX-6}  y2="26"  opacity="0.55" />
            <line x1={CX}    y1="0"  x2={CX}    y2="24"  opacity="0.7"  />
            <line x1={CX+6}  y1="2"  x2={CX+6}  y2="26"  opacity="0.55" />
            <line x1={CX+14} y1="5"  x2={CX+14} y2="28"  opacity="0.35" />
          </g>
        )}

        {/* Launch pad */}
        <rect x={160} y={196} width={120} height={2.5} rx={1.5}
          style={{ fill: `hsl(var(--primary) / ${isActive ? '0.55' : '0.22'})`, transition: 'fill 0.3s ease' }}
        />
        <rect x={175} y={198.5} width={90} height={1.5} rx={1}
          style={{ fill: `hsl(var(--primary) / ${isActive ? '0.28' : '0.1'})`, transition: 'fill 0.3s ease' }}
        />

        {/* Shockwave ring */}
        {isActive && (
          <ellipse cx={CX} cy={199} rx={22} ry={7}
            style={{
              fill: 'none',
              stroke: 'hsl(var(--primary) / 0.6)',
              strokeWidth: 2.5,
              transformBox: 'fill-box',
              transformOrigin: 'center',
              animation: 'sv2-shockwave 0.9s ease-out both',
            } as React.CSSProperties}
          />
        )}

        {/* Pool side rockets */}
        {isPool && isActive && (
          <>
            <g style={{ animation: 'sv2-form-left 0.38s cubic-bezier(0.16, 1, 0.3, 1) both' } as React.CSSProperties}>
              <g transform={`translate(${CX - 110}, 196) scale(0.62) translate(-${CX}, -196)`}>
                <g style={rocketAnim}>{rocketShapes(CX)}</g>
              </g>
            </g>
            <g style={{ animation: 'sv2-form-right 0.38s cubic-bezier(0.16, 1, 0.3, 1) both' } as React.CSSProperties}>
              <g transform={`translate(${CX + 110}, 196) scale(0.62) translate(-${CX}, -196)`}>
                <g style={rocketAnim}>{rocketShapes(CX)}</g>
              </g>
            </g>
          </>
        )}

        {/* Main rocket */}
        <g style={rocketAnim}>{rocketShapes(CX)}</g>

      </svg>

      {/* Stratum V2 logo */}
      <div className="relative z-10 mt-4 mb-8 animate-fade-in" style={{ animationDelay: '0.1s' }}>
        <img
          src="/sv2-logo-240x40.png"
          srcSet="/sv2-logo-240x40.png 1x, /sv2-logo-480x80.png 2x"
          alt="Stratum V2"
          width="144"
          height="24"
          className="h-6 w-auto"
          style={{
            imageRendering: 'crisp-edges',
            ...(isDark ? undefined : { filter: 'brightness(0.3)' }),
          }}
        />
      </div>

      {/* Mode cards */}
      <div
        className="relative z-10 w-full max-w-[560px] px-6 animate-fade-in-up"
        style={{ animationDelay: '0.08s' }}
      >
        <p className="text-center text-muted-foreground text-sm mb-4 tracking-wide">
          Choose how you'll mine bitcoin
        </p>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => handleSelect('solo')}
            disabled={isActive}
            className="group p-5 rounded-xl border border-border bg-card hover:border-primary/45 hover:bg-primary/[0.03] transition-all duration-250 text-left disabled:pointer-events-none"
          >
            <div className="text-foreground font-medium text-sm mb-1">Solo</div>
            <div className="text-muted-foreground text-xs leading-relaxed">Full block reward</div>
          </button>
          <button
            onClick={() => handleSelect('pool')}
            disabled={isActive}
            className="group p-5 rounded-xl border border-border bg-card hover:border-primary/45 hover:bg-primary/[0.03] transition-all duration-250 text-left disabled:pointer-events-none"
          >
            <div className="text-foreground font-medium text-sm mb-1">Pool</div>
            <div className="text-muted-foreground text-xs leading-relaxed">Regular payouts</div>
          </button>
        </div>
      </div>

    </div>
  );
}
