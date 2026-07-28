import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { useSetupStatus } from '@/hooks/useSetupStatus';
import { useControlApi, getCurrentConfig } from '@/hooks/useControlApi';
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
  getIdentifierError,
  formatHashrate,
  isTomlSafeIdentifier,
} from '@/lib/utils';
import { clearDashboardClientState } from '@/lib/dashboardState';
import { isPoolComplete } from '@/lib/poolValidation';
import { isBitcoinSocketError } from '@/lib/bitcoinSocketErrors';
import type { PoolConfig, SetupData } from '@/components/setup/types';
import {
  DEFAULT_SHARES_PER_MINUTE,
  DEFAULT_DOWNSTREAM_EXTRANONCE2_SIZE,
  DEFAULT_MIN_HASHRATE,
  formatBitcoinCoreVersion,
  getMinerTelemetryCidrError,
  normalizeBitcoinCoreVersion,
  normalizeMinerTelemetryCidr,
} from '@sv2-ui/shared';
import {
  Loader2,
  AlertCircle,
  RotateCw,
  StopCircle,
  Trash2,
  Pencil,
  Check,
  X,
} from 'lucide-react';
import { FieldError } from '@/components/ui/field-error';
import { StatusDot } from '@/components/ui/status-dot';
const SETUP_TARGET_STEP_STORAGE_KEY = 'sv2-ui-setup-target-step';

type EditingField = null | 'pools' | 'mode' | 'signature' | 'hashrate' | 'telemetry' | 'advanced';

/**
 * Configuration tab for Settings page.
 * Shows current setup and allows inline editing of pool and template mode.
 */
export function ConfigurationTab() {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const [config, setConfig] = useState<SetupData | null>(null);
  const [loading, setLoading] = useState(true);
  const {
    isOrchestrated,
    isConfigured,
    isRunning,
    miningMode: statusMiningMode,
    mode: statusMode,
    activePoolIndex,
  } = useSetupStatus();
  const {
    stop,
    restart,
    setup,
    isStoppingOrRestarting,
    isSettingUp,
    stopError,
    restartError,
    setupError,
  } = useControlApi();

  const [editing, setEditing] = useState<EditingField>(null);
  const [editPools, setEditPools] = useState<PoolConfig[] | null>(null);
  const [showFallbackIdentityFields, setShowFallbackIdentityFields] = useState(false);
  const [editMode, setEditMode] = useState<'jd' | 'no-jd' | null>(null);
  const [editSignature, setEditSignature] = useState<string>('');
  const [editHashrate, setEditHashrate] = useState<number | null>(null);
  const [hashrateInputValid, setHashrateInputValid] = useState(true);
  const [editMinerTelemetryCidr, setEditMinerTelemetryCidr] = useState('');
  const [editAdvanced, setEditAdvanced] = useState<AdvancedMiningConfigValues | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    if (isOrchestrated && isConfigured) {
      getCurrentConfig().then(cfg => {
        setConfig(cfg);
        setLoading(false);
      });
    } else {
      setLoading(false);
    }
  }, [isOrchestrated, isConfigured]);

  useEffect(() => {
    if (!saveSuccess) return;
    const t = setTimeout(() => setSaveSuccess(false), 2000);
    return () => clearTimeout(t);
  }, [saveSuccess]);

  const handleReconfigure = () => {
    clearDashboardClientState(queryClient);
    navigate('/setup');
  };

  const handleStop = () => {
    if (confirm('Stop all services? Your miners will disconnect.')) {
      stop();
    }
  };

  const handleRestart = () => {
    if (confirm('Restart services? There will be a brief interruption.')) {
      restart();
    }
  };

  const handleReset = async () => {
    if (confirm('Delete configuration and stop all services? This cannot be undone.')) {
      try {
        const response = await fetch('/api/reset', { method: 'POST' });
        if (response.ok) {
          clearDashboardClientState(queryClient);
          window.location.href = '/setup';
        }
      } catch (error) {
        console.error('Reset failed:', error);
      }
    }
  };

  const handleOpenBitcoinSetup = () => {
    window.sessionStorage.setItem(SETUP_TARGET_STEP_STORAGE_KEY, 'bitcoin');
    navigate('/setup');
  };

  const startEditPools = () => {
    if (!config?.pool) return;
    const configuredPools = [config.pool, ...(config.fallbackPools ?? [])];
    setEditPools(normalizePoolPriorityIdentities(
      configuredPools,
      config.pool,
      config.miningMode,
    ));
    setShowFallbackIdentityFields(false);
    setEditing('pools');
  };

  const startEditMode = () => {
    setEditMode(config?.mode ?? statusMode ?? 'no-jd');
    setEditing('mode');
  };

  const startEditSignature = (currentValue: string) => {
    setEditSignature(currentValue);
    setEditing('signature');
  };

  const startEditHashrate = () => {
    if (!config?.translator) return;
    setEditHashrate(config.translator.min_hashrate || DEFAULT_MIN_HASHRATE);
    setHashrateInputValid(true);
    setEditing('hashrate');
  };

  const startEditTelemetry = () => {
    setEditMinerTelemetryCidr(config?.miner_telemetry_cidr ?? '');
    setEditing('telemetry');
  };

  const startEditAdvanced = () => {
    if (!config?.translator) return;
    setEditAdvanced(createAdvancedMiningConfigValues(config.translator));
    setEditing('advanced');
  };

  const cancelEdit = () => {
    setEditing(null);
    setEditPools(null);
    setShowFallbackIdentityFields(false);
    setEditMode(null);
    setEditSignature('');
    setEditHashrate(null);
    setHashrateInputValid(true);
    setEditMinerTelemetryCidr('');
    setEditAdvanced(null);
  };

  const editNetwork = config?.bitcoin?.network ?? 'mainnet';
  const arePoolsValid =
    (editPools?.length ?? 0) > 0 &&
    (editPools ?? []).every((pool) => (
      isPoolComplete(pool, config?.miningMode ?? null, editNetwork)
    ));
  const isSignatureValid = editSignature === '' || isTomlSafeIdentifier(editSignature);
  const isHashrateValid =
    hashrateInputValid &&
    editHashrate !== null &&
    Number.isFinite(editHashrate) &&
    editHashrate > 0;
  const minerTelemetryCidrError = getMinerTelemetryCidrError(editMinerTelemetryCidr);
  const isMinerTelemetryCidrValid = !minerTelemetryCidrError;
  const isAdvancedValid = !!editAdvanced && isAdvancedMiningConfigValid(editAdvanced);

  const saveEdit = () => {
    if (!config) return;

    const updated: SetupData = { ...config };

    if (editing === 'pools') {
      if (!arePoolsValid || !editPools) return;
      updated.pool = editPools[0] ?? null;
      updated.fallbackPools = editPools.slice(1);
    } else if (editing === 'mode') {
      if (editMode === 'jd' && !config.bitcoin) {
        navigate('/setup');
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

    setup(updated, {
      onSuccess: async (response) => {
        if (!response.success) return;

        await queryClient.invalidateQueries({ queryKey: ['setup-status'] });
        const refreshedConfig = await getCurrentConfig();
        setConfig(refreshedConfig ?? updated);
        cancelEdit();
        setSaveSuccess(true);
      },
    });
  };

  // Not using orchestration backend
  if (!isOrchestrated) {
    return (
      <div className="space-y-6 animate-in slide-in-from-left-2 duration-300">
        <Card className="border-dashed">
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">
              <p className="font-medium text-foreground mb-1">Standalone Mode</p>
              <p>
                This UI is running in monitoring-only mode. Configuration management is not available.
                Services should be configured and started manually.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Not configured yet
  if (!isConfigured) {
    return (
      <div className="space-y-6 animate-in slide-in-from-left-2 duration-300">
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="pt-6">
            <div className="flex gap-3">
              <AlertCircle className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
              <div className="space-y-3">
                <div className="text-sm">
                  <p className="font-medium text-primary mb-1">Not Configured</p>
                  <p className="text-muted-foreground">
                    No configuration found. Run the setup wizard to configure your mining client.
                  </p>
                </div>
                <Button onClick={() => navigate('/setup')}>
                  Go to Setup
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loading || !config) {
    return <div className="text-center text-muted-foreground py-8">Loading configuration...</div>;
  }

  const activeMiningMode = config.miningMode ?? statusMiningMode;
  const activeMode = config.mode ?? statusMode;
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
  const pools = getPoolsForMode(activeMiningMode, activeMode);
  const isSaving = isSettingUp;
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
    <div className="space-y-6 animate-in slide-in-from-left-2 duration-300">
      {/* Status Banner */}
      <Card className={isRunning ? 'border-green-500/30 bg-green-500/5' : 'border-muted'}>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <StatusDot status={isRunning ? 'connected' : 'idle'} size="lg" />
              <div className="min-w-0">
                <p className="font-medium">{isRunning ? 'Services Running' : 'Services Stopped'}</p>
                <p className="text-sm text-muted-foreground">
                  {isSovereignSolo ? 'Sovereign Solo Mining' : isSoloMode ? 'Solo Mining' : 'Pool Mining'}
                  {isJdMode && !isSovereignSolo && ' (Job Declaration)'}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 sm:flex-nowrap sm:justify-end">
              {isRunning ? (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRestart}
                    disabled={isStoppingOrRestarting}
                  >
                    {isStoppingOrRestarting ? (
                      <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Restarting...</>
                    ) : (
                      <><RotateCw className="mr-2 h-4 w-4" /> Restart</>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleStop}
                    disabled={isStoppingOrRestarting}
                  >
                    {isStoppingOrRestarting ? (
                      <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Stopping...</>
                    ) : (
                      <><StopCircle className="mr-2 h-4 w-4" /> Stop</>
                    )}
                  </Button>
                </>
              ) : (
                <Button
                  size="sm"
                  onClick={handleRestart}
                  disabled={isStoppingOrRestarting}
                  className="w-full sm:w-auto"
                >
                  {isStoppingOrRestarting ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Starting...</>
                  ) : (
                    'Start Services'
                  )}
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Error Messages */}
      {(stopError || restartError || setupError) && (
        <Card className="border-red-500/30 bg-red-500/5">
          <CardContent className="pt-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex gap-3">
                <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0" />
                <p className="text-sm text-red-500">
                  {stopError?.message || restartError?.message || setupError?.message || 'Operation failed'}
                </p>
              </div>
              {isBitcoinSocketError(stopError || restartError || setupError) && (
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  onClick={handleOpenBitcoinSetup}
                  className="sm:ml-4"
                >
                  Open Bitcoin Setup
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Save Success */}
      {saveSuccess && (
        <Card className="border-green-500/30 bg-green-500/5">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Check className="h-5 w-5 text-green-500" />
              <p className="text-sm text-green-500">Settings saved. Services restarting with new configuration.</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Current Configuration */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 space-y-1.5">
              <CardTitle>Current Configuration</CardTitle>
              <CardDescription>Your active mining client setup. Click the edit icon to change a setting.</CardDescription>
            </div>
            <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:flex-nowrap sm:justify-end">
              <Button variant="outline" onClick={handleReconfigure} className="flex-1 sm:flex-none">
                Reconfigure
              </Button>
              <Button variant="outline" onClick={handleReset} className="flex-1 sm:flex-none">
                <Trash2 className="mr-2 h-4 w-4" />
                Reset
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
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
              disabled={editing !== null && editing !== 'mode'}
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
              saveDisabled={!arePoolsValid}
              disabled={editing !== null && editing !== 'pools'}
              display={
                <div className="space-y-3">
                  <div>
                    <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Primary
                    </p>
                    <PoolSummary
                      pool={config.pool}
                      miningMode={activeMiningMode}
                      isActive={isRunning && activePoolIndex === 0}
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
                          isActive={isRunning && activePoolIndex === index + 1}
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
                          Set the primary {identityLabel.toLowerCase()}. Fallback pools inherit it by default.
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
                          onChange={(index, nextPool) => updateEditPoolIdentity(index + 1, nextPool)}
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
              saveDisabled={!isSignatureValid}
              disabled={editing !== null && editing !== 'signature'}
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

          {/* Lowest worker hashrate */}
          {config.translator && (
            <ConfigRow
              label="Lowest Worker Hashrate"
              editing={editing === 'hashrate'}
              onEdit={startEditHashrate}
              onSave={saveEdit}
              onCancel={cancelEdit}
              isSaving={isSaving}
              saveDisabled={!isHashrateValid}
              disabled={editing !== null && editing !== 'hashrate'}
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
            saveDisabled={!isMinerTelemetryCidrValid}
            disabled={editing !== null && editing !== 'telemetry'}
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
              saveDisabled={!isAdvancedValid}
              disabled={editing !== null && editing !== 'advanced'}
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

          {/* Fallback Address (JD mode) */}
          {isJdMode && config.jdc?.coinbase_reward_address && (
            <div className="p-4 rounded-lg border border-border/50 bg-muted/20">
              <p className="font-medium mb-1">{isSovereignSolo ? 'Block Reward Address' : 'Fallback Address'}</p>
              <p className="text-muted-foreground font-mono text-xs truncate">
                {config.jdc.coinbase_reward_address}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
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
              <><Check className="mr-2 h-3 w-3" /> Save & Restart</>
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