import { useState, useEffect, useRef } from 'react';
import { useLocation } from 'wouter';
import { Shell } from '@/components/layout/Shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePoolData, useTranslatorHealth, useJdcHealth, getEndpointConfig } from '@/hooks/usePoolData';
import { formatUptime } from '@/lib/utils';
import type { AppMode } from '@/types/api';
import {
  Network,
  Server,
  Activity,
  ExternalLink,
  Info,
  Copy,
  RefreshCw,
} from 'lucide-react';
import { useUiConfig } from '@/hooks/useUiConfig';
import { JdcTabs } from '@/components/settings/JdcConfigTabs';
import { TproxyTabs } from '@/components/settings/TproxyConfigTabs';
import { AppearanceTab } from '@/components/settings/AppearanceTab';
import { ServiceStatusCard } from '@/components/settings/ServiceStatusCard';

interface SettingsProps {
  appMode?: AppMode;
}

/**
 * Settings page with tabbed interface.
 * Shows connection status, service config editors, and API info.
 */
export function Settings({ appMode = 'translator' }: SettingsProps) {
  const { modeLabel, isJdMode, global: poolGlobal, isLoading } = usePoolData();
  const endpoints = getEndpointConfig();
  const { config, updateConfig, resetConfig } = useUiConfig();
  const [, navigate] = useLocation();
  const [wizardData, setWizardData] = useState<Record<string, unknown> | null>(null);
  const deployedTproxy = wizardData ? wizardData.skipped_translator_proxy_configuration !== true : true;
  const deployedJdc = wizardData?.constructTemplates === true;

  const { data: translatorOk, isLoading: translatorLoading } = useTranslatorHealth(deployedTproxy);
  const { data: jdcOk, isLoading: jdcLoading } = useJdcHealth(deployedJdc);

  // Show "Settings saved" indicator for 2s after any config change
  const [showSaved, setShowSaved] = useState(false);
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    setShowSaved(true);
    const t = setTimeout(() => setShowSaved(false), 2000);
    return () => clearTimeout(t);
  }, [config]);

  useEffect(() => {
    fetch('/api/wizard-data')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (data) setWizardData(data); })
      .catch(() => {});
  }, []);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <Shell appMode={appMode}>
      <div className="max-w-5xl mx-auto space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Configuration</h2>
            <p className="text-muted-foreground">
              View connection status, edit service configs, and explore the API.
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <Button variant="outline" onClick={() => window.location.reload()}>
              Refresh Status
            </Button>
          </div>
        </div>

        <Tabs defaultValue="status" className="space-y-6">
          <TabsList className="grid w-full grid-cols-5 lg:w-[650px]">
            <TabsTrigger value="status">Status</TabsTrigger>
            <TabsTrigger value="jdc">JD-Client</TabsTrigger>
            <TabsTrigger value="tproxy">tProxy</TabsTrigger>
            <TabsTrigger value="api">API Docs</TabsTrigger>
            <TabsTrigger value="appearance">Appearance</TabsTrigger>
          </TabsList>

          {/* Status Tab */}
          <TabsContent value="status">
            <div className="space-y-6 animate-in slide-in-from-left-2 duration-300">
              {/* Connection Status Card */}
              <Card className="glass-card border-none shadow-md bg-card/40">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Network className="h-5 w-5 text-primary" /> Connection Status
                  </CardTitle>
                  <CardDescription>Current state of backend services.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4">
                    {deployedTproxy && (
                      <ServiceStatusCard
                        name="Translator Proxy"
                        address={endpoints.translator.base}
                        isLoading={translatorLoading}
                        isOk={translatorOk}
                      />
                    )}
                    {deployedJdc && (
                      <ServiceStatusCard
                        name="JD Client"
                        address={endpoints.jdc.base}
                        isLoading={jdcLoading}
                        isOk={jdcOk}
                        notRunningLabel="Not running"
                      />
                    )}
                  </div>

                  {/* Mode Info */}
                  <div className="pt-4 border-t border-border/40">
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Active Mode</span>
                      <span className="font-medium">
                        {isLoading ? 'Detecting...' : modeLabel}
                        {isJdMode && ' (Job Declaration)'}
                      </span>
                    </div>
                    {poolGlobal && (
                      <div className="flex justify-between items-center mt-2">
                        <span className="text-muted-foreground">Uptime</span>
                        <span className="font-mono">{formatUptime(poolGlobal.uptime_secs)}</span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* System Info Card */}
              <Card className="glass-card border-none shadow-md bg-card/40">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Info className="h-5 w-5 text-primary" /> System Information
                  </CardTitle>
                  <CardDescription>About this UI instance.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-3">
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">UI Version</span>
                      <span className="font-mono">0.1.0</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Protocol</span>
                      <span className="font-mono">Stratum V2</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Data Source</span>
                      <span className="font-mono">{modeLabel}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Setup Wizard Card */}
              <Card className="glass-card border-none shadow-md bg-card/40">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <RefreshCw className="h-5 w-5 text-primary" /> Setup Wizard
                  </CardTitle>
                  <CardDescription>
                    Rerun the setup wizard to change your deployment configuration.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {wizardData && (
                    <div className="grid gap-3 pb-4 border-b border-border/40">
                      {!!wizardData.selectedPool && (
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground">Pool</span>
                          <span className="font-mono">{String(wizardData.selectedPool)}</span>
                        </div>
                      )}
                      {!!wizardData.selectedNetwork && (
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground">Network</span>
                          <span className="font-mono">{String(wizardData.selectedNetwork)}</span>
                        </div>
                      )}
                      {wizardData.constructTemplates !== undefined && (
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground">Mode</span>
                          <span className="font-mono">
                            {wizardData.constructTemplates ? 'Job Declaration (Custom Templates)' : 'Pool Templates'}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                  <Button
                    onClick={() => navigate('/setup')}
                    className="gap-2 bg-primary text-primary-foreground hover:bg-primary/80"
                  >
                    <RefreshCw className="h-4 w-4" />
                    Rerun Wizard
                  </Button>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* JD-Client Tab */}
          <TabsContent value="jdc">
            <div className="space-y-4 animate-in slide-in-from-right-2 duration-300">
              <JdcTabs />
            </div>
          </TabsContent>

          {/* tProxy Tab */}
          <TabsContent value="tproxy">
            <div className="space-y-4 animate-in slide-in-from-right-2 duration-300">
              <TproxyTabs />
            </div>
          </TabsContent>

          {/* API Docs Tab */}
          <TabsContent value="api">
            <div className="space-y-6 animate-in slide-in-from-bottom-2 duration-300">
              {/* Endpoint Configuration */}
              <Card className="glass-card border-none shadow-md bg-card/40">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Server className="h-5 w-5 text-primary" /> Endpoint Configuration
                  </CardTitle>
                  <CardDescription>
                    Configure API endpoints via URL parameters or environment variables.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label>JD Client URL</Label>
                      <div className="flex gap-2">
                        <Input
                          value={endpoints.jdc.base}
                          readOnly
                          className="font-mono text-sm bg-background/50 border-border/50"
                        />
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => copyToClipboard(endpoints.jdc.base)}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Set via <code className="text-primary">?jdc_url=</code> or <code className="text-primary">VITE_JDC_URL</code>
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label>Translator URL</Label>
                      <div className="flex gap-2">
                        <Input
                          value={endpoints.translator.base}
                          readOnly
                          className="font-mono text-sm bg-background/50 border-border/50"
                        />
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => copyToClipboard(endpoints.translator.base)}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Set via <code className="text-primary">?translator_url=</code> or <code className="text-primary">VITE_TRANSLATOR_URL</code>
                      </p>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-border/40">
                    <h4 className="text-sm font-medium mb-3">Configuration Priority</h4>
                    <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                      <li>URL parameters (highest priority)</li>
                      <li>Environment variables (<code className="text-primary">VITE_*</code>)</li>
                      <li>Default localhost values</li>
                    </ol>
                  </div>
                </CardContent>
              </Card>

              <Card className="glass-card border-none shadow-md bg-card/40">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Activity className="h-5 w-5 text-primary" /> Monitoring API
                  </CardTitle>
                  <CardDescription>
                    Available REST endpoints for monitoring data.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="text-sm font-mono space-y-2">
                      <EndpointRow method="GET" path="/api/v1/health" description="Health check" />
                      <EndpointRow method="GET" path="/api/v1/global" description="Global statistics (hashrate, uptime)" />
                      <EndpointRow method="GET" path="/api/v1/server" description="Upstream server info" />
                      <EndpointRow method="GET" path="/api/v1/server/channels" description="Upstream channel details" />
                    </div>

                    <div className="pt-4 border-t border-border/40">
                      <h4 className="text-sm font-medium mb-2">Translator-specific endpoints</h4>
                      <div className="text-sm font-mono space-y-2">
                        <EndpointRow method="GET" path="/api/v1/sv1/clients" description="List SV1 clients" />
                        <EndpointRow method="GET" path="/api/v1/sv1/clients/{id}" description="SV1 client details" />
                      </div>
                    </div>

                    <div className="pt-4 border-t border-border/40">
                      <h4 className="text-sm font-medium mb-2">JDC-specific endpoints</h4>
                      <div className="text-sm font-mono space-y-2">
                        <EndpointRow method="GET" path="/api/v1/clients" description="List SV2 clients" />
                        <EndpointRow method="GET" path="/api/v1/clients/{id}" description="SV2 client details" />
                        <EndpointRow method="GET" path="/api/v1/clients/{id}/channels" description="Client channel details" />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="glass-card border-none shadow-md bg-card/40">
                <CardHeader>
                  <CardTitle>Interactive Documentation</CardTitle>
                  <CardDescription>Access Swagger UI for full API exploration.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Each service exposes interactive API documentation at <code className="text-primary">/swagger-ui</code>.
                  </p>
                  <div className="flex flex-wrap gap-3">
                    {translatorOk && (
                      <Button variant="outline" asChild>
                        <a
                          href={`${endpoints.translator.base.replace('/api/v1', '')}/swagger-ui`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="gap-2"
                        >
                          <ExternalLink className="h-4 w-4" />
                          Translator Swagger UI
                        </a>
                      </Button>
                    )}
                    {jdcOk && (
                      <Button variant="outline" asChild>
                        <a
                          href={`${endpoints.jdc.base.replace('/api/v1', '')}/swagger-ui`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="gap-2"
                        >
                          <ExternalLink className="h-4 w-4" />
                          JDC Swagger UI
                        </a>
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card className="glass-card border-none shadow-md bg-card/40">
                <CardHeader>
                  <CardTitle>Prometheus Metrics</CardTitle>
                  <CardDescription>Metrics endpoint for monitoring integration.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Prometheus-compatible metrics are available at <code className="text-primary">/metrics</code>.
                  </p>
                  <div className="flex flex-wrap gap-3">
                    {translatorOk && (
                      <Button variant="outline" asChild>
                        <a
                          href={`${endpoints.translator.base.replace('/api/v1', '')}/metrics`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="gap-2"
                        >
                          <ExternalLink className="h-4 w-4" />
                          Translator Metrics
                        </a>
                      </Button>
                    )}
                    {jdcOk && (
                      <Button variant="outline" asChild>
                        <a
                          href={`${endpoints.jdc.base.replace('/api/v1', '')}/metrics`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="gap-2"
                        >
                          <ExternalLink className="h-4 w-4" />
                          JDC Metrics
                        </a>
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Appearance Tab */}
          <TabsContent value="appearance">
            <AppearanceTab
              primaryColor={config.primaryColor}
              customLogoDataUrl={config.customLogoDataUrl}
              showSaved={showSaved}
              onColorChange={(hsl) => updateConfig({ primaryColor: hsl })}
              onLogoChange={(dataUrl) => updateConfig({ customLogoDataUrl: dataUrl })}
              onReset={resetConfig}
            />
          </TabsContent>
        </Tabs>
      </div>
    </Shell>
  );
}

function EndpointRow({ method, path, description }: { method: string; path: string; description: string }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-border/30 last:border-0">
      <div className="flex items-center gap-3">
        <span className="text-xs font-bold text-green-500 w-10">{method}</span>
        <code className="text-primary">{path}</code>
      </div>
      <span className="text-muted-foreground text-xs">{description}</span>
    </div>
  );
}
