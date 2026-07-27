import { useRef, useState } from 'react';
import { ArrowDown, ArrowUp, GripVertical, X } from 'lucide-react';
import { DEFAULT_POOL_PORT, type MiningMode, type PoolConfig } from '@sv2-ui/shared';
import { PoolIcon } from '@/components/ui/pool-icon';
import {
  appendEmptyCustomPool,
  canAddPool,
  isSamePool,
  knownPoolToConfig,
  type KnownPool,
} from '@/lib/pools';
import { withCompatiblePoolIdentity } from '@/lib/miningIdentity';
import { getPoolAuthorityPubkeyError, stripWrappingQuotes } from '@/lib/utils';

interface PoolPriorityEditorProps {
  presets: KnownPool[];
  pools: PoolConfig[];
  miningMode: MiningMode | null;
  onChange: (pools: PoolConfig[]) => void;
}

function getSelectedPreset(pool: PoolConfig, presets: KnownPool[]): KnownPool | null {
  return presets.find((preset) => isSamePool(pool, preset)) ?? null;
}

export function PoolPriorityEditor({
  presets,
  pools,
  miningMode,
  onChange,
}: PoolPriorityEditorProps) {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const draggedIndexRef = useRef<number | null>(null);
  const unselectedPresets = presets.filter((preset) => (
    !pools.some((selectedPool) => isSamePool(selectedPool, preset))
  ));
  const poolLimitReached = !canAddPool(pools);

  const togglePreset = (preset: KnownPool) => {
    const selectedIndex = pools.findIndex((pool) => isSamePool(pool, preset));
    if (selectedIndex >= 0) {
      onChange(pools.filter((_, index) => index !== selectedIndex));
      return;
    }

    if (preset.badge === 'coming-soon' || poolLimitReached) return;

    onChange([
      ...pools,
      withCompatiblePoolIdentity(
        pools[0],
        knownPoolToConfig(preset),
        miningMode,
      ),
    ]);
  };

  const addCustomPool = () => {
    onChange(appendEmptyCustomPool(pools, miningMode));
  };

  const updatePool = (index: number, pool: PoolConfig) => {
    onChange(pools.map((item, itemIndex) => itemIndex === index ? pool : item));
  };

  const removePool = (index: number) => {
    onChange(pools.filter((_, itemIndex) => itemIndex !== index));
  };

  const movePool = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex || toIndex < 0 || toIndex >= pools.length) return;

    const nextPools = [...pools];
    const [movedPool] = nextPools.splice(fromIndex, 1);
    nextPools.splice(toIndex, 0, movedPool);
    onChange(nextPools);
  };

  const finishDrag = (toIndex: number) => {
    if (draggedIndexRef.current !== null) {
      movePool(draggedIndexRef.current, toIndex);
    }
    draggedIndexRef.current = null;
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  return (
    <div className="space-y-2">
      {pools.map((pool, index) => {
        const preset = getSelectedPreset(pool, presets);
        const isCustom = !preset;
        const displayName = preset?.name ?? pool.name ?? 'Custom Pool';

        return (
          <div
            key={`selected-pool-${index}`}
            onDragEnter={() => {
              if (draggedIndexRef.current !== null && draggedIndexRef.current !== index) {
                setDragOverIndex(index);
              }
            }}
            onDragOver={(event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = 'move';
            }}
            onDrop={(event) => {
              event.preventDefault();
              finishDrag(index);
            }}
            className={`rounded-xl border bg-card transition-colors ${
              dragOverIndex === index && draggedIndex !== index
                ? 'border-primary bg-primary/[0.04]'
                : 'border-primary/70'
            } ${draggedIndex === index ? 'opacity-60' : ''}`}
          >
            <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 p-4">
              <button
                type="button"
                draggable
                onDragStart={(event) => {
                  draggedIndexRef.current = index;
                  setDraggedIndex(index);
                  setDragOverIndex(index);
                  event.dataTransfer.effectAllowed = 'move';
                  event.dataTransfer.setData('text/plain', String(index));
                }}
                onDragEnd={() => {
                  draggedIndexRef.current = null;
                  setDraggedIndex(null);
                  setDragOverIndex(null);
                }}
                className="inline-flex h-11 w-9 cursor-grab items-center justify-center rounded-lg text-muted-foreground hover:bg-muted/60 hover:text-foreground active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                aria-label={`Drag ${displayName} to reorder pool priority`}
                title="Drag to reorder priority"
              >
                <GripVertical className="h-5 w-5" aria-hidden="true" />
              </button>

              <div className="flex min-w-0 items-center gap-4">
                <PoolIcon
                  logoUrl={preset?.logoUrl}
                  logoOnDark={preset?.logoOnDark}
                  monogram={preset?.monogram}
                  invertLogoInDarkMode={preset?.invertLogoInDarkMode}
                  logoScale={preset?.logoScale}
                  name={displayName}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-medium text-primary">{displayName}</span>
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                      {index === 0 ? 'Primary' : `Fallback ${index}`}
                    </span>
                  </div>
                  {pool.address && (
                    <div className="mt-1 truncate font-mono text-xs text-muted-foreground">
                      {pool.address}:{pool.port}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => movePool(index, index - 1)}
                  disabled={index === 0}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted/60 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                  aria-label={`Move ${displayName} up`}
                  title="Move up"
                >
                  <ArrowUp className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => movePool(index, index + 1)}
                  disabled={index === pools.length - 1}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted/60 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                  aria-label={`Move ${displayName} down`}
                  title="Move down"
                >
                  <ArrowDown className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => removePool(index)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                  aria-label={`Remove ${displayName} from pool priority`}
                  title="Remove"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </div>

            {isCustom && (
              <CustomPoolFields
                pool={pool}
                idPrefix={`custom-pool-${index}`}
                onChange={(nextPool) => updatePool(index, nextPool)}
              />
            )}
          </div>
        );
      })}

      {unselectedPresets.map((preset) => {
        const isDisabled = preset.badge === 'coming-soon' || poolLimitReached;
        return (
          <button
            key={preset.id}
            type="button"
            onClick={() => togglePreset(preset)}
            disabled={isDisabled}
            aria-pressed="false"
            className={`group w-full p-5 rounded-xl border transition-all text-left relative focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
              isDisabled
                ? 'border-border opacity-50 cursor-not-allowed bg-card'
                : 'border-border bg-card hover:border-primary/45 hover:bg-primary/[0.02]'
            }`}
          >
            {preset.badge && (
              <div className="absolute top-4 right-4">
                <span className={`text-xs font-medium uppercase tracking-wider px-2 py-0.5 rounded-full ${
                  preset.badge === 'testing'
                    ? 'bg-warning/10 text-warning'
                    : 'bg-muted text-muted-foreground'
                }`}>
                  {preset.badge === 'testing' ? 'Testing' : 'Coming Soon'}
                </span>
              </div>
            )}
            <div className="flex items-start gap-4">
              <PoolIcon
                logoUrl={preset.logoUrl}
                logoOnDark={preset.logoOnDark}
                monogram={preset.monogram}
                invertLogoInDarkMode={preset.invertLogoInDarkMode}
                logoScale={preset.logoScale}
                name={preset.name}
              />
              <div className="flex-1 min-w-0 pr-8">
                <div className="font-medium text-sm mb-1">{preset.name}</div>
                {preset.address && (
                  <div className="text-xs text-muted-foreground font-mono">
                    {preset.address}:{preset.port}
                  </div>
                )}
              </div>
            </div>
          </button>
        );
      })}

      <button
        type="button"
        onClick={addCustomPool}
        disabled={poolLimitReached}
        title={poolLimitReached ? 'Maximum number of fallback pools reached' : undefined}
        className="group w-full p-5 rounded-xl border border-border bg-card transition-all text-left relative hover:border-primary/45 hover:bg-primary/[0.02] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        <div className="pr-8">
          <div className="font-medium text-sm">Custom Pool</div>
        </div>
      </button>
    </div>
  );
}

function CustomPoolFields({
  pool,
  idPrefix,
  onChange,
}: {
  pool: PoolConfig;
  idPrefix: string;
  onChange: (pool: PoolConfig) => void;
}) {
  const updateField = (field: keyof PoolConfig, value: string | number) => {
    const normalized =
      field === 'authority_public_key' && typeof value === 'string'
        ? stripWrappingQuotes(value)
        : value;
    onChange({ ...pool, [field]: normalized });
  };
  const pubkeyError = getPoolAuthorityPubkeyError(pool.authority_public_key);

  return (
    <div className="border-t border-border bg-muted/20 p-3">
      <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_7rem_minmax(0,1.4fr)]">
        <div>
          <label htmlFor={`${idPrefix}-address`} className="mb-1 block text-xs font-medium text-muted-foreground">
            Address
          </label>
          <input
            id={`${idPrefix}-address`}
            type="text"
            value={pool.address}
            onChange={(event) => updateField('address', event.target.value)}
            placeholder="pool.example.com"
            aria-required="true"
            autoComplete="off"
            className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none transition-all focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/15"
          />
        </div>

        <div>
          <label htmlFor={`${idPrefix}-port`} className="mb-1 block text-xs font-medium text-muted-foreground">
            Port
          </label>
          <input
            id={`${idPrefix}-port`}
            type="number"
            min={1}
            max={65535}
            value={pool.port}
            onChange={(event) => updateField('port', parseInt(event.target.value, 10) || DEFAULT_POOL_PORT)}
            aria-required="true"
            className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none transition-all focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/15"
          />
        </div>

        <div>
          <label htmlFor={`${idPrefix}-pubkey`} className="mb-1 block text-xs font-medium text-muted-foreground">
            Authority Public Key
          </label>
          <input
            id={`${idPrefix}-pubkey`}
            type="text"
            value={pool.authority_public_key}
            onChange={(event) => updateField('authority_public_key', event.target.value)}
            placeholder="Pool authority public key"
            aria-required="true"
            autoComplete="off"
            className={`h-9 w-full rounded-lg border bg-background px-3 font-mono text-sm outline-none transition-all focus-visible:ring-2 focus-visible:ring-primary/15 ${
              pubkeyError ? 'border-destructive focus-visible:border-destructive' : 'border-input focus-visible:border-primary'
            }`}
          />
          {pubkeyError && <p className="mt-1 text-xs text-destructive">{pubkeyError}</p>}
        </div>
      </div>
    </div>
  );
}
