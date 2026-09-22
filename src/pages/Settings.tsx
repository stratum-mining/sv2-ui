import { useRef, useState, useEffect } from 'react';
import { Shell } from '@/components/layout/Shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { useUiConfig, hslToHex, isImageDataUrl, validateLogoFile, MAX_LOGO_FILE_SIZE } from '@/hooks/useUiConfig';
import { useConnectionStatus } from '@/hooks/useConnectionStatus';
import { useSetupStatus } from '@/hooks/useSetupStatus';
import { useContainerLogs } from '@/hooks/useContainerLogs';
import { ContainerLogsPanel } from '@/components/data/ContainerLogsPanel';
import { useAuth } from '@/hooks/useAuth';
import { PasswordInput } from '@/components/ui/password-input';
import { FieldError } from '@/components/ui/field-error';
import {
  CheckCircle2,
  RotateCcw,
  Upload,
} from 'lucide-react';
import { CopyableValue } from '@/components/ui/copyable-value';
import { ConfigurationTab } from '@/components/settings/ConfigurationTab';

/**
 * Settings page with Configuration and Appearance tabs.
 */
export function Settings() {
  const { config, updateConfig, resetConfig } = useUiConfig();
  const { status: connectionStatus, statusLabel: connectionLabel, poolName, activePoolAddress, activePoolPort, activePoolAuthorityPublicKey, uptime } = useConnectionStatus();
  const { mode } = useSetupStatus();
  const isJdMode = mode === 'jd';
  const { recoveryKeySet, regenerateRecoveryKey, changePassword } = useAuth();
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  const handleGenerateKey = async () => {
    const key = await regenerateRecoveryKey.mutateAsync();
    setRevealedKey(key);
  };

  const handleChangePassword = (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(false);

    if (newPassword.length < 8) {
      setPasswordError('Password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match.');
      return;
    }

    changePassword.mutate(
      { currentPassword, newPassword },
      {
        onSuccess: () => {
          setCurrentPassword('');
          setNewPassword('');
          setConfirmPassword('');
          setPasswordSuccess(true);
          setTimeout(() => setPasswordSuccess(false), 3000);
        },
        onError: (error) => {
          setPasswordError(error.message);
        },
      },
    );
  };
  const [activeTab, setActiveTab] = useState('configuration');
  const { data: rawLogs, isLoading: logsLoading } = useContainerLogs(activeTab === 'logs');
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [logoError, setLogoError] = useState<string | null>(null);

  const [showSaved, setShowSaved] = useState(false);
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    setShowSaved(true);
    const t = setTimeout(() => setShowSaved(false), 2000);
    return () => clearTimeout(t);
  }, [config]);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    setLogoError(null);
    if (!file) return;

    const validation = await validateLogoFile(file);
    if (!validation.ok) {
      setLogoError(validation.error);
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      if (isImageDataUrl(dataUrl)) {
        updateConfig({ customLogoDataUrl: dataUrl });
      } else {
        setLogoError('The selected file could not be stored as an image.');
      }
    };
    reader.onerror = () => {
      setLogoError('Failed to read the selected file.');
    };
    reader.readAsDataURL(file);
  };

  const primaryHex = hslToHex(config.primaryColor);

  return (
    <Shell
      connectionStatus={connectionStatus}
      connectionLabel={connectionLabel ?? undefined}
      poolName={poolName ?? undefined}
      activePoolAddress={activePoolAddress ?? undefined}
      activePoolPort={activePoolPort ?? undefined}
      activePoolAuthorityPublicKey={activePoolAuthorityPublicKey ?? undefined}
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

        <Tabs defaultValue="configuration" value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-4 lg:w-[600px]">
            <TabsTrigger value="configuration">Configuration</TabsTrigger>
            <TabsTrigger value="logs">Logs</TabsTrigger>
            <TabsTrigger value="appearance">Appearance</TabsTrigger>
            <TabsTrigger value="security">Security</TabsTrigger>
          </TabsList>

          <TabsContent value="configuration">
            <ConfigurationTab />
          </TabsContent>

          <TabsContent value="logs">
            <div className="animate-in slide-in-from-bottom-2 duration-300">
              <ContainerLogsPanel
                lines={rawLogs?.lines ?? []}
                isLoading={logsLoading}
                isJdMode={isJdMode}
              />
            </div>
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
                        aria-label="Upload logo"
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
                        SVG, PNG, or JPG. Max {Math.round(MAX_LOGO_FILE_SIZE / 1024 / 1024)} MiB. Displayed in the sidebar header.
                      </p>
                      {logoError && (
                        <p className="text-xs text-destructive" role="alert">
                          {logoError}
                        </p>
                      )}
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
                      onClick={() => { setLogoError(null); resetConfig(); }}
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

          <TabsContent value="security">
            <div className="space-y-6 animate-in slide-in-from-bottom-2 duration-300">
              <Card className="glass-card shadow-md">
                <CardHeader>
                  <CardTitle>Change password</CardTitle>
                  <CardDescription>
                    Update the admin password used to access the dashboard.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleChangePassword} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="current-password">Current password</Label>
                      <PasswordInput
                        id="current-password"
                        autoComplete="current-password"
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="new-password">New password</Label>
                      <PasswordInput
                        id="new-password"
                        autoComplete="new-password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="confirm-new-password">Confirm new password</Label>
                      <PasswordInput
                        id="confirm-new-password"
                        autoComplete="new-password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                      />
                    </div>

                    <FieldError message={passwordError} />

                    {passwordSuccess && (
                      <p className="text-sm text-green-600 dark:text-green-400">
                        Password updated successfully.
                      </p>
                    )}

                    <Button
                      type="submit"
                      size="sm"
                      disabled={changePassword.isPending || !currentPassword || !newPassword || !confirmPassword}
                    >
                      {changePassword.isPending ? 'Updating...' : 'Update password'}
                    </Button>
                  </form>
                </CardContent>
              </Card>

              <Card className="glass-card shadow-md">
                <CardHeader>
                  <CardTitle>Account recovery</CardTitle>
                  <CardDescription>
                    A recovery key lets you reset a forgotten password without
                    losing your mining configuration. Store it somewhere safe.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {revealedKey ? (
                    <div className="space-y-3">
                      <CopyableValue value={revealedKey} />
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setRevealedKey(null)}
                        >
                          Done
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Anyone with this key can reset your password. The previous
                        key (if any) is now invalid.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-sm text-muted-foreground">
                        {recoveryKeySet
                          ? 'A recovery key is set. Generate a new one if you need a replacement.'
                          : 'No recovery key is set yet.'}
                      </p>
                      <Button
                        size="sm"
                        onClick={handleGenerateKey}
                        disabled={regenerateRecoveryKey.isPending}
                      >
                        {regenerateRecoveryKey.isPending
                          ? 'Generating...'
                          : recoveryKeySet
                            ? 'Generate new recovery key'
                            : 'Create recovery key'}
                      </Button>
                      {recoveryKeySet && (
                        <p className="text-xs text-muted-foreground">
                          Generating a new key invalidates the one you saved before.
                        </p>
                      )}
                    </div>
                  )}

                  {regenerateRecoveryKey.error && (
                    <p className="text-xs text-destructive" role="alert">
                      {regenerateRecoveryKey.error.message}
                    </p>
                  )}
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
