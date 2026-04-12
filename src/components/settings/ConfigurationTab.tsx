import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useSetupStatus } from '@/hooks/useSetupStatus';
import { useControlApi, getCurrentConfig } from '@/hooks/useControlApi';
import type { SetupData } from '@/components/setup/types';
import {
  Loader2,
  AlertCircle,
  RotateCw,
  StopCircle,
  Trash2,
} from 'lucide-react';

function clearPersistedDashboardState() {
  if (typeof window === 'undefined') return;

  const prefixes = [
    'sv2_hashrate_history:',
    'sv2_blocks_found:',
    'sv2_best_diff:',
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

/**
 * Configuration tab for Settings page.
 * Shows current setup and allows reconfiguration.
 */
export function ConfigurationTab() {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const [config, setConfig] = useState<SetupData | null>(null);
  const [loading, setLoading] = useState(true);
  const { isOrchestrated, isConfigured, isRunning, miningMode, mode } = useSetupStatus();
  const { stop, restart, isStoppingOrRestarting, stopError, restartError } = useControlApi();

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
      getCurrentConfig().then(config => {
        setConfig(config);
        setLoading(false);
      });
    } else {
      setLoading(false);
    }
  }, [isOrchestrated, isConfigured]);

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

  const isJdMode = mode === 'jd';
  const isSoloMode = miningMode === 'solo';
  const isSovereignSolo = isSoloMode && isJdMode;
  const templateModeLabel = isSoloMode
    ? isJdMode
      ? 'Sovereign Solo Mining'
      : 'Solo Pool Templates'
    : isJdMode
      ? 'Custom Templates (Job Declaration)'
      : 'Pool Templates';

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
      {(stopError || restartError) && (
        <Card className="border-red-500/30 bg-red-500/5">
          <CardContent className="pt-6">
            <div className="flex gap-3">
              <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0" />
              <p className="text-sm text-red-500">
                {stopError?.message || restartError?.message || 'Operation failed'}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Current Configuration */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Current Configuration</CardTitle>
              <CardDescription>Your active mining client setup</CardDescription>
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
          {/* Mining Mode */}
          <div className="flex items-center justify-between p-4 rounded-lg border border-border/60 bg-muted/40">
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

          <div className="p-4 rounded-lg border border-border/60 bg-muted/40">
            <p className="font-medium mb-1">Block Templates</p>
            <p className="text-sm text-muted-foreground">{templateModeLabel}</p>
          </div>

          {/* Pool */}
          {!isSovereignSolo && config.pool && (
            <div className="p-4 rounded-lg border border-border/60 bg-muted/40">
              <p className="font-medium">{config.pool.name}</p>
              <p className="text-muted-foreground font-mono text-xs">
                {config.pool.address}:{config.pool.port}
              </p>
            </div>
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
                <div className="p-4 rounded-lg border border-border/60 bg-muted/40 space-y-2">
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

            return (
              <div className="p-4 rounded-lg border border-border/60 bg-muted/40">
                <p className="font-medium mb-1">
                  {isSovereignSolo ? 'Miner Identity' : isSoloMode ? 'Bitcoin Address' : 'Pool Username'}
                </p>
                <p className="font-mono text-sm truncate">{identity}</p>
              </div>
            );
          })()}

          {/* Bitcoin Core (JD mode) */}
          {isJdMode && config.bitcoin && (
            <div className="p-4 rounded-lg border border-border/60 bg-muted/40 space-y-2">
              <div className="flex items-center gap-2">
                <p className="font-medium">Bitcoin Core</p>
                <Badge variant="outline" className="text-xs">{config.bitcoin.network}</Badge>
              </div>
              <p className="text-muted-foreground font-mono text-xs truncate">
                {config.bitcoin.socket_path}
              </p>
            </div>
          )}

          {/* Fallback Address (JD mode) */}
          {isJdMode && config.jdc?.coinbase_reward_address && (
            <div className="p-4 rounded-lg border border-border/60 bg-muted/40">
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
