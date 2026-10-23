import { useRef, useState } from 'react';
import { ArrowDown, ArrowUp, GripVertical, Plus, X } from 'lucide-react';
import { DEFAULT_POOL_PORT, MAX_FALLBACK_POOLS, type MiningMode, type PoolConfig } from '@sv2-ui/shared';
import { FieldError } from '@/components/ui/field-error';
import { PoolIcon } from '@/components/ui/pool-icon';
import {
  createEmptyCustomPool,
  getDuplicatePoolEndpointIndexes,
  getKnownPoolForConfig,
  getNextCustomPoolName,
  getUnselectedPresets,
  hasSameEndpoint,
  knownPoolToConfig,
  type KnownPool,
} from '@/lib/pools';
import { withCompatiblePoolIdentity } from '@/lib/miningIdentity';
import { getPoolAuthorityPubkeyError, getPoolAddressError, stripWrappingQuotes } from '@/lib/utils';

// Primary + fallbacks.
const MAX_SELECTED_POOLS = MAX_FALLBACK_POOLS + 1;

const DUPLICATE_ENDPOINT_MESSAGE = 'This pool is already in your list.';

// Stable React keys for pool rows. Keying by index would make per-row state
// (like the "address touched" flag) jump to another pool after a remove or move.
let nextRowId = 0;
function createRowId(): string {
  nextRowId += 1;
  return `pool-row-${nextRowId}`;
}

interface PoolPriorityEditorProps {
  presets: KnownPool[];
  pools: PoolConfig[];
  miningMode: MiningMode | null;
  isJdMode: boolean;
  onChange: (pools: PoolConfig[]) => void;
}

function getSelectedPreset(pool: PoolConfig, presets: KnownPool[]): KnownPool | null {
  return getKnownPoolForConfig(pool, presets);
}

export function PoolPriorityEditor({
  presets,
  pools,
  miningMode,
  isJdMode,
  onChange,
}: PoolPriorityEditorProps) {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const draggedIndexRef = useRef<number | null>(null);
  const [rowIds, setRowIds] = useState<string[]>(() => pools.map(createRowId));
  // The parent replaced the list (e.g. loaded a saved config), so reset the ids.
  if (rowIds.length !== pools.length) {
    setRowIds(pools.map(createRowId));
  }
  const canAddPool = pools.length < MAX_SELECTED_POOLS;
  const duplicateEndpointIndexes = getDuplicatePoolEndpointIndexes(pools);
  const unselectedPresets = getUnselectedPresets(presets, pools);

  const togglePreset = (preset: KnownPool) => {
    const selectedIndex = pools.findIndex((pool) => hasSameEndpoint(pool, preset));
    if (selectedIndex >= 0) {
      removePool(selectedIndex);
      return;
    }

    if (preset.badge === 'coming-soon' || !canAddPool) return;

    setRowIds([...rowIds, createRowId()]);
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
    if (!canAddPool) return;

    setRowIds([...rowIds, createRowId()]);
    onChange([
      ...pools,
      withCompatiblePoolIdentity(
        pools[0],
        createEmptyCustomPool('', getNextCustomPoolName(pools)),
        miningMode,
      ),
    ]);
  };

  const updatePool = (index: number, pool: PoolConfig) => {
    onChange(pools.map((item, itemIndex) => itemIndex === index ? pool : item));
  };

  function removePool(index: number) {
    setRowIds(rowIds.filter((_, itemIndex) => itemIndex !== index));
    onChange(pools.filter((_, itemIndex) => itemIndex !== index));
  }

  const movePool = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex || toIndex < 0 || toIndex >= pools.length) return;

    const nextPools = [...pools];
    const [movedPool] = nextPools.splice(fromIndex, 1);
    nextPools.splice(toIndex, 0, movedPool);

    const nextRowIds = [...rowIds];
    const [movedRowId] = nextRowIds.splice(fromIndex, 1);
    nextRowIds.splice(toIndex, 0, movedRowId);

    setRowIds(nextRowIds);
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
        const isDuplicateEndpoint = duplicateEndpointIndexes.has(index);

        return (
          <div
            key={rowIds[index] ?? `selected-pool-${index}`}
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
                : isDuplicateEndpoint
                ? 'border-destructive/70'
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
                isJdMode={isJdMode}
                isDuplicateEndpoint={isDuplicateEndpoint}
                onChange={(nextPool) => updatePool(index, nextPool)}
              />
            )}

            {/* Preset rows have no inputs, so show the duplicate error here. */}
            {!isCustom && isDuplicateEndpoint && (
              <div className="border-t border-border px-4 pb-3 pt-1">
                <FieldError message="This pool is in your list twice. Remove one to continue." />
              </div>
            )}
          </div>
        );
      })}

      {unselectedPresets.map((preset) => {
        const isDisabled = preset.badge === 'coming-soon' || !canAddPool;
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
        disabled={!canAddPool}
        className="group w-full p-5 rounded-xl border border-dashed border-border bg-card transition-all text-left relative hover:border-primary/45 hover:bg-primary/[0.02] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-border disabled:hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        <div className="flex items-center gap-3">
          <Plus className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <div>
            <div className="font-medium text-sm">Add Custom Pool</div>
            {!canAddPool && (
              <div className="mt-0.5 text-xs text-muted-foreground">
                {`You've reached the limit of ${MAX_FALLBACK_POOLS} fallback pools.`}
              </div>
            )}
          </div>
        </div>
      </button>
    </div>
  );
}

function CustomPoolFields({
  pool,
  idPrefix,
  isJdMode,
  isDuplicateEndpoint,
  onChange,
}: {
  pool: PoolConfig;
  idPrefix: string;
  isJdMode: boolean;
  isDuplicateEndpoint: boolean;
  onChange: (pool: PoolConfig) => void;
}) {
  const [isAddressTouched, setIsAddressTouched] = useState(false);

  const updateField = (field: keyof PoolConfig, value: string | number) => {
    let normalized = value;
    if (typeof value === 'string') {
      if (field === 'authority_public_key') {
        normalized = stripWrappingQuotes(value);
      } else if (field === 'address') {
        normalized = value.trim();
        setIsAddressTouched(true);
      }
    }
    onChange({ ...pool, [field]: normalized });
  };
  const pubkeyError = getPoolAuthorityPubkeyError(pool.authority_public_key);

  const rawAddressError = getPoolAddressError(pool.address);
  const showAddressError = isAddressTouched || pool.address !== '';
  const addressError = (showAddressError ? rawAddressError : null)
    ?? (isDuplicateEndpoint ? DUPLICATE_ENDPOINT_MESSAGE : null);

  return (
    <div className="border-t border-border bg-muted/20 p-3">
      <div className={`grid gap-2 ${
        isJdMode
          ? 'md:grid-cols-[minmax(0,1fr)_7rem_minmax(0,0.65fr)]'
          : 'md:grid-cols-[minmax(0,1fr)_7rem_minmax(0,1.4fr)]'
      }`}>
        <div>
          <label htmlFor={`${idPrefix}-address`} className="mb-1 block text-xs font-medium text-muted-foreground">
            Address (without stratum2+tcp://)
          </label>
          <input
            id={`${idPrefix}-address`}
            type="text"
            value={pool.address}
            onChange={(event) => updateField('address', event.target.value)}
            onBlur={() => setIsAddressTouched(true)}
            placeholder="pool.example.com"
            aria-required="true"
            autoComplete="off"
            className={`h-9 w-full rounded-lg border bg-background px-3 text-sm outline-none transition-all focus-visible:ring-2 focus-visible:ring-primary/15 ${
              addressError ? 'border-destructive focus-visible:border-destructive' : 'border-input focus-visible:border-primary'
            }`}
          />
          <FieldError message={addressError} />
        </div>

        <div>
          <label htmlFor={`${idPrefix}-port`} className="mb-1 block text-xs font-medium text-muted-foreground">
            {isJdMode ? 'Pool Port' : 'Port'}
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

        {isJdMode && (
          <div>
            <label htmlFor={`${idPrefix}-jds-port`} className="mb-1 block text-xs font-medium text-muted-foreground">
              JD Port (optional)
            </label>
            <input
              id={`${idPrefix}-jds-port`}
              type="number"
              min={1}
              max={65535}
              value={pool.jds_port ?? ''}
              onChange={(event) => onChange({
                ...pool,
                jds_port: event.target.value === '' ? undefined : Number(event.target.value),
              })}
              placeholder="3334"
              className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none transition-all focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/15"
            />
          </div>
        )}

        <div className={isJdMode ? 'md:col-span-3' : undefined}>
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
          <FieldError message={pubkeyError} />
        </div>
      </div>
    </div>
  );
}
