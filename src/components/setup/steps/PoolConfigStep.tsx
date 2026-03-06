import { useState } from 'react';
import { StepProps, PoolConfig } from '../types';
import { Server, Settings, AlertCircle } from 'lucide-react';

interface KnownPool {
  id: string;
  name: string;
  address: string;
  port: number;
  authority_public_key: string;
  description: string;
  badge?: 'testing' | 'coming-soon';
  iconUrl?: string;
}

const POOL_MINING_NO_JD: KnownPool[] = [
  {
    id: 'braiins',
    name: 'Braiins Pool',
    address: 'stratum.braiins.com',
    port: 3333,
    authority_public_key: '9awtMD5KQgvRUh2yFbjVeT7b6hjipWcAsQHd6wEhgtDT9soosna',
    description: 'Production SV2 pool by Braiins',
    iconUrl: '/braiins.svg',
  },
];

const POOL_MINING_JD: KnownPool[] = [
  {
    id: 'sri-solo',
    name: 'SRI Pool',
    address: '75.119.150.111',
    port: 3333,
    authority_public_key: '9auqWEzQDVyd2oe1JVGFLMLHZtCo2FFqZwtKA5gd9xbuEu7PH72',
    description: 'Community testing pool - payouts go to SRI development',
    badge: 'testing',
    iconUrl: '/favicon.png',
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
    iconUrl: '/favicon.png',
  },
  {
    id: 'blitzpool',
    name: 'Blitzpool',
    address: 'blitzpool.yourdevice.ch',
    port: 3333,
    authority_public_key: '',
    description: 'Solo mining pool by Blitzpool',
    iconUrl: '/blitzpool.svg',
    badge: 'coming-soon',
  },
  {
    id: 'sovereign-solo',
    name: 'Sovereign Solo Mining',
    address: '',
    port: 3333,
    authority_public_key: '',
    description: 'Use your node to create your block template without any need for connecting to a solo pool',
    badge: 'coming-soon',
  },
];

/**
 * Step 3: Pool/Solo Pool Configuration (sv2-wizard inspired design)
 * Shows different pool options based on mining mode and template mode
 */
export function PoolConfigStep({ data, updateData, onNext }: StepProps) {
  const isSoloMode = data.miningMode === 'solo';
  const isJdMode = data.mode === 'jd';
  
  // Determine which pool list to show
  const pools = isSoloMode 
    ? SOLO_POOLS 
    : (isJdMode ? POOL_MINING_JD : POOL_MINING_NO_JD);

  const [isCustom, setIsCustom] = useState(false);
  const [selectedPoolId, setSelectedPoolId] = useState<string | null>(null);
  const [customPool, setCustomPool] = useState<PoolConfig>({
    name: 'Custom Pool',
    address: '',
    port: 34254,
    authority_public_key: '',
  });

  const handleSelectPool = (pool: KnownPool) => {
    if (pool.badge === 'coming-soon') {
      return; // Don't allow selection of coming soon pools
    }
    
    setSelectedPoolId(pool.id);
    updateData({
      pool: {
        name: pool.name,
        address: pool.address,
        port: pool.port,
        authority_public_key: pool.authority_public_key,
      },
    });
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

  const getTitle = () => {
    if (isSoloMode) return 'Select Solo Pool';
    return 'Select Pool';
  };

  const getDescription = () => {
    if (isSoloMode) return 'Choose a solo mining pool to connect to';
    if (isJdMode) return 'Choose a pool that supports Job Declaration';
    return 'Choose your mining pool';
  };

  return (
    <div className="space-y-8">
      <div className="text-center">
        <h2 className="text-2xl md:text-3xl font-semibold tracking-tight mb-3">
          {getTitle()}
        </h2>
        <p className="text-lg text-muted-foreground">
          {getDescription()}
        </p>
      </div>

      {/* Warning for testing pools */}
      {isJdMode && !isSoloMode && (
        <div className="p-4 rounded-xl bg-warning/10 border border-warning/20">
          <div className="flex gap-3">
            <AlertCircle className="h-5 w-5 text-warning flex-shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-warning mb-1">Testing Environment</p>
              <p className="text-muted-foreground">
                The SRI testing pool is for development and testing purposes. Mining rewards will be contributed to SRI development.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {pools.map((pool) => (
          <button
            key={pool.id}
            onClick={() => handleSelectPool(pool)}
            disabled={pool.badge === 'coming-soon'}
            className={`group w-full p-6 rounded-2xl border-2 transition-all text-left relative ${
              pool.badge === 'coming-soon'
                ? 'border-border opacity-50 cursor-not-allowed'
                : selectedPoolId === pool.id
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/50 hover:bg-accent'
            }`}
          >
            {/* Badge */}
            {pool.badge && (
              <div className="absolute top-3 right-3">
                <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                  pool.badge === 'testing' 
                    ? 'bg-warning/10 text-warning border-warning/20'
                    : 'bg-muted text-muted-foreground border-border'
                }`}>
                  {pool.badge === 'testing' ? 'Testing' : 'Coming Soon'}
                </span>
              </div>
            )}

            <div className="flex items-start gap-4">
              <div className={`p-3 rounded-xl transition-colors flex items-center justify-center ${
                pool.badge === 'coming-soon'
                  ? 'bg-muted'
                  : selectedPoolId === pool.id
                  ? 'bg-primary/10'
                  : 'bg-muted/50 group-hover:bg-primary/10'
              }`}>
                {pool.iconUrl ? (
                  <img 
                    src={pool.iconUrl} 
                    alt={`${pool.name} logo`}
                    className="w-12 h-12 object-contain"
                    onError={(e) => {
                      // Fallback to Server icon if image fails to load
                      e.currentTarget.style.display = 'none';
                      e.currentTarget.nextElementSibling?.classList.remove('hidden');
                    }}
                  />
                ) : null}
                <Server className={`w-6 h-6 text-primary ${pool.iconUrl ? 'hidden' : ''}`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-lg mb-1">{pool.name}</div>
                <div className="text-sm text-muted-foreground mb-2">{pool.description}</div>
                {pool.address && (
                  <div className="text-xs text-muted-foreground font-mono truncate">
                    {pool.address}:{pool.port}
                  </div>
                )}
              </div>
            </div>
          </button>
        ))}

        {/* Custom Pool - only for pool mining mode */}
        {!isSoloMode && (
          <button
            onClick={handleEnableCustom}
            className={`group w-full p-6 rounded-2xl border-2 transition-all text-left ${
              isCustom
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/50 hover:bg-accent'
            }`}
          >
            <div className="flex items-start gap-4">
              <div className={`p-3 rounded-full transition-colors ${
                isCustom ? 'bg-primary/20' : 'bg-primary/5 group-hover:bg-primary/20'
              }`}>
                <Settings className="w-6 h-6 text-primary" />
              </div>
              <div className="flex-1">
                <div className="font-semibold text-lg mb-1">Custom Pool</div>
                <div className="text-sm text-muted-foreground">Configure your own pool connection</div>
              </div>
            </div>
          </button>
        )}
      </div>

      {/* Custom Pool Form */}
      {isCustom && (
        <div className="space-y-4 p-6 rounded-xl border border-border bg-muted">
          <div>
            <label className="block text-sm font-medium mb-2">
              Pool Address <span className="text-primary">*</span>
            </label>
            <input
              type="text"
              value={customPool.address}
              onChange={(e) => handleCustomChange('address', e.target.value)}
              placeholder="pool.example.com"
              className="w-full h-10 px-3 rounded-lg border border-input bg-background focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/15 outline-none transition-all"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">
              Port <span className="text-primary">*</span>
            </label>
            <input
              type="number"
              value={customPool.port}
              onChange={(e) => handleCustomChange('port', parseInt(e.target.value) || 34254)}
              placeholder="34254"
              className="w-full h-10 px-3 rounded-lg border border-input bg-background focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/15 outline-none transition-all"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">
              Authority Public Key <span className="text-primary">*</span>
            </label>
            <input
              type="text"
              value={customPool.authority_public_key}
              onChange={(e) => handleCustomChange('authority_public_key', e.target.value)}
              placeholder="Enter pool's authority public key"
              className="w-full h-10 px-3 rounded-lg border border-input bg-background font-mono text-sm focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/15 outline-none transition-all"
            />
            <p className="text-xs text-muted-foreground mt-2">
              The pool's public key for Noise protocol authentication
            </p>
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="flex justify-end">
        <button
          onClick={onNext}
          disabled={!isValid}
          className="h-10 px-8 rounded-full bg-foreground text-background hover:bg-foreground/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
        >
          Continue
        </button>
      </div>
    </div>
  );
}
