import { useState } from 'react';
import { StepProps, PoolConfig } from '../types';
import { Check } from 'lucide-react';
import { PoolIcon } from '@/components/ui/pool-icon';

interface KnownPool {
  id: string;
  name: string;
  address: string;
  port: number;
  authority_public_key: string;
  description: string;
  badge?: 'testing' | 'coming-soon';
  logoUrl?: string;
  logoOnDark?: boolean; // true = white logo, needs dark container in light mode
}

const POOL_MINING_NO_JD: KnownPool[] = [
  {
    id: 'braiins',
    name: 'Braiins Pool',
    address: 'stratum.braiins.com',
    port: 3333,
    authority_public_key: '9awtMD5KQgvRUh2yFbjVeT7b6hjipWcAsQHd6wEhgtDT9soosna',
    description: 'Production SV2 pool by Braiins',
    logoUrl: '/braiins.svg',
    logoOnDark: true,
  },
];

const POOL_MINING_JD: KnownPool[] = [
  {
    id: 'sri-solo',
    name: 'SRI Pool',
    address: '75.119.150.111',
    port: 3333,
    authority_public_key: '9auqWEzQDVyd2oe1JVGFLMLHZtCo2FFqZwtKA5gd9xbuEu7PH72',
    description: 'Community testing pool. Payouts go to SRI development.',
    badge: 'testing',
    logoUrl: '/sri-logo.png',
  },
];

const SOLO_POOLS: KnownPool[] = [
  {
    id: 'sri-solo',
    name: 'SRI Community Solo Pool',
    address: '75.119.150.111',
    port: 3333,
    authority_public_key: '9auqWEzQDVyd2oe1JVGFLMLHZtCo2FFqZwtKA5gd9xbuEu7PH72',
    description: 'Community-run solo mining pool',
    logoUrl: '/sri-logo.png',
  },
  {
    id: 'blitzpool',
    name: 'Blitzpool',
    address: 'blitzpool.yourdevice.ch',
    port: 3333,
    authority_public_key: '9bCoFxTszKCuffyywH5uS5o6WcU4vsjTH2axxc7wE86y2HhvULU',
    description: 'Solo mining pool by Blitzpool',
    logoUrl: '/blitzpool.svg',
  },
  {
    id: 'sovereign-solo',
    name: 'Sovereign Solo Mining',
    address: '',
    port: 3333,
    authority_public_key: '',
    description: 'Use your node to create your block template without connecting to a solo pool',
    badge: 'coming-soon',
  },
];

export function PoolConfigStep({ data, updateData, onNext }: StepProps) {
  const isSoloMode = data.miningMode === 'solo';
  const isJdMode = data.mode === 'jd';

  const pools = isSoloMode ? SOLO_POOLS : (isJdMode ? POOL_MINING_JD : POOL_MINING_NO_JD);

  const defaultPool = pools.find(p => p.badge !== 'coming-soon') ?? null;

  const [isCustom, setIsCustom] = useState(false);
  const [selectedPoolId, setSelectedPoolId] = useState<string | null>(() => {
    if (data.pool?.address) return null; // already has a value from back-navigation
    if (defaultPool) {
      // pre-populate data so Continue is enabled immediately
      setTimeout(() => updateData({ pool: { name: defaultPool.name, address: defaultPool.address, port: defaultPool.port, authority_public_key: defaultPool.authority_public_key } }), 0);
      return defaultPool.id;
    }
    return null;
  });
  const [customPool, setCustomPool] = useState<PoolConfig>({
    name: 'Custom Pool',
    address: '',
    port: 34254,
    authority_public_key: '',
  });

  const handleSelectPool = (pool: KnownPool) => {
    if (pool.badge === 'coming-soon') return;
    setSelectedPoolId(pool.id);
    updateData({ pool: { name: pool.name, address: pool.address, port: pool.port, authority_public_key: pool.authority_public_key } });
    setIsCustom(false);
  };

  const handleCustomChange = (field: keyof PoolConfig, value: string | number) => {
    const updated = { ...customPool, [field]: value };
    setCustomPool(updated);
    updateData({ pool: updated });
  };

  const handleEnableCustom = () => {
    setIsCustom(true);
    setSelectedPoolId(null);
    updateData({ pool: customPool });
  };

  const isValid = data.pool && data.pool.address && data.pool.authority_public_key;

  return (
    <div className="space-y-8">
      <div className="text-center">
        <h2 className="text-2xl md:text-3xl font-semibold tracking-tight mb-3">
          {isSoloMode ? 'Select Solo Pool' : 'Select Pool'}
        </h2>
        <p className="text-lg text-muted-foreground">
          {isSoloMode ? 'Choose a solo mining pool to connect to' : isJdMode ? 'Choose a pool that supports Job Declaration' : 'Choose your mining pool'}
        </p>
      </div>

      <div className="space-y-2">
        {pools.map((pool) => {
          const isSelected = selectedPoolId === pool.id;
          const isDisabled = pool.badge === 'coming-soon';
          return (
            <button
              key={pool.id}
              type="button"
              onClick={() => handleSelectPool(pool)}
              disabled={isDisabled}
              aria-pressed={isSelected}
              className={`group w-full p-5 rounded-xl border transition-all text-left relative focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
                isDisabled
                  ? 'border-border opacity-50 cursor-not-allowed bg-card'
                  : isSelected
                  ? 'border-primary bg-primary/[0.04]'
                  : 'border-border bg-card hover:border-primary/45 hover:bg-primary/[0.02]'
              }`}
            >
              {isSelected && (
                <div className="absolute top-4 right-4 w-5 h-5 rounded-full bg-primary flex items-center justify-center" aria-hidden="true">
                  <Check className="w-3 h-3 text-background" />
                </div>
              )}
              {pool.badge && !isSelected && (
                <div className="absolute top-4 right-4">
                  <span className={`text-xs font-medium uppercase tracking-wider px-2 py-0.5 rounded-full ${
                    pool.badge === 'testing'
                      ? 'bg-warning/10 text-warning'
                      : 'bg-muted text-muted-foreground'
                  }`}>
                    {pool.badge === 'testing' ? 'Testing' : 'Coming Soon'}
                  </span>
                </div>
              )}
              <div className="flex items-start gap-4">
                <PoolIcon logoUrl={pool.logoUrl} logoOnDark={pool.logoOnDark} name={pool.name} />
                <div className="flex-1 min-w-0 pr-8">
                  <div className={`font-medium text-sm mb-1 ${isSelected ? 'text-primary' : ''}`}>{pool.name}</div>
                  <div className="text-xs text-muted-foreground leading-relaxed">{pool.description}</div>
                  {pool.address && (
                    <div className="text-xs text-muted-foreground font-mono mt-1">{pool.address}:{pool.port}</div>
                  )}
                </div>
              </div>
            </button>
          );
        })}

        <button
            type="button"
            onClick={handleEnableCustom}
            aria-pressed={isCustom}
            aria-expanded={isCustom}
            aria-controls="custom-pool-form"
            className={`group w-full p-5 rounded-xl border transition-all text-left relative focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
              isCustom
                ? 'border-primary bg-primary/[0.04]'
                : 'border-border bg-card hover:border-primary/45 hover:bg-primary/[0.02]'
            }`}
          >
            {isCustom && (
              <div className="absolute top-4 right-4 w-5 h-5 rounded-full bg-primary flex items-center justify-center" aria-hidden="true">
                <Check className="w-3 h-3 text-background" />
              </div>
            )}
            <div className="pr-8">
              <div className={`font-medium text-sm mb-1 ${isCustom ? 'text-primary' : ''}`}>Custom Pool</div>
              <div className="text-xs text-muted-foreground leading-relaxed">Configure your own pool connection</div>
            </div>
          </button>
      </div>

      {isCustom && (
        <div id="custom-pool-form" className="space-y-4 p-5 rounded-xl border border-border bg-muted/30">
          <div>
            <label htmlFor="pool-address" className="block text-sm font-medium mb-2">
              Pool Address <span className="text-primary" aria-hidden="true">*</span>
              <span className="sr-only">(required)</span>
            </label>
            <input
              id="pool-address"
              type="text"
              value={customPool.address}
              onChange={(e) => handleCustomChange('address', e.target.value)}
              placeholder="pool.example.com"
              aria-required="true"
              autoComplete="off"
              className="w-full h-10 px-3 rounded-lg border border-input bg-background focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/15 outline-none transition-all"
            />
          </div>
          <div>
            <label htmlFor="pool-port" className="block text-sm font-medium mb-2">
              Port <span className="text-primary" aria-hidden="true">*</span>
              <span className="sr-only">(required)</span>
            </label>
            <input
              id="pool-port"
              type="number"
              value={customPool.port}
              onChange={(e) => handleCustomChange('port', parseInt(e.target.value) || 34254)}
              aria-required="true"
              className="w-full h-10 px-3 rounded-lg border border-input bg-background focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/15 outline-none transition-all"
            />
          </div>
          <div>
            <label htmlFor="pool-pubkey" className="block text-sm font-medium mb-2">
              Authority Public Key <span className="text-primary" aria-hidden="true">*</span>
              <span className="sr-only">(required)</span>
            </label>
            <input
              id="pool-pubkey"
              type="text"
              value={customPool.authority_public_key}
              onChange={(e) => handleCustomChange('authority_public_key', e.target.value)}
              placeholder="Enter pool's authority public key"
              aria-required="true"
              aria-describedby="pool-pubkey-hint"
              autoComplete="off"
              className="w-full h-10 px-3 rounded-lg border border-input bg-background font-mono text-sm focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/15 outline-none transition-all"
            />
            <p id="pool-pubkey-hint" className="text-xs text-muted-foreground mt-2">The pool's public key for Noise protocol authentication</p>
          </div>
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
