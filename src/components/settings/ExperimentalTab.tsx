import { useState, type ReactNode } from 'react';
import {
  Bot,
  ExternalLink,
  Loader2,
  Send,
  Unplug,
} from 'lucide-react';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FieldError } from '@/components/ui/field-error';
import { Label } from '@/components/ui/label';
import { PasswordInput } from '@/components/ui/password-input';
import { Switch } from '@/components/ui/switch';
import { useTelegram, type TelegramSettings } from '@/hooks/useTelegram';

type AlertOptionKey = Extract<keyof TelegramSettings, `notifyOn${string}`>;

const ALERT_OPTIONS: ReadonlyArray<{ key: AlertOptionKey; title: string }> = [
  { key: 'notifyOnBlockFound', title: 'Block found' },
  { key: 'notifyOnBestDifficulty', title: 'New best difficulty' },
  { key: 'notifyOnPoolChange', title: 'Pool failover' },
  { key: 'notifyOnStatusChange', title: 'Mining start and stop' },
  { key: 'notifyOnWorkerChange', title: 'Worker changes' },
  { key: 'notifyOnRejectedShares', title: 'Rejected shares' },
];

// Same choices as the summary button of the Telegram /settings menu.
const SUMMARY_INTERVAL_OPTIONS = [0, 15, 60, 6 * 60];

function getSummaryOptions(current: number): number[] {
  return SUMMARY_INTERVAL_OPTIONS.includes(current)
    ? SUMMARY_INTERVAL_OPTIONS
    : [...SUMMARY_INTERVAL_OPTIONS, current].sort((left, right) => left - right);
}

function formatSummaryInterval(minutes: number): string {
  if (minutes === 0) return 'Off';
  if (minutes % 60 === 0) return `Every ${minutes / 60} h`;
  return `Every ${minutes} min`;
}

const TELEGRAM_EXPERIMENT_STORAGE_KEY = 'sv2-ui-experiment-telegram-enabled';

// localStorage can throw (blocked site data, some private modes). This is
// only a UI convenience, so fall back to the server state instead of crashing.
function readStoredTelegramExperimentState(): boolean | null {
  if (typeof window === 'undefined') return null;

  try {
    const stored = window.localStorage.getItem(TELEGRAM_EXPERIMENT_STORAGE_KEY);
    return stored === null ? null : stored === 'true';
  } catch {
    return null;
  }
}

function storeTelegramExperimentState(enabled: boolean): void {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(TELEGRAM_EXPERIMENT_STORAGE_KEY, String(enabled));
  } catch {
    // The toggle still works for this visit; it just won't be remembered.
  }
}

export function isTelegramExperimentOpen(
  settings: Pick<TelegramSettings, 'connected' | 'paired' | 'enabled'>,
  setupEnabled: boolean | null,
): boolean {
  return settings.paired
    ? settings.enabled
    : setupEnabled ?? settings.connected;
}

function runMutation(promise: Promise<unknown>): void {
  void promise.catch(() => {
    // Mutation errors are rendered from the hook state.
  });
}

export function ExperimentalTab() {
  const {
    settings,
    isLoading,
    retry,
    isPending,
    error,
    testSent,
    connect,
    pair,
    update,
    sendTest,
    disconnect,
    clearError,
  } = useTelegram();
  const [botToken, setBotToken] = useState('');
  const [telegramSetupEnabled, setTelegramSetupEnabled] = useState<boolean | null>(
    readStoredTelegramExperimentState,
  );

  const handleConnect = async () => {
    clearError();
    try {
      await connect(botToken);
      setBotToken('');
    } catch {
      // Mutation errors are rendered from the hook state.
    }
  };

  const openPairingLink = () => {
    if (!settings?.pairingUrl) return;
    window.open(settings.pairingUrl, '_blank', 'noopener,noreferrer');
  };

  const handleTelegramExperimentChange = (enabled: boolean) => {
    clearError();

    if (settings?.paired) {
      runMutation(update({ enabled }));
      return;
    }

    setTelegramSetupEnabled(enabled);
    storeTelegramExperimentState(enabled);
  };

  if (isLoading) {
    return (
      <div className="flex min-h-40 items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Loading experimental settings...
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="flex min-h-40 flex-col items-center justify-center gap-3 text-sm">
        <p className="max-w-lg text-center text-destructive">
          {error || 'Telegram settings could not be loaded.'}
        </p>
        <Button variant="outline" onClick={() => void retry()}>
          Retry
        </Button>
      </div>
    );
  }

  const telegramExperimentOpen = isTelegramExperimentOpen(
    settings,
    telegramSetupEnabled,
  );

  return (
    <div className="space-y-6 animate-in slide-in-from-bottom-2 duration-300">
      <div className="space-y-1">
        <h3 className="text-xl font-semibold tracking-tight">Experiments</h3>
        <p className="text-sm text-muted-foreground">
          Early features that are still being refined. Opt in to try them.
        </p>
      </div>

      <Card className="glass-card shadow-md">
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <CardTitle id="telegram-experiment-title">Telegram activity updates</CardTitle>
            <Switch
              id="telegram-experiment-enabled"
              checked={telegramExperimentOpen}
              onCheckedChange={handleTelegramExperimentChange}
              disabled={isPending}
              aria-labelledby="telegram-experiment-title"
              className="shrink-0"
            />
          </div>
        </CardHeader>

        {telegramExperimentOpen && (
          <CardContent className="space-y-6">
            {!settings.paired && (
              <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
                <li>
                  Create a bot with{' '}
                  <a
                    href="https://t.me/BotFather"
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-primary hover:underline"
                  >
                    @BotFather
                  </a>{' '}
                  and copy its token.
                </li>
                <li>Paste the token below and connect.</li>
                <li>Open the bot in Telegram, press Start, then check pairing.</li>
              </ol>
            )}

            {!settings.connected && (
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="telegram-bot-token">Bot token</Label>
                  <PasswordInput
                    id="telegram-bot-token"
                    autoComplete="off"
                    value={botToken}
                    onChange={(event) => setBotToken(event.target.value)}
                    placeholder="Paste the token from @BotFather"
                  />
                  <p className="text-xs text-muted-foreground">
                    Stored only on your SV2 UI server. Use a bot made just for SV2 UI.
                  </p>
                </div>

                <Button
                  size="sm"
                  onClick={() => void handleConnect()}
                  disabled={isPending || botToken.trim().length === 0}
                >
                  {isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Bot className="mr-2 h-4 w-4" />
                  )}
                  Connect bot
                </Button>
              </div>
            )}

            {settings.connected && !settings.paired && (
              <div className="space-y-3">
                <SettingRow
                  title={`${settings.botName ?? 'Telegram bot'} · @${settings.botUsername}`}
                  description="Open Telegram, press Start, then check pairing."
                />
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={openPairingLink} disabled={!settings.pairingUrl}>
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Open Telegram
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      clearError();
                      runMutation(pair());
                    }}
                    disabled={isPending}
                  >
                    {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Check pairing
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      clearError();
                      runMutation(disconnect());
                    }}
                    disabled={isPending}
                  >
                    Use a different bot
                  </Button>
                </div>
              </div>
            )}

            {settings.paired && (
              <>
                <Alert variant={settings.deliveryError ? 'warning' : 'success'}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      {settings.deliveryError ? (
                        <>
                          <p className="font-medium">Alerts are not being delivered</p>
                          <p className="text-muted-foreground">{settings.deliveryError}</p>
                        </>
                      ) : (
                        <>
                          <p className="font-medium">Paired with {settings.recipient}</p>
                          <p className="text-muted-foreground">
                            Alerts come from @{settings.botUsername}. Send{' '}
                            <span className="font-mono">/settings</span> to it to change them from Telegram.
                          </p>
                        </>
                      )}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      onClick={() => {
                        clearError();
                        runMutation(sendTest());
                      }}
                      disabled={isPending}
                    >
                      <Send className="mr-2 h-4 w-4" />
                      Send test
                    </Button>
                  </div>
                </Alert>

                <div className="space-y-3">
                  {ALERT_OPTIONS.map(({ key, title }) => (
                    <SettingRow key={key} title={title}>
                      <Switch
                        id={`telegram-${key}`}
                        checked={settings[key]}
                        onCheckedChange={(checked) => {
                          clearError();
                          runMutation(update({ [key]: checked }));
                        }}
                        disabled={isPending || !settings.enabled}
                        aria-label={title}
                        className="shrink-0"
                      />
                    </SettingRow>
                  ))}

                  <SettingRow title="Summary" htmlFor="telegram-summary-interval">
                    <select
                      id="telegram-summary-interval"
                      value={settings.summaryIntervalMinutes}
                      onChange={(event) => {
                        clearError();
                        runMutation(update({ summaryIntervalMinutes: Number(event.target.value) }));
                      }}
                      disabled={isPending || !settings.enabled}
                      className="h-8 w-32 shrink-0 rounded-lg border border-input bg-background px-3 text-sm outline-none transition-all focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/15 disabled:opacity-50"
                    >
                      {getSummaryOptions(settings.summaryIntervalMinutes).map((minutes) => (
                        <option key={minutes} value={minutes}>
                          {formatSummaryInterval(minutes)}
                        </option>
                      ))}
                    </select>
                  </SettingRow>
                </div>

                {testSent && !error && (
                  <p className="text-sm text-green-600 dark:text-green-400" aria-live="polite">
                    Test update sent to Telegram.
                  </p>
                )}

                <div className="border-t border-border pt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      clearError();
                      runMutation(disconnect());
                    }}
                    disabled={isPending}
                  >
                    <Unplug className="mr-2 h-4 w-4" />
                    Disconnect Telegram
                  </Button>
                </div>
              </>
            )}

            <FieldError message={error} role="alert" />
          </CardContent>
        )}
      </Card>
    </div>
  );
}

/**
 * Same bordered row used for settings elsewhere in the app (Configuration tab,
 * advanced mining options): title on the left, control on the right.
 */
function SettingRow({
  title,
  description,
  htmlFor,
  children,
}: {
  title: string;
  description?: string;
  htmlFor?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-border/50 bg-muted/20 px-4 py-3">
      <div className="min-w-0 space-y-0.5">
        {htmlFor ? (
          <Label htmlFor={htmlFor} className="text-sm font-medium">{title}</Label>
        ) : (
          <p className="text-sm font-medium">{title}</p>
        )}
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </div>
  );
}
