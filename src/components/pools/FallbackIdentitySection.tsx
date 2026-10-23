import type { BitcoinNetwork, MiningMode, PoolConfig } from '@sv2-ui/shared';
import { PoolIcon } from '@/components/ui/pool-icon';
import { getKnownPoolForConfig, type KnownPool } from '@/lib/pools';
import { getCompatiblePoolIdentity } from '@/lib/miningIdentity';
import { PoolIdentityFields } from './PoolIdentityFields';

interface FallbackIdentitySectionProps {
  primaryPool: PoolConfig;
  fallbackPools: PoolConfig[];
  presets: KnownPool[];
  miningMode: MiningMode | null;
  network: BitcoinNetwork;
  identityLabel: string;
  idPrefix: string;
  expanded: boolean;
  hasBlockingError: boolean;
  onToggle: () => void;
  onChange: (index: number, pool: PoolConfig) => void;
  onFieldBlockingError?: (index: number, error: string | null) => void;
}

function getSelectedPreset(pool: PoolConfig, presets: KnownPool[]): KnownPool | null {
  return getKnownPoolForConfig(pool, presets);
}

export function FallbackIdentitySection({
  primaryPool,
  fallbackPools,
  presets,
  miningMode,
  network,
  identityLabel,
  idPrefix,
  expanded,
  hasBlockingError,
  onToggle,
  onChange,
  onFieldBlockingError,
}: FallbackIdentitySectionProps) {
  const inheritsIdentity = miningMode === 'solo';
  const customizedCount = inheritsIdentity
    ? fallbackPools.filter((pool) => (
      pool.user_identity !== getCompatiblePoolIdentity(primaryPool, pool, miningMode)
    )).length
    : 0;
  const normalizedLabel = identityLabel.toLowerCase();

  if (!expanded) {
    const summary = inheritsIdentity
      ? (customizedCount === 0
        ? `Fallback pools use the primary ${normalizedLabel}.`
        : `${customizedCount} fallback ${customizedCount === 1 ? 'pool uses' : 'pools use'} a custom ${normalizedLabel}.`)
      : `Fallback pools each need their own ${normalizedLabel}.`;
    return (
      <div className="rounded-lg border border-border bg-muted/20 p-4 text-sm text-muted-foreground">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <span>{summary}</span>
          <button
            type="button"
            onClick={onToggle}
            className="self-start rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 sm:self-auto"
          >
            {inheritsIdentity && customizedCount === 0 ? 'Customize' : 'Review'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`space-y-4 rounded-lg border p-4 ${
      hasBlockingError
        ? 'border-destructive/40 bg-destructive/[0.08]'
        : 'border-border bg-muted/20'
    }`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold">Fallback identities</h3>
          <p className={`mt-1 text-sm ${hasBlockingError ? 'text-destructive' : 'text-muted-foreground'}`}>
            {hasBlockingError
              ? `Set a valid fallback ${normalizedLabel} or remove the fallback pool.`
              : inheritsIdentity
                ? `Optional. Fallbacks inherit the primary ${normalizedLabel} unless overridden here.`
                : `Each fallback pool needs its own ${normalizedLabel}.`}
          </p>
        </div>
        {!hasBlockingError && (
          <button
            type="button"
            onClick={onToggle}
            className="self-start rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 sm:self-auto"
          >
            Hide
          </button>
        )}
      </div>

      <div className="space-y-4">
        {fallbackPools.map((pool, index) => {
          const selectedPreset = getSelectedPreset(pool, presets);
          const displayName = selectedPreset?.name ?? pool.name ?? `Fallback ${index + 1}`;

          return (
            <div key={`${idPrefix}-${index}`} className="rounded-lg border border-border bg-card p-4">
              <div className="mb-3 flex min-w-0 items-center gap-3">
                <PoolIcon
                  logoUrl={selectedPreset?.logoUrl}
                  logoOnDark={selectedPreset?.logoOnDark}
                  monogram={selectedPreset?.monogram}
                  invertLogoInDarkMode={selectedPreset?.invertLogoInDarkMode}
                  logoScale={selectedPreset?.logoScale}
                  name={displayName}
                />
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{displayName}</div>
                  <div className="truncate font-mono text-xs text-muted-foreground">
                    {pool.address}:{pool.port}
                  </div>
                </div>
              </div>

              <PoolIdentityFields
                pool={pool}
                miningMode={miningMode}
                network={network}
                idPrefix={`${idPrefix}-${index}`}
                onChange={(nextPool) => onChange(index, nextPool)}
                onBlockingErrorChange={onFieldBlockingError
                  ? (error) => onFieldBlockingError(index, error)
                  : undefined}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
