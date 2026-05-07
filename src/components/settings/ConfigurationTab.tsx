import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PoolIcon } from '@/components/ui/pool-icon';
import { useSetupStatus } from '@/hooks/useSetupStatus';
import { useControlApi, getCurrentConfig } from '@/hooks/useControlApi';
import { getPoolsForMode, type KnownPool } from '@/lib/pools';
import {
  getIdentifierError,
  getPoolAuthorityPubkeyError,
  isTomlSafeIdentifier,
  isValidPoolAuthorityPubkey,
  stripWrappingQuotes,
} from '@/lib/utils';
import { isBitcoinSocketError } from '@/lib/bitcoinSocketErrors';
import type { SetupData } from '@/components/setup/types';
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

function clearPersistedDashboardState() {
  if (typeof window === 'undefined') return;

  const prefixes = [
    'sv2_hashrate_history:',
    'sv2_blocks_found:',
    'sv2_best_diff:',
    'sv2_share_stats:',
  ];

  const keysToRemove: string[] = [];

  for (let i = 0; i < window.localStorage.length; i += 1) {
    const key = window.localStorage.key(i);
    if (key && prefixes.some((prefix) => key.startsWith(prefix))) {
      keysToRemove.push(key);
    }
  }

  keysToRemove.forEach((key) => {
    window.localStorage.removeItem(key);
  });
}

const SETUP_TARGET_STEP_STORAGE_KEY = 'sv2-ui-setup-target-step';

type EditingField = null | 'pool' | 'mode' | 'identity' | 'signature' | 'advanced';

const DEFAULT_SHARES_PER_MINUTE = 6;
const DEFAULT_DOWNSTREAM_EXTRANONCE2_SIZE = 4;

function isPositiveNumber(value: string): boolean {
  const parsed = Number(value);
  return value.trim() !== '' && Number.isFinite(parsed) && parsed > 0;
}

function isPositiveInteger(value: string): boolean {
  const parsed = Number(value);
  return isPositiveNumber(value) && Number.isInteger(parsed);
}

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
  const [editPool, setEditPool] = useState<{ name: string; address: string; port: number; authority_public_key: string } | null>(null);
  const [isCustomPool, setIsCustomPool] = useState(false);
  const [editMode, setEditMode] = useState<'jd' | 'no-jd' | null>(null);
  const [editIdentity, setEditIdentity] = useState<string>('');
  const [editSignature, setEditSignature] = useState<string>('');
  const [editAdvanced, setEditAdvanced] = useState<{
    shares_per_minute: string;
    downstream_extranonce2_size: string;
  } | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const clearDashboardClientState = () => {
    clearPersistedDashboardState();

    [
      ['pool-global'],
      ['server-channels'],
      ['sv2-clients'],
      ['sv1-clients'],
      ['translator-server-channels'],
      ['translator-health'],
      ['jdc-health'],
    ].forEach((queryKey) => {
      queryClient.removeQueries({ queryKey });
    });
  };

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
    clearDashboardClientState();
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
          clearDashboardClientState();
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

  const startEditPool = () => {
    if (!config?.pool) return;
    const availablePools = getPoolsForMode(config.miningMode, config.mode);
    const matchesPreset = availablePools.some(p => p.address === config.pool?.address && p.port === config.pool?.port);
    setIsCustomPool(!matchesPreset);
    setEditPool({ ...config.pool });
    setEditing('pool');
  };

  const startEditMode = () => {
    setEditMode(config?.mode ?? statusMode ?? 'no-jd');
    setEditing('mode');
  };

  const startEditIdentity = (currentValue: string) => {
    setEditIdentity(currentValue);
    setEditing('identity');
  };

  const startEditSignature = (currentValue: string) => {
    setEditSignature(currentValue);
    setEditing('signature');
  };

  const startEditAdvanced = () => {
    if (!config?.translator) return;
    setEditAdvanced({
      shares_per_minute: String(config.translator.shares_per_minute ?? DEFAULT_SHARES_PER_MINUTE),
      downstream_extranonce2_size: String(
        config.translator.downstream_extranonce2_size ?? DEFAULT_DOWNSTREAM_EXTRANONCE2_SIZE,
      ),
    });
    setEditing('advanced');
  };

  const cancelEdit = () => {
    setEditing(null);
    setEditPool(null);
    setIsCustomPool(false);
    setEditMode(null);
    setEditIdentity('');
    setEditSignature('');
    setEditAdvanced(null);
  };

  const isPoolValid =
    !!editPool?.address &&
    !!editPool?.authority_public_key &&
    isValidPoolAuthorityPubkey(editPool.authority_public_key);
  const isIdentityValid = isTomlSafeIdentifier(editIdentity);
  const isSignatureValid = editSignature === '' || isTomlSafeIdentifier(editSignature);
  const isAdvancedValid =
    !!editAdvanced &&
    isPositiveNumber(editAdvanced.shares_per_minute) &&
    isPositiveInteger(editAdvanced.downstream_extranonce2_size);

  const saveEdit = () => {
    if (!config) return;

    const updated: SetupData = { ...config };

    if (editing === 'pool' && editPool) {
      if (!isPoolValid) return;
      updated.pool = { ...editPool };
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
    } else if (editing === 'identity') {
      if (!isIdentityValid || !config.translator) return;
      const trimmed = editIdentity.trim();
      updated.translator = { ...config.translator, user_identity: trimmed };
      if (config.jdc) {
        updated.jdc = { ...config.jdc, user_identity: trimmed };
      }
    } else if (editing === 'signature') {
      if (!isSignatureValid || !config.jdc) return;
      updated.jdc = { ...config.jdc, jdc_signature: editSignature.trim() };
    } else if (editing === 'advanced') {
      if (!isAdvancedValid || !config.translator || !editAdvanced) return;
      updated.translator = {
        ...config.translator,
        enable_vardiff: true,
        shares_per_minute: Number(editAdvanced.shares_per_minute),
        downstream_extranonce2_size: Number(editAdvanced.downstream_extranonce2_size),
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
  const templateModeLabel = isSoloMode
    ? isJdMode
      ? 'Sovereign Solo Mining'
      : 'Solo Pool Templates'
    : isJdMode
      ? 'Custom Templates (Job Declaration)'
      : 'Pool Templates';
  const pools = getPoolsForMode(activeMiningMode, activeMode);
  const isSaving = isSettingUp;

  return (
    <div className="space-y-6 animate-in slide-in-from-left-2 duration-300">
      {/* Status Banner */}
      <Card className={isRunning ? 'border-green-500/30 bg-green-500/5' : 'border-muted'}>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`h-3 w-3 rounded-full ${isRunning ? 'bg-green-500' : 'bg-muted-foreground'}`} />
              <div>
                <p className="font-medium">{isRunning ? 'Services Running' : 'Services Stopped'}</p>
                <p className="text-sm text-muted-foreground">
                  {isSovereignSolo ? 'Sovereign Solo Mining' : isSoloMode ? 'Solo Mining' : 'Pool Mining'}
                  {isJdMode && !isSovereignSolo && ' (Job Declaration)'}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
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
                <Button size="sm" onClick={handleRestart} disabled={isStoppingOrRestarting}>
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
          <div className="flex items-center justify-between">
            <div className="space-y-1.5">
              <CardTitle>Current Configuration</CardTitle>
              <CardDescription>Your active mining client setup. Click the edit icon to change a setting.</CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleReconfigure}>
                Reconfigure
              </Button>
              <Button variant="outline" onClick={handleReset}>
                <Trash2 className="mr-2 h-4 w-4" />
                Reset
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Mining Mode (read-only) */}
          <div className="flex items-center justify-between p-4 rounded-lg border border-border/50 bg-muted/20">
            <div>
              <p className="font-medium">Mining Mode</p>
              <p className="text-sm text-muted-foreground">
                {isSovereignSolo ? 'Sovereign Solo Mining' : isSoloMode ? 'Solo Mining' : 'Pool Mining'}
                {isJdMode && !isSovereignSolo && ' (Job Declaration)'}
              </p>
            </div>
            <Badge variant={isSoloMode ? 'default' : 'secondary'}>
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
                <div className="flex items-center gap-2">
                  <p className="text-sm text-muted-foreground">{templateModeLabel}</p>
                  <Badge variant={isJdMode ? 'default' : 'secondary'}>
                    {isJdMode ? 'JD' : 'No-JD'}
                  </Badge>
                </div>
              }
              editContent={
                <div className="space-y-2">
                  <div className="flex gap-2">
                    {(['no-jd', 'jd'] as const).map(m => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setEditMode(m)}
                        className={`px-4 py-2 rounded-lg border text-sm font-medium transition-all ${
                          editMode === m
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

          {/* Pool — inline-editable when not Sovereign Solo */}
          {!isSovereignSolo && config.pool && (
            <ConfigRow
              label="Pool"
              editing={editing === 'pool'}
              onEdit={startEditPool}
              onSave={saveEdit}
              onCancel={cancelEdit}
              isSaving={isSaving}
              saveDisabled={!isPoolValid}
              disabled={editing !== null && editing !== 'pool'}
              display={
                <>
                  <p className="font-medium text-sm">{config.pool.name}</p>
                  <p className="text-muted-foreground font-mono text-xs">
                    {config.pool.address}:{config.pool.port}
                  </p>
                </>
              }
              editContent={
                <div className="space-y-2">
                  {pools.filter(p => p.badge !== 'coming-soon').map(pool => (
                    <PoolOption
                      key={pool.id}
                      pool={pool}
                      selected={!isCustomPool && editPool?.address === pool.address && editPool?.port === pool.port}
                      onSelect={() => {
                        setIsCustomPool(false);
                        setEditPool({
                          name: pool.name,
                          address: pool.address,
                          port: pool.port,
                          authority_public_key: pool.authority_public_key,
                        });
                      }}
                    />
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      setIsCustomPool(true);
                      setEditPool({ name: 'Custom Pool', address: '', port: 34254, authority_public_key: '' });
                    }}
                    className={`w-full p-3 rounded-lg border transition-all text-left ${
                      isCustomPool
                        ? 'border-primary bg-primary/[0.04]'
                        : 'border-border bg-card hover:border-primary/45'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className={`font-medium text-sm ${isCustomPool ? 'text-primary' : ''}`}>Custom Pool</div>
                        <div className="text-xs text-muted-foreground">Enter your own pool connection details</div>
                      </div>
                      {isCustomPool && (
                        <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                          <Check className="w-3 h-3 text-background" />
                        </div>
                      )}
                    </div>
                  </button>
                  {isCustomPool && (
                    <div className="space-y-3 p-4 rounded-lg border border-border bg-muted/30">
                      <div>
                        <label htmlFor="edit-pool-address" className="block text-xs font-medium mb-1">Pool Address</label>
                        <input
                          id="edit-pool-address"
                          type="text"
                          value={editPool?.address ?? ''}
                          onChange={e => setEditPool(prev => prev ? { ...prev, address: e.target.value } : prev)}
                          placeholder="pool.example.com"
                          className="w-full h-9 px-3 rounded-lg border border-input bg-background text-sm focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/15 outline-none transition-all"
                        />
                      </div>
                      <div>
                        <label htmlFor="edit-pool-port" className="block text-xs font-medium mb-1">Port</label>
                        <input
                          id="edit-pool-port"
                          type="number"
                          value={editPool?.port ?? 34254}
                          onChange={e => setEditPool(prev => prev ? { ...prev, port: parseInt(e.target.value) || 34254 } : prev)}
                          className="w-full h-9 px-3 rounded-lg border border-input bg-background text-sm focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/15 outline-none transition-all"
                        />
                      </div>
                      <div>
                        <label htmlFor="edit-pool-pubkey" className="block text-xs font-medium mb-1">Authority Public Key</label>
                        <input
                          id="edit-pool-pubkey"
                          type="text"
                          value={editPool?.authority_public_key ?? ''}
                          onChange={e => setEditPool(prev => prev ? { ...prev, authority_public_key: stripWrappingQuotes(e.target.value) } : prev)}
                          placeholder="Enter pool's authority public key"
                          className="w-full h-9 px-3 rounded-lg border border-input bg-background font-mono text-sm focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/15 outline-none transition-all"
                        />
                        {getPoolAuthorityPubkeyError(editPool?.authority_public_key ?? '') && (
                          <p className="text-xs text-destructive mt-1">
                            {getPoolAuthorityPubkeyError(editPool?.authority_public_key ?? '')}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              }
            />
          )}

          {/* Username / Identity */}
          {(config.translator?.user_identity || config.jdc?.user_identity) && (() => {
            const identity = config.translator?.user_identity || config.jdc?.user_identity || '';

            if (isSoloMode && (identity.startsWith('sri/solo/') || identity.startsWith('sri/donate'))) {
              let addr = '';
              let worker = '';
              let donation = '';

              if (identity.startsWith('sri/solo/')) {
                const rest = identity.slice('sri/solo/'.length);
                const idx = rest.indexOf('/');
                addr = idx === -1 ? rest : rest.slice(0, idx);
                worker = idx === -1 ? '' : rest.slice(idx + 1);
                donation = '0%';
              } else if (identity === 'sri/donate') {
                donation = '100%';
              } else if (identity.startsWith('sri/donate/')) {
                const rest = identity.slice('sri/donate/'.length);
                const parts = rest.split('/');
                const pct = parseInt(parts[0], 10);
                if (!isNaN(pct) && String(pct) === parts[0] && parts.length >= 2) {
                  donation = `${pct}%`;
                  addr = parts[1];
                  worker = parts.slice(2).join('/');
                } else {
                  donation = '100%';
                  worker = rest;
                }
              }

              return (
                <div className="p-4 rounded-lg border border-border/50 bg-muted/20 space-y-2">
                  {addr && (
                    <div>
                      <p className="font-medium mb-1">Payout Address</p>
                      <p className="font-mono text-sm truncate">{addr}</p>
                    </div>
                  )}
                  {worker && (
                    <div>
                      <p className="font-medium mb-1">Worker Name</p>
                      <p className="font-mono text-sm">{worker}</p>
                    </div>
                  )}
                  <div>
                    <p className="font-medium mb-1">Donation</p>
                    <p className="text-sm">{donation}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">User Identity</p>
                    <p className="font-mono text-xs text-muted-foreground truncate">{identity}</p>
                  </div>
                </div>
              );
            }

            const identityLabel = isSovereignSolo ? 'Miner Identity' : isSoloMode ? 'Bitcoin Address' : 'Pool Username';

            return (
              <ConfigRow
                label={identityLabel}
                editing={editing === 'identity'}
                onEdit={() => startEditIdentity(identity)}
                onSave={saveEdit}
                onCancel={cancelEdit}
                isSaving={isSaving}
                saveDisabled={!isIdentityValid}
                disabled={editing !== null && editing !== 'identity'}
                display={<p className="font-mono text-xs text-muted-foreground truncate">{identity}</p>}
                editContent={
                  <div>
                    <input
                      type="text"
                      value={editIdentity}
                      onChange={(e) => setEditIdentity(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && isIdentityValid && !isSaving) saveEdit();
                        if (e.key === 'Escape') cancelEdit();
                      }}
                      autoFocus
                      autoComplete="off"
                      placeholder={identityLabel}
                      className="w-full h-10 px-3 rounded-lg border border-input bg-background font-mono text-sm focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/15 outline-none transition-all"
                    />
                    {getIdentifierError(editIdentity) && (
                      <p className="text-xs text-destructive mt-1">{getIdentifierError(editIdentity)}</p>
                    )}
                  </div>
                }
              />
            );
          })()}

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
                    {config.jdc.jdc_signature || (isSovereignSolo ? config.jdc.user_identity : 'Not set')}
                  </p>
                  {isSovereignSolo && !config.jdc.jdc_signature && (
                    <p className="text-xs text-muted-foreground">Defaults to miner identity</p>
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
                  {editSignature && getIdentifierError(editSignature) && (
                    <p className="text-xs text-destructive mt-1">{getIdentifierError(editSignature)}</p>
                  )}
                  <p className="text-xs text-muted-foreground mt-2">
                    Miner-chosen tag shown in coinbase transactions on block explorers.
                  </p>
                </div>
              }
            />
          )}

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
                </div>
              }
              editContent={
                editAdvanced && (
                  <div className="space-y-4">
                    <div>
                      <label htmlFor="edit-shares-per-minute" className="block text-xs font-medium mb-1">
                        Shares Per Minute
                      </label>
                      <input
                        id="edit-shares-per-minute"
                        type="number"
                        min="0.1"
                        step="0.1"
                        value={editAdvanced.shares_per_minute}
                        onChange={(e) => setEditAdvanced({ ...editAdvanced, shares_per_minute: e.target.value })}
                        className="w-full h-9 px-3 rounded-lg border border-input bg-background text-sm focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/15 outline-none transition-all"
                      />
                      {!isPositiveNumber(editAdvanced.shares_per_minute) && (
                        <p className="text-xs text-destructive mt-1">Enter a value greater than 0.</p>
                      )}
                    </div>

                    <div>
                      <label htmlFor="edit-downstream-extranonce2-size" className="block text-xs font-medium mb-1">
                        Downstream Extranonce2 Size
                      </label>
                      <input
                        id="edit-downstream-extranonce2-size"
                        type="number"
                        min="1"
                        step="1"
                        value={editAdvanced.downstream_extranonce2_size}
                        onChange={(e) => setEditAdvanced({ ...editAdvanced, downstream_extranonce2_size: e.target.value })}
                        className="w-full h-9 px-3 rounded-lg border border-input bg-background text-sm focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/15 outline-none transition-all"
                      />
                      {!isPositiveInteger(editAdvanced.downstream_extranonce2_size) && (
                        <p className="text-xs text-destructive mt-1">Enter a whole number greater than 0.</p>
                      )}
                    </div>
                  </div>
                )
              }
            />
          )}

          {/* Bitcoin Core (JD mode) */}
          {isJdMode && config.bitcoin && (
            <div className="p-4 rounded-lg border border-border/50 bg-muted/20 space-y-2">
              <div className="flex items-center gap-2">
                <p className="font-medium">Bitcoin Core</p>
                <Badge variant="outline" className="text-xs">{config.bitcoin.core_version ?? 'Not selected'}</Badge>
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
        <div className="flex gap-2">
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
      <div className="flex items-start justify-between">
        <div className="space-y-1">
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
              : 'p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors opacity-0 group-hover:opacity-100'
          }
          title={disabled ? 'Finish your current edit to change this' : `Edit ${label.toLowerCase()}`}
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

/**
 * Pool selection option for inline editing.
 */
function PoolOption({
  pool,
  selected,
  onSelect,
}: {
  pool: KnownPool;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full p-3 rounded-lg border transition-all text-left flex items-center gap-3 ${
        selected
          ? 'border-primary bg-primary/[0.04]'
          : 'border-border bg-card hover:border-primary/45'
      }`}
    >
      <PoolIcon logoUrl={pool.logoUrl} logoOnDark={pool.logoOnDark} name={pool.name} />
      <div className="flex-1 min-w-0">
        <div className={`font-medium text-sm ${selected ? 'text-primary' : ''}`}>{pool.name}</div>
        <div className="text-xs text-muted-foreground font-mono">{pool.address}:{pool.port}</div>
      </div>
      {selected && (
        <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
          <Check className="w-3 h-3 text-background" />
        </div>
      )}
    </button>
  );
}
