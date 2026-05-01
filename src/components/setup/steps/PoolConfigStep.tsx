import { useEffect } from 'react';
import { StepProps, PoolConfig } from '../types';
import { Plus, ArrowUp, ArrowDown, X } from 'lucide-react';
import {
  POOL_MINING_NO_JD,
  POOL_MINING_JD,
  SOLO_POOLS,
  EMPTY_CUSTOM_POOL,
  isPoolValid,
  isSamePool,
  type KnownPool,
} from '@/lib/pools';
import { PoolPicker } from '../PoolPicker';

function knownPoolToConfig(p: KnownPool): PoolConfig {
  return {
    name: p.name,
    address: p.address,
    port: p.port,
    authority_public_key: p.authority_public_key,
  };
}

export function PoolConfigStep({ data, updateData, onNext }: StepProps) {
  const isSoloMode = data.miningMode === 'solo';
  const isJdMode = data.mode === 'jd';
  const isSovereignSolo = isSoloMode && isJdMode;
  const pools = isSoloMode ? SOLO_POOLS : (isJdMode ? POOL_MINING_JD : POOL_MINING_NO_JD);

  const first = pools.find((p) => p.badge !== 'coming-soon');
  const defaultPrimary: PoolConfig = first ? knownPoolToConfig(first) : EMPTY_CUSTOM_POOL;

  const primary: PoolConfig = data.pool ?? defaultPrimary;
  useEffect(() => {
    if (!data.pool) updateData({ pool: defaultPrimary });
    // Pre-populate primary on first mount so Continue is enabled immediately.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fallbacks = data.fallbackPools;

  const setPrimary = (pool: PoolConfig) => updateData({ pool });

  const setFallback = (index: number, pool: PoolConfig) => {
    updateData({ fallbackPools: fallbacks.map((f, i) => (i === index ? pool : f)) });
  };

  const addFallback = () => {
    updateData({ fallbackPools: [...fallbacks, { ...EMPTY_CUSTOM_POOL }] });
  };

  const removeFallback = (index: number) => {
    updateData({ fallbackPools: fallbacks.filter((_, i) => i !== index) });
  };

  const moveFallback = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= fallbacks.length) return;
    const next = fallbacks.slice();
    [next[index], next[target]] = [next[target], next[index]];
    updateData({ fallbackPools: next });
  };

  // Filter known pools shown in fallback slot N: hide any pool already claimed
  // by primary or another fallback. The slot's own current pick stays visible
  // so its branding renders. Custom Pool always remains available.
  const knownPoolsForFallback = (slotIndex: number): KnownPool[] =>
    pools.filter((kp) => {
      const kpAsConfig = knownPoolToConfig(kp);
      if (isSamePool(fallbacks[slotIndex], kpAsConfig)) return true;
      if (isSamePool(primary, kpAsConfig)) return false;
      return !fallbacks.some((other, j) => j !== slotIndex && isSamePool(other, kpAsConfig));
    });

  // Reject configurations where the same SV2 endpoint appears more than once.
  // sv2-apps treats each [[upstreams]] entry as a fresh attempt, so duplicates
  // burn retries against the same dead pool with no failover benefit.
  const duplicateIndex = (() => {
    const all = [primary, ...fallbacks];
    for (let i = 1; i < all.length; i++) {
      for (let j = 0; j < i; j++) {
        if (isSamePool(all[i], all[j])) return i - 1; // index in fallbacks
      }
    }
    return -1;
  })();
  const hasDuplicate = duplicateIndex !== -1;

  const isValid = isPoolValid(primary) && fallbacks.every(isPoolValid) && !hasDuplicate;

  return (
    <div className="space-y-8">
      <div className="text-center">
        <h2 className="text-2xl md:text-3xl font-semibold tracking-tight mb-3">
          {isSoloMode ? 'Select Solo Pool' : 'Select Pool'}
        </h2>
        <p className="text-lg text-muted-foreground">
          {isSoloMode
            ? 'Choose a solo mining pool to connect to'
            : isJdMode
              ? 'Choose a pool that supports Job Declaration'
              : 'Choose your mining pool'}
        </p>
      </div>

      <PoolPicker
        pools={pools}
        value={primary}
        onChange={setPrimary}
        formIdPrefix="primary-pool"
      />

      {!isSovereignSolo && (
        <div className="space-y-4">
          <div className="border-t border-border/60 pt-6">
            <h3 className="text-lg font-semibold tracking-tight">Fallback Pools</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Tried in priority order if the primary pool becomes unreachable.
            </p>
          </div>

          {fallbacks.map((fp, index) => (
            <div key={index} className="space-y-4 p-5 rounded-xl border border-border bg-muted/20">
              <div className="flex items-center justify-between">
                <p className="font-medium text-sm">Fallback {index + 1}</p>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => moveFallback(index, -1)}
                    disabled={index === 0}
                    aria-label={`Move fallback ${index + 1} up`}
                    className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                  >
                    <ArrowUp className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveFallback(index, 1)}
                    disabled={index === fallbacks.length - 1}
                    aria-label={`Move fallback ${index + 1} down`}
                    className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                  >
                    <ArrowDown className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeFallback(index)}
                    aria-label={`Remove fallback ${index + 1}`}
                    className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/40"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <PoolPicker
                pools={knownPoolsForFallback(index)}
                value={fp}
                onChange={(pool) => setFallback(index, pool)}
                formIdPrefix={`fallback-${index}`}
              />
              {duplicateIndex === index && (
                <p className="text-xs text-destructive">
                  This pool is already used. Remove or change it — fallbacks must be distinct from the primary and each other.
                </p>
              )}
            </div>
          ))}

          <button
            type="button"
            onClick={addFallback}
            className="w-full flex items-center justify-center gap-2 h-11 rounded-xl border border-dashed border-border text-sm text-muted-foreground hover:text-foreground hover:border-primary/45 hover:bg-primary/[0.02] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            <Plus className="w-4 h-4" />
            <span>Add fallback pool</span>
          </button>
        </div>
      )}

      <div className="flex justify-center">
        <button
          type="button"
          onClick={onNext}
          disabled={!isValid}
          className="h-11 px-10 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 transition-colors font-medium"
        >
          Continue
        </button>
      </div>
    </div>
  );
}
