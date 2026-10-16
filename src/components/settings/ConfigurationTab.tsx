import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { ConnectionAlert } from '@/components/ui/connection-alert';
import { useSetupStatus } from '@/hooks/useSetupStatus';
import { useControlApi, getCurrentConfig } from '@/hooks/useControlApi';
import { clearDashboardClientState } from '@/lib/dashboardState';
import { isBitcoinSocketError } from '@/lib/bitcoinSocketErrors';
import type { SetupData } from '@/components/setup/types';
import {
  Loader2,
  AlertCircle,
  RotateCw,
  StopCircle,
  Trash2,
  Check,
} from 'lucide-react';
import { StatusDot } from '@/components/ui/status-dot';
import { ConfigurationEditor } from './ConfigurationEditor';
const SETUP_TARGET_STEP_STORAGE_KEY = 'sv2-ui-setup-target-step';

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
    isDegraded,
    translatorFailing,
    miningMode: statusMiningMode,
    mode: statusMode,
    activePoolIndex,
    dockerError,
    isBackendError,
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

  const saveConfig = (updated: SetupData) => new Promise<boolean>((resolve) => {
    setup(updated, {
      onSuccess: async (response) => {
        if (!response.success) return resolve(false);

        await queryClient.invalidateQueries({ queryKey: ['setup-status'] });
        const refreshedConfig = await getCurrentConfig();
        setConfig(refreshedConfig ?? updated);
        setSaveSuccess(true);
        resolve(true);
      },
      onError: () => resolve(false),
    });
  });

  if (!isOrchestrated) {
    return (
      <div className="space-y-6 animate-in slide-in-from-left-2 duration-300">
        {isBackendError && (
          <ConnectionAlert isOrchestrated={isOrchestrated} className="mb-6" />
        )}
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

  if (!isConfigured) {
    return (
      <div className="space-y-6 animate-in slide-in-from-left-2 duration-300">
        {isBackendError && (
          <ConnectionAlert isOrchestrated={isOrchestrated} className="mb-6" />
        )}
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

  return (
    <div className="space-y-6 animate-in slide-in-from-left-2 duration-300">
      {isBackendError && (
        <ConnectionAlert isOrchestrated={isOrchestrated} className="mb-6" />
      )}
      {/* Status Banner */}
      <Card className={isRunning ? 'border-green-500/30 bg-green-500/5' : isDegraded ? 'border-amber-500/30 bg-amber-500/5' : 'border-muted'}>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <StatusDot status={isRunning ? 'connected' : isDegraded ? 'degraded' : 'idle'} size="lg" />
              <div className="min-w-0">
                <p className="font-medium">{isRunning ? 'Services Running' : isDegraded ? (translatorFailing ? 'Translator Keeps Stopping' : 'Translator Restarting') : 'Services Stopped'}</p>
                <p className="text-sm text-muted-foreground">
                  {isSovereignSolo ? 'Sovereign Solo Mining' : isSoloMode ? 'Solo Mining' : 'Pool Mining'}
                  {isJdMode && !isSovereignSolo && ' (Job Declaration)'}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 sm:flex-nowrap sm:justify-end">
              {isRunning || isDegraded ? (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRestart}
                    disabled={isStoppingOrRestarting || isBackendError}
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
                    disabled={isStoppingOrRestarting || isBackendError}
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
                  disabled={isStoppingOrRestarting || !!dockerError || isBackendError}
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

      {/* Docker Error Alert */}
      {dockerError && (
        <Alert variant="destructive">
          <p>{dockerError}</p>
        </Alert>
      )}

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
          <ConfigurationEditor
            config={config}
            onSave={saveConfig}
            onSetupRequired={() => navigate('/setup')}
            isSaving={isSettingUp}
            saveLabel="Save & Restart"
            fallbackMiningMode={statusMiningMode}
            fallbackMode={statusMode}
            activePoolIndex={isRunning || isDegraded ? activePoolIndex : null}
          />
        </CardContent>
      </Card>
    </div>
  );
}
