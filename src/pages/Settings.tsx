import { useRef, useState, useEffect } from 'react';
import { Shell } from '@/components/layout/Shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { useUiConfig } from '@/hooks/useUiConfig';
import { useConnectionStatus } from '@/hooks/useConnectionStatus';
import {
  CheckCircle2,
  RotateCcw,
  Upload,
} from 'lucide-react';
import { ConfigurationTab } from '@/components/settings/ConfigurationTab';

/**
 * Settings page with Configuration and Appearance tabs.
 */
export function Settings() {
  const { config, updateConfig, resetConfig } = useUiConfig();
  const { status: connectionStatus, statusLabel: connectionLabel, poolName, uptime } = useConnectionStatus();
  const logoInputRef = useRef<HTMLInputElement>(null);

  const [showSaved, setShowSaved] = useState(false);
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    setShowSaved(true);
    const t = setTimeout(() => setShowSaved(false), 2000);
    return () => clearTimeout(t);
  }, [config]);

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
    e.target.value = '';
  };

  const primaryHex = hslToHex(config.primaryColor);

  return (
    <Shell
      connectionStatus={connectionStatus}
      connectionLabel={connectionLabel ?? undefined}
      poolName={poolName ?? undefined}
      uptime={uptime}
    >
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Settings</h2>
            <p className="text-muted-foreground">
              Manage your configuration and appearance.
            </p>
          </div>
        </div>

        <Tabs defaultValue="configuration" className="space-y-6">
          <TabsList className="grid w-full grid-cols-2 lg:w-[300px]">
            <TabsTrigger value="configuration">Configuration</TabsTrigger>
            <TabsTrigger value="appearance">Appearance</TabsTrigger>
          </TabsList>

          <TabsContent value="configuration">
            <ConfigurationTab />
          </TabsContent>

          <TabsContent value="appearance">
            <div className="space-y-6 animate-in slide-in-from-bottom-2 duration-300">
              <Card className="glass-card shadow-md">
                <CardHeader>
                  <CardTitle>Branding</CardTitle>
                  <CardDescription>
                    Customize the logo and primary accent color.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-8">

                  <div className="space-y-3">
                    <Label>Logo</Label>
                    <div className="flex items-center gap-4">
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
                      Accent color used throughout the interface.
                    </p>
                  </div>

                  <div className="flex items-center gap-4 pt-2 border-t border-border">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={resetConfig}
                    >
                      <RotateCcw className="mr-2 h-4 w-4" />
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
