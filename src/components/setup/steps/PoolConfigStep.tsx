import { useState } from 'react';
import { StepProps, PoolConfig, MiningMode } from '../types';
import { PoolIcon } from '@/components/ui/pool-icon';
import { FallbackIdentitySection } from '@/components/pools/FallbackIdentitySection';
import { PoolIdentityFields } from '@/components/pools/PoolIdentityFields';
import { PoolPriorityEditor } from '@/components/pools/PoolPriorityEditor';
import {
  getPoolsForMode,
  isSamePool,
  type KnownPool,
} from '@/lib/pools';
import { normalizePoolPriorityIdentities } from '@/lib/miningIdentity';
import { isPoolComplete, isPoolConnectionComplete } from '@/lib/poolValidation';

function poolMatchesPreset(pool: PoolConfig | null | undefined, preset: KnownPool): boolean {
  return isSamePool(pool, preset);
}

function getSelectedPreset(pool: PoolConfig | null | undefined, pools: KnownPool[]): KnownPool | null {
  return pools.find((preset) => poolMatchesPreset(pool, preset)) ?? null;
}

function getIdentityFieldLabel(miningMode: MiningMode | null): string {
  return miningMode === 'solo' ? 'Payout address' : 'Pool username';
}

function getIdentityStepTitle(miningMode: MiningMode | null): string {
  return miningMode === 'solo' ? 'Add Payout Address' : 'Add Pool Username';
}

type PoolConfigStepProps = StepProps;

export function PoolConfigStep({ data, updateData, onNext }: PoolConfigStepProps) {
  const [step, setStep] = useState<'pools' | 'identity'>('pools');
  const [showFallbackIdentityFields, setShowFallbackIdentityFields] = useState(false);
  const pools = getPoolsForMode(data.miningMode, data.mode);
  const fallbackPools = data.fallbackPools ?? [];
  const network = data.bitcoin?.network ?? 'mainnet';

  const primaryPool = data.pool;
  const selectedPools = [
    primaryPool,
    ...fallbackPools,
  ].filter((pool): pool is PoolConfig => Boolean(pool));
  const selectedPreset = getSelectedPreset(primaryPool, pools);

  const updateSelectedPools = (nextPools: PoolConfig[]) => {
    const normalizedPools = normalizePoolPriorityIdentities(
      nextPools,
      primaryPool,
      data.miningMode,
    );
    const nextPrimaryPool = normalizedPools[0] ?? null;

    updateData({
      pool: nextPrimaryPool,
      fallbackPools: normalizedPools.slice(1),
    });
  };

  const updatePrimaryPool = (pool: PoolConfig) => {
    updateSelectedPools([pool, ...fallbackPools]);
  };

  const updateFallbackPool = (index: number, pool: PoolConfig) => {
    updateSelectedPools(selectedPools.map((item, i) => (
      i === index + 1 ? pool : item
    )));
  };

  const poolSelectionValid =
    selectedPools.length > 0 &&
    selectedPools.every(isPoolConnectionComplete);
  const primaryPoolValid = isPoolComplete(primaryPool, data.miningMode, network);
  const fallbackPoolsValid = fallbackPools.every((pool) => isPoolComplete(pool, data.miningMode, network));
  const isValid = primaryPoolValid && fallbackPoolsValid;
  const identityLabel = getIdentityFieldLabel(data.miningMode);
  const fallbackIdentityBlocked = primaryPoolValid && !fallbackPoolsValid;

  if (step === 'identity') {
    return (
      <div className="space-y-8">
        <div className="text-center">
          <h2 className="text-2xl md:text-3xl font-semibold tracking-tight">
            {getIdentityStepTitle(data.miningMode)}
          </h2>
        </div>

        {primaryPool && (
          <SelectedPoolSummary
            pool={primaryPool}
            preset={selectedPreset}
            onChangePool={() => setStep('pools')}
          />
        )}

        {primaryPool && (
          <PoolIdentityFields
            pool={primaryPool}
            miningMode={data.miningMode}
            network={network}
            idPrefix="primary-pool"
            onChange={updatePrimaryPool}
          />
        )}

        {primaryPool && fallbackPools.length > 0 && (
          <FallbackIdentitySection
            primaryPool={primaryPool}
            fallbackPools={fallbackPools}
            presets={pools}
            miningMode={data.miningMode}
            network={network}
            identityLabel={identityLabel}
            idPrefix="setup-fallback-identity"
            expanded={showFallbackIdentityFields || fallbackIdentityBlocked}
            hasBlockingError={fallbackIdentityBlocked}
            onToggle={() => setShowFallbackIdentityFields((current) => !current)}
            onChange={updateFallbackPool}
          />
        )}

        <div className="flex flex-col-reverse items-center justify-center gap-3 sm:flex-row">
          <button
            type="button"
            onClick={() => setStep('pools')}
            className="h-11 px-6 rounded-full border border-border text-foreground hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 transition-colors font-medium"
          >
            Back
          </button>
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

  return (
    <div className="space-y-8">
      <div className="text-center">
        <h2 className="text-2xl md:text-3xl font-semibold tracking-tight">
          Select Pools
        </h2>
        <p className="mt-3 text-sm text-muted-foreground">
          Select one pool as primary. Select more pools to add fallbacks, then drag selected pools to reorder priority.
        </p>
      </div>

      <div className="space-y-3">
        <PoolPriorityEditor
          presets={pools}
          pools={selectedPools}
          miningMode={data.miningMode}
          isJdMode={data.mode === 'jd'}
          onChange={updateSelectedPools}
        />
      </div>

      <div className="flex justify-center">
        <button
          type="button"
          onClick={() => setStep('identity')}
          disabled={!poolSelectionValid}
          className="h-11 px-10 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 transition-colors font-medium"
        >
          Continue
        </button>
      </div>
    </div>
  );
}

function SelectedPoolSummary({
  pool,
  preset,
  onChangePool,
}: {
  pool: PoolConfig;
  preset: KnownPool | null;
  onChangePool: () => void;
}) {
  const displayName = preset?.name ?? pool.name ?? 'Custom Pool';

  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card p-4">
      <div className="flex min-w-0 items-center gap-3">
        <PoolIcon
          logoUrl={preset?.logoUrl}
          logoOnDark={preset?.logoOnDark}
          monogram={preset?.monogram}
          invertLogoInDarkMode={preset?.invertLogoInDarkMode}
          logoScale={preset?.logoScale}
          name={displayName}
        />
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{displayName}</div>
          <div className="truncate font-mono text-xs text-muted-foreground">
            {pool.address}:{pool.port}
          </div>
        </div>
      </div>
      <button
        type="button"
        onClick={onChangePool}
        className="shrink-0 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        Change
      </button>
    </div>
  );
}