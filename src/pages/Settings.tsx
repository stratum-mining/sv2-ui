import { useRef, useState, useEffect } from 'react';
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
  CheckCircle2,
  XCircle,
  Info,
  Copy,
  Upload,
  RotateCcw,
} from 'lucide-react';
import { useUiConfig } from '@/hooks/useUiConfig';

interface SettingsProps {
  appMode?: AppMode;
}

/**
 * Settings page with tabbed interface.
 * Shows connection status, endpoint configuration, and API info.
 */
export function Settings({ appMode = 'translator' }: SettingsProps) {
  const { modeLabel, isJdMode, global: poolGlobal, isLoading } = usePoolData();
  const { data: translatorOk, isLoading: translatorLoading } = useTranslatorHealth();
  const { data: jdcOk, isLoading: jdcLoading } = useJdcHealth();
  const endpoints = getEndpointConfig();
  const translatorBase = endpoints.translator.base.replace('/api/v1', '');
  const jdcBase = endpoints.jdc.base.replace('/api/v1', '');
  const { config, updateConfig, resetConfig } = useUiConfig();
  const logoInputRef = useRef<HTMLInputElement>(null);

  // Show "Settings saved" indicator for 2s after any config change
  const [showSaved, setShowSaved] = useState(false);
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    setShowSaved(true);
    const t = setTimeout(() => setShowSaved(false), 2000);
    return () => clearTimeout(t);
  }, [config]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      updateConfig({ customLogoDataUrl: dataUrl });
    };
    reader.onerror = () => {
      console.error('Failed to read logo file');
    };
    reader.readAsDataURL(file);
    // Reset input so the same file can be re-selected if needed
    e.target.value = '';
  };

  // Compute once per render so the color picker value and hex display stay in sync
  const primaryHex = hslToHex(config.primaryColor);

  return (
    <Shell appMode={appMode}>
      <div className="max-w-5xl mx-auto space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Configuration</h2>
            <p className="text-muted-foreground">
              View connection status, endpoints, and API documentation.
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <Button variant="outline" onClick={() => window.location.reload()}>
              Refresh Status
            </Button>
          </div>
        </div>

        <Tabs defaultValue="status" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4 lg:w-[520px]">
            <TabsTrigger value="status">Status</TabsTrigger>
            <TabsTrigger value="endpoints">Endpoints</TabsTrigger>
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
                    {/* Translator Status */}
                    <div className="flex items-center justify-between p-4 rounded-lg border border-border/50 bg-muted/20">
                      <div className="flex items-center gap-3">
                        <div className={`h-3 w-3 rounded-full ${
                          translatorLoading ? 'bg-yellow-500 animate-pulse' :
                          translatorOk ? 'bg-green-500' : 'bg-red-500'
                        }`} />
                        <div>
                          <p className="font-medium">Translator Proxy</p>
                          <p className="text-xs text-muted-foreground font-mono">
                            {endpoints.translator.base}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {translatorLoading ? (
                          <span className="text-xs text-muted-foreground">Checking...</span>
                        ) : translatorOk ? (
                          <CheckCircle2 className="h-5 w-5 text-green-500" />
                        ) : (
                          <XCircle className="h-5 w-5 text-red-500" />
                        )}
                      </div>
                    </div>

                    {/* JDC Status */}
                    <div className="flex items-center justify-between p-4 rounded-lg border border-border/50 bg-muted/20">
                      <div className="flex items-center gap-3">
                        <div className={`h-3 w-3 rounded-full ${
                          jdcLoading ? 'bg-yellow-500 animate-pulse' :
                          jdcOk ? 'bg-green-500' : 'bg-neutral-400'
                        }`} />
                        <div>
                          <p className="font-medium">JD Client</p>
                          <p className="text-xs text-muted-foreground font-mono">
                            {endpoints.jdc.base}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {jdcLoading ? (
                          <span className="text-xs text-muted-foreground">Checking...</span>
                        ) : jdcOk ? (
                          <CheckCircle2 className="h-5 w-5 text-green-500" />
                        ) : (
                          <span className="text-xs text-muted-foreground">Not running</span>
                        )}
                      </div>
                    </div>
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
            </div>
          </TabsContent>

          {/* Endpoints Tab */}
          <TabsContent value="endpoints">
            <div className="space-y-6 animate-in slide-in-from-right-2 duration-300">
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
                  <CardTitle>Example URLs</CardTitle>
                  <CardDescription>How to configure endpoints via URL parameters.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Local Development (JD mode)</Label>
                    <code className="block p-3 rounded-md bg-muted/50 text-xs font-mono break-all">
                      http://localhost:5173/?jdc_url=http://localhost:9091&translator_url=http://localhost:9092
                    </code>
                  </div>
                  <div className="space-y-2">
                    <Label>Remote Server</Label>
                    <code className="block p-3 rounded-md bg-muted/50 text-xs font-mono break-all">
                      https://ui.example.com/?jdc_url=http://192.168.1.100:9091&translator_url=http://192.168.1.100:9092
                    </code>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* API Docs Tab */}
          <TabsContent value="api">
            <div className="space-y-6 animate-in slide-in-from-bottom-2 duration-300">
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
                    {translatorOk && <ServiceLinkButton href={`${translatorBase}/swagger-ui`} label="Translator Swagger UI" />}
                    {jdcOk && <ServiceLinkButton href={`${jdcBase}/swagger-ui`} label="JDC Swagger UI" />}
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
                    {translatorOk && <ServiceLinkButton href={`${translatorBase}/metrics`} label="Translator Metrics" />}
                    {jdcOk && <ServiceLinkButton href={`${jdcBase}/metrics`} label="JDC Metrics" />}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Appearance Tab */}
          <TabsContent value="appearance">
            <div className="space-y-6 animate-in slide-in-from-bottom-2 duration-300">
              <Card className="glass-card border-none shadow-md bg-card/40">
                <CardHeader>
                  <CardTitle>Branding</CardTitle>
                  <CardDescription>
                    Customize the logo and primary accent color.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-8">

                  {/* Logo upload */}
                  <div className="space-y-3">
                    <Label>Logo</Label>
                    <div className="flex items-center gap-4">
                      {/* Preview */}
                      <div className="flex items-center justify-center w-36 h-10 rounded-md border border-border bg-sidebar px-3">
                        {config.customLogoDataUrl ? (
                          <img
                            src={config.customLogoDataUrl}
                            alt="Custom logo preview"
                            className="h-6 w-auto max-w-full object-contain"
                          />
                        ) : (
                          <img
                            src="/sv2-logo-240x40.png"
                            alt="Default logo"
                            className="h-[18px] w-auto object-contain opacity-60"
                          />
                        )}
                      </div>
                      <input
                        ref={logoInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleLogoUpload}
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => logoInputRef.current?.click()}
                      >
                        <Upload className="mr-2 h-4 w-4" />
                        Upload logo
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      SVG, PNG, or JPG. Displayed in the sidebar header.
                    </p>
                  </div>

                  {/* Primary color */}
                  <div className="space-y-3">
                    <Label htmlFor="primary-color">Primary color</Label>
                    <div className="flex items-center gap-4">
                      <input
                        id="primary-color"
                        type="color"
                        value={primaryHex}
                        onChange={(e) => updateConfig({ primaryColor: hexToHslTriplet(e.target.value) })}
                        className="w-10 h-10 rounded-md border border-border cursor-pointer p-0.5 bg-transparent"
                      />
                      <span className="text-sm text-muted-foreground font-mono">
                        {primaryHex}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Changes the accent color used throughout the interface — buttons, links, active nav, and charts.
                    </p>
                  </div>

                  {/* Actions row */}
                  <div className="flex items-center gap-4 pt-2 border-t border-border/40">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={resetConfig}
                    >
                      <RotateCcw className="mr-2 h-3.5 w-3.5" />
                      Reset to defaults
                    </Button>
                    <span
                      className={`flex items-center gap-1.5 text-sm text-green-600 dark:text-green-400 transition-opacity duration-300 ${showSaved ? 'opacity-100' : 'opacity-0'}`}
                      aria-live="polite"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      Settings saved
                    </span>
                  </div>

                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </Shell>
  );
}

// Utility helpers for converting between hex and the HSL triplet string used in CSS variables.
function hexToHslTriplet(hex: string): string {
  const cleaned = hex.replace('#', '');
  const bigint = parseInt(cleaned.length === 3
    ? cleaned.split('').map((c) => c + c).join('')
    : cleaned, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;

  const rNorm = r / 255;
  const gNorm = g / 255;
  const bNorm = b / 255;

  const max = Math.max(rNorm, gNorm, bNorm);
  const min = Math.min(rNorm, gNorm, bNorm);
  const delta = max - min;

  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (delta !== 0) {
    s = delta / (1 - Math.abs(2 * l - 1));
    switch (max) {
      case rNorm:
        h = 60 * (((gNorm - bNorm) / delta) % 6);
        break;
      case gNorm:
        h = 60 * ((bNorm - rNorm) / delta + 2);
        break;
      default:
        h = 60 * ((rNorm - gNorm) / delta + 4);
    }
  }

  if (h < 0) h += 360;

  const hRound = Math.round(h);
  const sRound = Math.round(s * 100);
  const lRound = Math.round(l * 100);

  return `${hRound} ${sRound}% ${lRound}%`;
}

function hslToHex(hslTriplet: string): string {
  // Expect format "H S% L%"
  const [hStr, sStr, lStr] = hslTriplet.split(' ');
  const h = parseFloat(hStr);
  const s = parseFloat(sStr.replace('%', '')) / 100;
  const l = parseFloat(lStr.replace('%', '')) / 100;

  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;

  let rPrime = 0;
  let gPrime = 0;
  let bPrime = 0;

  if (h >= 0 && h < 60) {
    rPrime = c; gPrime = x; bPrime = 0;
  } else if (h >= 60 && h < 120) {
    rPrime = x; gPrime = c; bPrime = 0;
  } else if (h >= 120 && h < 180) {
    rPrime = 0; gPrime = c; bPrime = x;
  } else if (h >= 180 && h < 240) {
    rPrime = 0; gPrime = x; bPrime = c;
  } else if (h >= 240 && h < 300) {
    rPrime = x; gPrime = 0; bPrime = c;
  } else {
    rPrime = c; gPrime = 0; bPrime = x;
  }

  const r = Math.round((rPrime + m) * 255);
  const g = Math.round((gPrime + m) * 255);
  const b = Math.round((bPrime + m) * 255);

  const toHex = (v: number) => v.toString(16).padStart(2, '0');

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
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

function ServiceLinkButton({ href, label }: { href: string; label: string }) {
  return (
    <Button variant="outline" asChild>
      <a href={href} target="_blank" rel="noopener noreferrer" className="gap-2">
        <ExternalLink className="h-4 w-4" />
        {label}
      </a>
    </Button>
  );
}
