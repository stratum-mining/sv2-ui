import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PoolIcon } from '@/components/ui/pool-icon';
import { HashrateInput } from '@/components/ui/hashrate-input';
import {
  AdvancedMiningConfigForm,
  createAdvancedMiningConfigValues,
  isAdvancedMiningConfigValid,
  parseAdvancedMiningConfigValues,
  type AdvancedMiningConfigValues,
} from '@/components/mining/AdvancedMiningConfigForm';
import { FallbackIdentitySection } from '@/components/pools/FallbackIdentitySection';
import { PoolIdentityFields } from '@/components/pools/PoolIdentityFields';
import { PoolPriorityEditor } from '@/components/pools/PoolPriorityEditor';
import {
  getKnownPoolForConfig,
  getPoolsForMode,
} from '@/lib/pools';
import {
  getPoolIdentityError,
  getPoolUserIdentityDisplay,
  normalizePoolPriorityIdentities,
} from '@/lib/miningIdentity';
import {
  getBitcoinAddressError,
  getBitcoinAddressPlaceholder,
  getIdentifierError,
  formatHashrate,
  isTomlSafeIdentifier,
  isValidBitcoinAddress,
} from '@/lib/utils';
import { isPoolFormValid } from '@/lib/poolValidation';
import type { MiningMode, PoolConfig, SetupData, SetupMode } from '@/components/setup/types';
import {
  DEFAULT_SHARES_PER_MINUTE,
  DEFAULT_DOWNSTREAM_EXTRANONCE2_SIZE,
  DEFAULT_MIN_HASHRATE,
  formatBitcoinCoreVersion,
  getMinerTelemetryCidrError,
  normalizeBitcoinCoreVersion,
  normalizeMinerTelemetryCidr,
} from '@sv2-ui/shared';
import { Loader2, Pencil, Check, X } from 'lucide-react';
import { FieldError } from '@/components/ui/field-error';

type EditingField = null | 'pools' | 'mode' | 'signature' | 'coinbaseAddress' | 'hashrate' | 'telemetry' | 'advanced';

interface ConfigurationEditorProps {
  config: SetupData;
  /** Stores an edited copy of the config. The edit closes once this returns true. */
  onSave: (updated: SetupData) => boolean | Promise<boolean>;
  /** Switching to Job Declaration without Bitcoin Core needs the setup wizard instead of a save. */
  onSetupRequired: () => void;
  isSaving: boolean;
  saveLabel: string;
  /** Older configs don't store the modes, so Settings passes the ones the running services report. */
  fallbackMiningMode?: MiningMode | null;
  fallbackMode?: SetupMode | null;
  /** Pool the running services are mining on, marked as current. */
  activePoolIndex?: number | null;
  onEditingChange?: (editing: boolean) => void;
}

/**
 * The configuration with inline editing, shared by Settings and the setup review.
 */
export function ConfigurationEditor({
  config,
  onSave,
  onSetupRequired,
  isSaving,
  saveLabel,
  fallbackMiningMode,
  fallbackMode,
  activePoolIndex = null,
  onEditingChange,
}: ConfigurationEditorProps) {
  const [editing, setEditing] = useState<EditingField>(null);
  const [editPools, setEditPools] = useState<PoolConfig[] | null>(null);
  const [showFallbackIdentityFields, setShowFallbackIdentityFields] = useState(false);
  const [editMode, setEditMode] = useState<'jd' | 'no-jd' | null>(null);
  const [editSignature, setEditSignature] = useState<string>('');
  const [editCoinbaseAddress, setEditCoinbaseAddress] = useState<string>('');
  const [editHashrate, setEditHashrate] = useState<number | null>(null);
  const [hashrateInputValid, setHashrateInputValid] = useState(true);
  const [editMinerTelemetryCidr, setEditMinerTelemetryCidr] = useState('');
  const [editAdvanced, setEditAdvanced] = useState<AdvancedMiningConfigValues | null>(null);
  const [editPrimaryIdentityError, setEditPrimaryIdentityError] = useState<string | null>(null);
  const [editFallbackIdentityErrors, setEditFallbackIdentityErrors] = useState<Record<number, string | null>>({});

  useEffect(() => {
    onEditingChange?.(editing !== null);
  }, [editing, onEditingChange]);

  const startEditPools = () => {
    if (!config.pool) return;
    const configuredPools = [config.pool, ...(config.fallbackPools ?? [])];
    setEditPools(normalizePoolPriorityIdentities(
      configuredPools,
      config.pool,
      config.miningMode,
    ));
    setShowFallbackIdentityFields(false);
    setEditPrimaryIdentityError(null);
    setEditFallbackIdentityErrors({});
    setEditing('pools');
  };

  const startEditMode = () => {
    setEditMode(config.mode ?? fallbackMode ?? 'no-jd');
    setEditing('mode');
  };

  const startEditSignature = (currentValue: string) => {
    setEditSignature(currentValue);
    setEditing('signature');
  };

  const startEditCoinbaseAddress = () => {
    setEditCoinbaseAddress(config.jdc?.coinbase_reward_address ?? '');
    setEditing('coinbaseAddress');
  };

  const startEditHashrate = () => {
    if (!config.translator) return;
    setEditHashrate(config.translator.min_hashrate || DEFAULT_MIN_HASHRATE);
    setHashrateInputValid(true);
    setEditing('hashrate');
  };

  const startEditTelemetry = () => {
    setEditMinerTelemetryCidr(config.miner_telemetry_cidr ?? '');
    setEditing('telemetry');
  };

  const startEditAdvanced = () => {
    if (!config.translator) return;
    setEditAdvanced(createAdvancedMiningConfigValues(config.translator));
    setEditing('advanced');
  };

  const cancelEdit = () => {
    setEditing(null);
    setEditPools(null);
    setShowFallbackIdentityFields(false);
    setEditMode(null);
    setEditSignature('');
    setEditCoinbaseAddress('');
    setEditHashrate(null);
    setHashrateInputValid(true);
    setEditMinerTelemetryCidr('');
    setEditAdvanced(null);
    setEditPrimaryIdentityError(null);
    setEditFallbackIdentityErrors({});
  };

  const editNetwork = config.bitcoin?.network ?? 'mainnet';
  // Identity fields report blocking errors (e.g. a raw worker name that gets
  // sanitized out of the stored identity); they must gate Save too.
  const arePoolsValid = isPoolFormValid({
    pools: editPools ?? [],
    miningMode: config.miningMode ?? null,
    network: editNetwork,
    reportedErrors: { 0: editPrimaryIdentityError, ...editFallbackIdentityErrors },
  });
  const isSignatureValid = editSignature === '' || isTomlSafeIdentifier(editSignature);
  const trimmedCoinbaseAddress = editCoinbaseAddress.trim();
  const isCoinbaseAddressValid = isValidBitcoinAddress(trimmedCoinbaseAddress, editNetwork);
  const isHashrateValid =
    hashrateInputValid &&
    editHashrate !== null &&
    Number.isFinite(editHashrate) &&
    editHashrate > 0;
  const minerTelemetryCidrError = getMinerTelemetryCidrError(editMinerTelemetryCidr);
  const isMinerTelemetryCidrValid = !minerTelemetryCidrError;
  const isAdvancedValid = !!editAdvanced && isAdvancedMiningConfigValid(editAdvanced);

  const saveEdit = async () => {
    const updated: SetupData = { ...config };

    if (editing === 'pools') {
      if (!arePoolsValid || !editPools) return;
      updated.pool = editPools[0] ?? null;
      updated.fallbackPools = editPools.slice(1);
    } else if (editing === 'mode') {
      if (editMode === 'jd' && !config.bitcoin) {
        onSetupRequired();
        return;
      }
      updated.mode = editMode;
      if (editMode === 'no-jd') {
        updated.jdc = null;
        updated.bitcoin = null;
      }
    } else if (editing === 'signature') {
      if (!isSignatureValid || !config.jdc) return;
      updated.jdc = { ...config.jdc, jdc_signature: editSignature.trim() };
    } else if (editing === 'coinbaseAddress') {
      if (!isCoinbaseAddressValid || !config.jdc) return;
      updated.jdc = { ...config.jdc, coinbase_reward_address: trimmedCoinbaseAddress };
    } else if (editing === 'hashrate') {
      if (!isHashrateValid || !config.translator || editHashrate === null) return;
      updated.translator = {
        ...config.translator,
        min_hashrate: editHashrate,
      };
    } else if (editing === 'telemetry') {
      if (!isMinerTelemetryCidrValid) return;
      updated.miner_telemetry_cidr = normalizeMinerTelemetryCidr(editMinerTelemetryCidr);
    } else if (editing === 'advanced') {
      if (!isAdvancedValid || !config.translator || !editAdvanced) return;
      const configIsSoloPool = config.miningMode === 'solo' && config.mode === 'no-jd';
      const parsedAdvancedConfig = parseAdvancedMiningConfigValues(editAdvanced);
      updated.translator = {
        enable_vardiff: true,
        aggregate_channels: config.translator.aggregate_channels,
        ...(configIsSoloPool ? { verify_payout: parsedAdvancedConfig.verifyPayout } : {}),
        min_hashrate: config.translator.min_hashrate,
        shares_per_minute: parsedAdvancedConfig.sharesPerMinute,
        downstream_extranonce2_size: parsedAdvancedConfig.downstreamExtranonce2Size,
      };
    }

    if (await onSave(updated)) cancelEdit();
  };

  const activeMiningMode = config.miningMode ?? fallbackMiningMode ?? null;
  const activeMode = config.mode ?? fallbackMode ?? null;
  const isJdMode = activeMode === 'jd';
  const isSoloMode = activeMiningMode === 'solo';
  const isSovereignSolo = isSoloMode && isJdMode;
  const isSoloPool = isSoloMode && activeMode === 'no-jd';
  const bitcoinCoreVersion = normalizeBitcoinCoreVersion(config.bitcoin?.core_version);
  const templateModeLabel = isSoloMode
    ? isJdMode
      ? 'Sovereign Solo Mining'
      : 'Solo Pool Templates'
    : isJdMode
      ? 'Custom Templates (Job Declaration)'
      : 'Pool Templates';
  const coinbaseAddressLabel = isSovereignSolo ? 'Block Reward Address' : 'Solo Fallback Address';
  const pools = getPoolsForMode(activeMiningMode, activeMode);
  const editPrimaryPool = editPools?.[0] ?? null;
  const editFallbackPools = editPools?.slice(1) ?? [];
  const identityLabel = activeMiningMode === 'solo' ? 'Payout address' : 'Pool username';
  const primaryIdentityValid = editPrimaryPool
    ? !getPoolIdentityError(editPrimaryPool, activeMiningMode, editNetwork)
    : false;
  const fallbackIdentityBlocked = primaryIdentityValid && editFallbackPools.some((pool) => (
    Boolean(getPoolIdentityError(pool, activeMiningMode, editNetwork))
  ));

  const updateEditPoolIdentity = (index: number, nextPool: PoolConfig) => {
    setEditPools((currentPools) => currentPools
      ? normalizePoolPriorityIdentities(
        currentPools.map((pool, poolIndex) => poolIndex === index ? nextPool : pool),
        currentPools[0],
        activeMiningMode,
      )
      : null);
  };

  return (
    <>
      {/* Mining Mode (read-only) */}
      <div className="flex items-center justify-between gap-3 p-4 rounded-lg border border-border/50 bg-muted/20">
        <div className="min-w-0">
          <p className="font-medium">Mining Mode</p>
          <p className="text-sm text-muted-foreground">
            {isSovereignSolo ? 'Sovereign Solo Mining' : isSoloMode ? 'Solo Mining' : 'Pool Mining'}
            {isJdMode && !isSovereignSolo && ' (Job Declaration)'}
          </p>
        </div>
        <Badge variant={isSoloMode ? 'default' : 'secondary'} className="shrink-0">
          {isSoloMode ? 'Solo' : 'Pool'}
        </Badge>
      </div>

      {/* Template Mode — inline-editable only for Pool Mining */}
      {!isSoloMode ? (
        <ConfigRow
          label="Block Templates"
          editing={editing === 'mode'}
          onEdit={startEditMode}
          onSave={saveEdit}
          onCancel={cancelEdit}
          isSaving={isSaving}
          saveLabel={saveLabel}
          disabled={isSaving || (editing !== null && editing !== 'mode')}
          display={
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <p className="text-sm text-muted-foreground">{templateModeLabel}</p>
              <Badge variant={isJdMode ? 'default' : 'secondary'}>
                {isJdMode ? 'JD' : 'No-JD'}
              </Badge>
            </div>
          }
          editContent={
            <div className="space-y-2">
              <div className="flex flex-col gap-2 sm:flex-row">
                {(['no-jd', 'jd'] as const).map(m => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setEditMode(m)}
                    className={`px-4 py-2 rounded-lg border text-sm font-medium transition-all ${editMode === m
                        ? 'border-primary bg-primary/[0.04] text-primary'
                        : 'border-border bg-card hover:border-primary/45'
                      }`}
                  >
                    {m === 'jd' ? 'Job Declaration (Custom Templates)' : 'Pool Templates'}
                  </button>
                ))}
              </div>
              {editMode === 'jd' && !config.bitcoin && (
                <p className="text-xs text-warning">
                  JD mode requires Bitcoin Core configuration. Saving will redirect to the Setup Wizard.
                </p>
              )}
            </div>
          }
        />
      ) : (
        <div className="p-4 rounded-lg border border-border/50 bg-muted/20">
          <p className="font-medium mb-1">Block Templates</p>
          <p className="text-sm text-muted-foreground">{templateModeLabel}</p>
        </div>
      )}

      {/* Pool priority — shared with Setup */}
      {!isSovereignSolo && config.pool && (
        <ConfigRow
          label="Pools"
          editing={editing === 'pools'}
          onEdit={startEditPools}
          onSave={saveEdit}
          onCancel={cancelEdit}
          isSaving={isSaving}
          saveLabel={saveLabel}
          saveDisabled={!arePoolsValid}
          disabled={isSaving || (editing !== null && editing !== 'pools')}
          display={
            <div className="space-y-3">
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Primary
                </p>
                <PoolSummary
                  pool={config.pool}
                  miningMode={activeMiningMode}
                  isActive={activePoolIndex === 0}
                />
              </div>
              {(config.fallbackPools ?? []).length > 0 && (
                <div className="space-y-2 border-t border-border/60 pt-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Fallback
                  </p>
                  {config.fallbackPools.map((pool, index) => (
                    <PoolSummary
                      key={`${pool.address}:${pool.port}:${index}`}
                      pool={pool}
                      miningMode={activeMiningMode}
                      fallbackIndex={index}
                      isActive={activePoolIndex === index + 1}
                    />
                  ))}
                </div>
              )}
            </div>
          }
          editContent={
            <div className="space-y-6">
              <PoolPriorityEditor
                presets={pools}
                pools={editPools ?? []}
                miningMode={activeMiningMode}
                isJdMode={isJdMode}
                onChange={(nextPools) => {
                  setEditPools((currentPools) => normalizePoolPriorityIdentities(
                    nextPools,
                    currentPools?.[0],
                    activeMiningMode,
                  ));
                }}
              />

              {editPrimaryPool && (
                <div className="space-y-4 border-t border-border pt-5">
                  <div>
                    <h3 className="text-sm font-semibold">Mining identity</h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Set the primary {identityLabel.toLowerCase()}.{' '}
                      {activeMiningMode === 'solo'
                        ? 'Fallback pools inherit it by default.'
                        : 'Each fallback pool needs its own username.'}
                    </p>
                  </div>

                  <div className="rounded-xl border border-border bg-muted/20 p-4">
                    <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Primary
                    </p>
                    <PoolIdentityFields
                      pool={editPrimaryPool}
                      miningMode={activeMiningMode}
                      network={editNetwork}
                      idPrefix="edit-primary-pool"
                      onChange={(nextPool) => updateEditPoolIdentity(0, nextPool)}
                      onBlockingErrorChange={setEditPrimaryIdentityError}
                    />
                  </div>

                  {editFallbackPools.length > 0 && (
                    <FallbackIdentitySection
                      primaryPool={editPrimaryPool}
                      fallbackPools={editFallbackPools}
                      presets={pools}
                      miningMode={activeMiningMode}
                      network={editNetwork}
                      identityLabel={identityLabel}
                      idPrefix="edit-fallback-identity"
                      expanded={showFallbackIdentityFields || fallbackIdentityBlocked}
                      hasBlockingError={fallbackIdentityBlocked}
                      onToggle={() => setShowFallbackIdentityFields((current) => !current)}
                      onChange={(index, nextPool) => {
                        setShowFallbackIdentityFields(true);
                        updateEditPoolIdentity(index + 1, nextPool);
                      }}
                      onFieldBlockingError={(index, error) => {
                        setEditFallbackIdentityErrors((current) => ({ ...current, [index + 1]: error }));
                      }}
                    />
                  )}
                </div>
              )}
            </div>
          }
        />
      )}

      {/* Miner Signature (JD mode) */}
      {isJdMode && config.jdc && (
        <ConfigRow
          label="Miner Signature"
          editing={editing === 'signature'}
          onEdit={() => startEditSignature(config.jdc?.jdc_signature || '')}
          onSave={saveEdit}
          onCancel={cancelEdit}
          isSaving={isSaving}
          saveLabel={saveLabel}
          saveDisabled={!isSignatureValid}
          disabled={isSaving || (editing !== null && editing !== 'signature')}
          display={
            <div className="space-y-1">
              <p className="font-mono text-xs text-muted-foreground truncate">
                {config.jdc.jdc_signature || (isSovereignSolo ? 'solo_miner' : 'Not set')}
              </p>
              {isSovereignSolo && !config.jdc.jdc_signature && (
                <p className="text-xs text-muted-foreground">Defaults to solo_miner</p>
              )}
            </div>
          }
          editContent={
            <div>
              <input
                type="text"
                value={editSignature}
                onChange={(e) => setEditSignature(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && isSignatureValid && !isSaving) saveEdit();
                  if (e.key === 'Escape') cancelEdit();
                }}
                autoFocus
                autoComplete="off"
                placeholder="Miner signature"
                className="w-full h-10 px-3 rounded-lg border border-input bg-background font-mono text-sm focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/15 outline-none transition-all"
              />
              {editSignature && (
                <FieldError message={getIdentifierError(editSignature)} />
              )}
              <p className="text-xs text-muted-foreground mt-2">
                Miner-chosen tag shown in coinbase transactions on block explorers.
              </p>
            </div>
          }
        />
      )}

      {/* Fallback / block reward address (JD mode) */}
      {isJdMode && config.jdc && (
        <ConfigRow
          label={coinbaseAddressLabel}
          editing={editing === 'coinbaseAddress'}
          onEdit={startEditCoinbaseAddress}
          onSave={saveEdit}
          onCancel={cancelEdit}
          isSaving={isSaving}
          saveLabel={saveLabel}
          saveDisabled={!isCoinbaseAddressValid}
          disabled={isSaving || (editing !== null && editing !== 'coinbaseAddress')}
          display={
            <p className="text-muted-foreground font-mono text-xs truncate">
              {config.jdc.coinbase_reward_address || 'Not set'}
            </p>
          }
          editContent={
            <div>
              <label htmlFor="edit-coinbase-address" className="sr-only">
                {coinbaseAddressLabel}
              </label>
              <input
                id="edit-coinbase-address"
                type="text"
                value={editCoinbaseAddress}
                onChange={(e) => setEditCoinbaseAddress(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && isCoinbaseAddressValid && !isSaving) saveEdit();
                  if (e.key === 'Escape') cancelEdit();
                }}
                autoFocus
                autoComplete="off"
                spellCheck={false}
                placeholder={getBitcoinAddressPlaceholder(editNetwork)}
                className="w-full h-10 px-3 rounded-lg border border-input bg-background font-mono text-sm focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/15 outline-none transition-all"
              />
              <FieldError message={getBitcoinAddressError(trimmedCoinbaseAddress, editNetwork)} />
              <p className="text-xs text-muted-foreground mt-2">
                {isSovereignSolo
                  ? 'Where the full block reward is paid when your node finds a block.'
                  : 'Used for coinbase rewards if the Job Declarator falls back to solo mining due to pool connection issues.'}
              </p>
            </div>
          }
        />
      )}

      {/* Lowest worker hashrate */}
      {config.translator && (
        <ConfigRow
          label="Lowest Worker Hashrate"
          editing={editing === 'hashrate'}
          onEdit={startEditHashrate}
          onSave={saveEdit}
          onCancel={cancelEdit}
          isSaving={isSaving}
          saveLabel={saveLabel}
          saveDisabled={!isHashrateValid}
          disabled={isSaving || (editing !== null && editing !== 'hashrate')}
          display={
            <p className="text-sm text-muted-foreground">
              {formatHashrate(config.translator.min_hashrate || DEFAULT_MIN_HASHRATE)}
            </p>
          }
          editContent={
            editHashrate !== null && (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  One worker? Enter its hashrate. Multiple? Use the lowest performing.
                </p>
                <HashrateInput
                  idPrefix="edit-lowest-worker-hashrate"
                  value={editHashrate}
                  onChange={setEditHashrate}
                  onValidityChange={setHashrateInputValid}
                />
              </div>
            )
          }
        />
      )}

      <ConfigRow
        label="Miner Telemetry"
        editing={editing === 'telemetry'}
        onEdit={startEditTelemetry}
        onSave={saveEdit}
        onCancel={cancelEdit}
        isSaving={isSaving}
        saveLabel={saveLabel}
        saveDisabled={!isMinerTelemetryCidrValid}
        disabled={isSaving || (editing !== null && editing !== 'telemetry')}
        display={
          <div className="grid gap-1 text-xs text-muted-foreground">
            <p>
              LAN CIDR:{' '}
              <span className="font-mono text-foreground">
                {config.miner_telemetry_cidr || 'Not set'}
              </span>
            </p>
            <p>Recommended to discover miner web/API telemetry.</p>
          </div>
        }
        editContent={
          <div>
            <label htmlFor="edit-miner-telemetry-cidr" className="block text-xs font-medium mb-1">
              Miners' LAN CIDR <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <input
              id="edit-miner-telemetry-cidr"
              type="text"
              value={editMinerTelemetryCidr}
              onChange={(event) => setEditMinerTelemetryCidr(event.target.value)}
              placeholder="192.168.1.0/24"
              autoComplete="off"
              className="w-full h-9 px-3 rounded-lg border border-input bg-background font-mono text-sm focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/15 outline-none transition-all"
            />
            <FieldError message={minerTelemetryCidrError} />
            <p className="text-xs text-muted-foreground mt-2">
              Private LAN subnet where miners expose their web/API interface.
            </p>
          </div>
        }
      />

      {/* Advanced mining configuration */}
      {config.translator && (
        <ConfigRow
          label="Advanced Mining Config"
          editing={editing === 'advanced'}
          onEdit={startEditAdvanced}
          onSave={saveEdit}
          onCancel={cancelEdit}
          isSaving={isSaving}
          saveLabel={saveLabel}
          saveDisabled={!isAdvancedValid}
          disabled={isSaving || (editing !== null && editing !== 'advanced')}
          display={
            <div className="grid gap-1 text-xs text-muted-foreground">
              <p>
                Shares/min:{' '}
                <span className="font-mono text-foreground">
                  {config.translator.shares_per_minute ?? DEFAULT_SHARES_PER_MINUTE}
                </span>
              </p>
              <p>
                Downstream extranonce2:{' '}
                <span className="font-mono text-foreground">
                  {config.translator.downstream_extranonce2_size ?? DEFAULT_DOWNSTREAM_EXTRANONCE2_SIZE}
                </span>
              </p>
              {isSoloPool && (
                <p>
                  Coinbase verification:{' '}
                  <span className="font-mono text-foreground">
                    {(config.translator.verify_payout ?? true) ? 'Enabled' : 'Disabled'}
                  </span>
                </p>
              )}
            </div>
          }
          editContent={
            editAdvanced && (
              <AdvancedMiningConfigForm
                idPrefix="settings-advanced-mining"
                value={editAdvanced}
                onChange={setEditAdvanced}
                showCoinbaseVerification={isSoloPool}
              />
            )
          }
        />
      )}

      {/* Bitcoin Core (JD mode) */}
      {isJdMode && config.bitcoin && (
        <div className="p-4 rounded-lg border border-border/50 bg-muted/20 space-y-2">
          <div className="flex items-center gap-2">
            <p className="font-medium">Bitcoin Core</p>
            <Badge variant="outline" className="text-xs">
              {bitcoinCoreVersion ? formatBitcoinCoreVersion(bitcoinCoreVersion) : 'Not selected'}
            </Badge>
            <Badge variant="outline" className="text-xs">{config.bitcoin.network}</Badge>
          </div>
          <p className="text-muted-foreground font-mono text-xs truncate">
            {config.bitcoin.socket_path}
          </p>
        </div>
      )}
    </>
  );
}

/**
 * Reusable editable config row with display/edit toggle.
 */
function ConfigRow({
  label,
  editing,
  onEdit,
  onSave,
  onCancel,
  isSaving,
  saveLabel,
  saveDisabled,
  disabled,
  display,
  editContent,
}: {
  label: string;
  editing: boolean;
  onEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
  isSaving: boolean;
  saveLabel: string;
  saveDisabled?: boolean;
  disabled: boolean;
  display: React.ReactNode;
  editContent: React.ReactNode;
}) {
  if (editing) {
    return (
      <div className="p-4 rounded-lg border border-primary/50 bg-primary/[0.02] space-y-3">
        <p className="font-medium text-sm text-primary">{label}</p>
        {editContent}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={onSave} disabled={isSaving || saveDisabled}>
            {isSaving ? (
              <><Loader2 className="mr-2 h-3 w-3 animate-spin" /> Saving...</>
            ) : (
              <><Check className="mr-2 h-3 w-3" /> {saveLabel}</>
            )}
          </Button>
          <Button variant="outline" size="sm" onClick={onCancel} disabled={isSaving}>
            <X className="mr-2 h-3 w-3" /> Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="group p-4 rounded-lg border border-border/50 bg-muted/20">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <p className="font-medium text-sm">{label}</p>
          {display}
        </div>
        <button
          type="button"
          onClick={onEdit}
          disabled={disabled}
          className={
            disabled
              ? 'p-1.5 rounded-md text-muted-foreground/50 opacity-40 cursor-not-allowed'
              : 'p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors opacity-100 sm:opacity-0 sm:group-hover:opacity-100'
          }
          title={disabled ? 'Finish your current edit to change this' : `Edit ${label.toLowerCase()}`}
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function PoolSummary({
  pool,
  miningMode,
  fallbackIndex,
  isActive = false,
}: {
  pool: PoolConfig;
  miningMode: SetupData['miningMode'];
  fallbackIndex?: number;
  isActive?: boolean;
}) {
  const knownPool = getKnownPoolForConfig(pool);
  const displayName = (knownPool?.name ?? pool.name) || 'Custom Pool';
  const identityDisplay = getPoolUserIdentityDisplay(pool, miningMode);

  return (
    <div className="flex items-start gap-3">
      {fallbackIndex !== undefined && (
        <div className="mt-0.5 inline-flex h-9 min-w-9 items-center justify-center rounded-lg bg-muted/60 px-2 text-xs font-semibold text-muted-foreground">
          {fallbackIndex + 1}
        </div>
      )}
      <PoolIcon
        logoUrl={knownPool?.logoUrl}
        logoOnDark={knownPool?.logoOnDark}
        monogram={knownPool?.monogram}
        invertLogoInDarkMode={knownPool?.invertLogoInDarkMode}
        logoScale={knownPool?.logoScale}
        name={displayName}
        className="h-9 w-9 rounded-lg"
        imageClassName="h-5 w-5"
        fallbackClassName="h-4 w-4"
      />
      <div className="min-w-0 space-y-0.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <p className="font-medium text-sm">{displayName}</p>
          {isActive && <Badge variant="default">Current</Badge>}
          {isActive && fallbackIndex !== undefined && (
            <Badge variant="secondary">Fallback</Badge>
          )}
        </div>
        <p className="text-muted-foreground font-mono text-xs">
          {pool.address}:{pool.port}
        </p>
        <p className="text-muted-foreground text-xs truncate">
          {identityDisplay}
        </p>
      </div>
    </div>
  );
}
