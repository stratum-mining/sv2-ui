import { Check } from 'lucide-react';
import { PoolIcon } from '@/components/ui/pool-icon';
import type { KnownPool } from '@/lib/pools';
import type { PoolConfig } from './types';
import {
  getPoolAuthorityPubkeyError,
  stripWrappingQuotes,
} from '@/lib/utils';

interface PoolPickerProps {
  pools: KnownPool[];
  value: PoolConfig;
  onChange: (value: PoolConfig) => void;
  formIdPrefix: string;
}

function matchKnownPool(pools: KnownPool[], value: PoolConfig): KnownPool | undefined {
  return pools.find((p) => p.address === value.address && p.port === value.port);
}

export function PoolPicker({ pools, value, onChange, formIdPrefix }: PoolPickerProps) {
  const matched = matchKnownPool(pools, value);
  const isCustom = !matched;

  const selectKnown = (pool: KnownPool) => {
    if (pool.badge === 'coming-soon') return;
    onChange({
      name: pool.name,
      address: pool.address,
      port: pool.port,
      authority_public_key: pool.authority_public_key,
    });
  };

  const selectCustom = () => {
    if (isCustom) return;
    onChange({ name: 'Custom Pool', address: '', port: 34254, authority_public_key: '' });
  };

  const updateCustomField = (field: keyof PoolConfig, val: string | number) => {
    const normalized =
      field === 'authority_public_key' && typeof val === 'string'
        ? stripWrappingQuotes(val)
        : val;
    onChange({ ...value, [field]: normalized });
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {pools.map((pool) => {
          const isSelected = matched?.id === pool.id;
          const isDisabled = pool.badge === 'coming-soon';
          return (
            <button
              key={pool.id}
              type="button"
              onClick={() => selectKnown(pool)}
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
          onClick={selectCustom}
          aria-pressed={isCustom}
          aria-expanded={isCustom}
          aria-controls={`${formIdPrefix}-custom-form`}
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
        <div id={`${formIdPrefix}-custom-form`} className="space-y-4 p-5 rounded-xl border border-border bg-muted/30">
          <div>
            <label htmlFor={`${formIdPrefix}-address`} className="block text-sm font-medium mb-2">
              Pool Address <span className="text-primary" aria-hidden="true">*</span>
              <span className="sr-only">(required)</span>
            </label>
            <input
              id={`${formIdPrefix}-address`}
              type="text"
              value={value.address}
              onChange={(e) => updateCustomField('address', e.target.value)}
              placeholder="pool.example.com"
              aria-required="true"
              autoComplete="off"
              className="w-full h-10 px-3 rounded-lg border border-input bg-background focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/15 outline-none transition-all"
            />
          </div>
          <div>
            <label htmlFor={`${formIdPrefix}-port`} className="block text-sm font-medium mb-2">
              Port <span className="text-primary" aria-hidden="true">*</span>
              <span className="sr-only">(required)</span>
            </label>
            <input
              id={`${formIdPrefix}-port`}
              type="number"
              value={value.port}
              onChange={(e) => updateCustomField('port', parseInt(e.target.value) || 34254)}
              aria-required="true"
              className="w-full h-10 px-3 rounded-lg border border-input bg-background focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/15 outline-none transition-all"
            />
          </div>
          <div>
            <label htmlFor={`${formIdPrefix}-pubkey`} className="block text-sm font-medium mb-2">
              Authority Public Key <span className="text-primary" aria-hidden="true">*</span>
              <span className="sr-only">(required)</span>
            </label>
            <input
              id={`${formIdPrefix}-pubkey`}
              type="text"
              value={value.authority_public_key}
              onChange={(e) => updateCustomField('authority_public_key', e.target.value)}
              placeholder="Enter pool's authority public key"
              aria-required="true"
              aria-describedby={`${formIdPrefix}-pubkey-hint`}
              autoComplete="off"
              className="w-full h-10 px-3 rounded-lg border border-input bg-background font-mono text-sm focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/15 outline-none transition-all"
            />
            {getPoolAuthorityPubkeyError(value.authority_public_key) && (
              <p className="text-xs text-destructive mt-1">
                {getPoolAuthorityPubkeyError(value.authority_public_key)}
              </p>
            )}
            <p id={`${formIdPrefix}-pubkey-hint`} className="text-xs text-muted-foreground mt-2">The pool's public key for Noise protocol authentication</p>
          </div>
        </div>
      )}
    </div>
  );
}
