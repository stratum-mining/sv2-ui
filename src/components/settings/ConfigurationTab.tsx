import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useSetupStatus } from '@/hooks/useSetupStatus';
import { useControlApi, getCurrentConfig } from '@/hooks/useControlApi';
import type { SetupData } from '@/components/setup/types';
import { 
  Settings2, 
  Cpu,
  Zap,
  Server, 
  Bitcoin,
  Loader2,
  AlertCircle,
  RotateCw,
  StopCircle,
  Trash2,
} from 'lucide-react';

/**
 * Configuration tab for Settings page.
 * Shows current setup and allows reconfiguration.
 */
export function ConfigurationTab() {
  const [, navigate] = useLocation();
  const [config, setConfig] = useState<SetupData | null>(null);
  const [loading, setLoading] = useState(true);
  const { isOrchestrated, isConfigured, isRunning, miningMode, mode } = useSetupStatus();
  const { stop, restart, isStoppingOrRestarting, stopError, restartError } = useControlApi();

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
            <div className="flex gap-3">
              <Settings2 className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5" />
              <div className="text-sm text-muted-foreground">
                <p className="font-medium text-foreground mb-1">Standalone Mode</p>
                <p>
                  This UI is running in monitoring-only mode. Configuration management is not available.
                  Services should be configured and started manually.
                </p>
              </div>
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
                    No configuration found. Run the setup wizard to configure your mining stack.
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

  const getPoolIconUrl = (poolName: string): string | null => {
    if (poolName.includes('Braiins')) return '/braiins.svg';
    if (poolName.includes('SRI')) return '/favicon.png';
    if (poolName.includes('Blitzpool')) return '/blitzpool.svg';
    return null;
  };

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
                  {isSoloMode ? 'Solo Mining' : 'Pool Mining'}
                  {isJdMode && ' (Job Declaration)'}
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
              <CardTitle className="flex items-center gap-2">
                <Settings2 className="h-5 w-5 text-primary" />
                Current Configuration
              </CardTitle>
              <CardDescription>Your active mining stack setup</CardDescription>
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
          <div className="flex items-center justify-between p-4 rounded-lg border border-border/50 bg-muted/20">
            <div className="flex items-center gap-3">
              {isSoloMode ? (
                <Cpu className="h-5 w-5 text-orange-500" />
              ) : (
                <Zap className="h-5 w-5 text-blue-500" />
              )}
              <div>
                <p className="font-medium">Mining Mode</p>
                <p className="text-sm text-muted-foreground">
                  {isSoloMode ? 'Solo Mining' : 'Pool Mining'}
                  {isJdMode && ' (Job Declaration)'}
                </p>
              </div>
            </div>
            <Badge variant={isSoloMode ? 'default' : 'secondary'}>
              {isSoloMode ? 'Solo' : 'Pool'}
            </Badge>
          </div>

          {/* Pool */}
          {config.pool && (
            <div className="p-4 rounded-lg border border-border/50 bg-muted/20 space-y-2">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-muted/50 overflow-hidden">
                  {getPoolIconUrl(config.pool.name) ? (
                    <img
                      src={getPoolIconUrl(config.pool.name)!}
                      alt={`${config.pool.name} logo`}
                      className="w-8 h-8 object-contain"
                    />
                  ) : (
                    <Server className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium">{config.pool.name}</p>
                  <p className="text-muted-foreground font-mono text-xs">
                    {config.pool.address}:{config.pool.port}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Username */}
          {(config.translator?.user_identity || config.jdc?.user_identity) && (
            <div className="p-4 rounded-lg border border-border/50 bg-muted/20 space-y-2">
              <div className="flex items-center gap-2">
                <p className="font-medium">{isSoloMode ? 'Bitcoin Address' : 'Pool Username'}</p>
              </div>
              <p className="font-mono text-sm truncate">
                {config.translator?.user_identity || config.jdc?.user_identity}
              </p>
            </div>
          )}

          {/* Bitcoin Core (JD mode) */}
          {isJdMode && config.bitcoin && (
            <div className="p-4 rounded-lg border border-border/50 bg-muted/20 space-y-2">
              <div className="flex items-center gap-2">
                <Bitcoin className="h-4 w-4 text-orange-500" />
                <p className="font-medium">Bitcoin Core</p>
              </div>
              <div className="text-sm space-y-1">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">{config.bitcoin.network}</Badge>
                </div>
                <p className="text-muted-foreground font-mono text-xs truncate">
                  {config.bitcoin.socket_path}
                </p>
              </div>
            </div>
          )}

          {/* Fallback Address (JD mode) */}
          {isJdMode && config.jdc?.coinbase_reward_address && (
            <div className="p-4 rounded-lg border border-border/50 bg-muted/20 space-y-2">
              <p className="font-medium">Fallback Address</p>
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
