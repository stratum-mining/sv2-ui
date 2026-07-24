import { useEffect, useState } from 'react';
import {
  Bot,
  ExternalLink,
  FlaskConical,
  Loader2,
  Send,
  ShieldCheck,
  Unplug,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useTelegram } from '@/hooks/useTelegram';

function runMutation(promise: Promise<unknown>): void {
  void promise.catch(() => {
    // Mutation errors are rendered from the hook state.
  });
}

export function ExperimentalTab() {
  const {
    settings,
    isLoading,
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
  const [summaryInterval, setSummaryInterval] = useState('60');

  useEffect(() => {
    if (settings) {
      setSummaryInterval(String(settings.summaryIntervalMinutes));
    }
  }, [settings]);

  const handleConnect = async () => {
    clearError();
    try {
      await connect(botToken);
      setBotToken('');
    } catch {
      // Mutation errors are rendered from the hook state.
    }
  };

  const handleUpdateSummary = async () => {
    clearError();
    const value = Number(summaryInterval);
    try {
      await update({ summaryIntervalMinutes: value });
    } catch {
      // Mutation errors are rendered from the hook state.
    }
  };

  const openPairingLink = () => {
    if (!settings?.pairingUrl) return;
    window.open(settings.pairingUrl, '_blank', 'noopener,noreferrer');
  };

  if (isLoading || !settings) {
    return (
      <div className="flex min-h-40 items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Loading experimental settings...
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in slide-in-from-bottom-2 duration-300">
      <Card className="glass-card shadow-md">
        <CardHeader>
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-primary/10 p-2 text-primary">
              <FlaskConical className="h-5 w-5" />
            </div>
            <div>
              <CardTitle>Telegram activity updates</CardTitle>
              <CardDescription className="mt-1">
                Experimental local-only notifications for mining status, pool changes, and summaries.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
            <p className="font-medium text-foreground">Proof-of-concept flow</p>
            <p className="mt-1 text-muted-foreground">
              Telegram does not let bots start a conversation. Create a dedicated bot with{' '}
              <a
                href="https://t.me/BotFather"
                target="_blank"
                rel="noreferrer"
                className="font-medium text-primary hover:underline"
              >
                @BotFather
              </a>
              , enter its token here, then press Start in the private bot chat. No SV2 cloud service
              is involved.
            </p>
          </div>

          {!settings.connected && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="telegram-bot-token">Bot token</Label>
                <Input
                  id="telegram-bot-token"
                  type="password"
                  autoComplete="off"
                  value={botToken}
                  onChange={(event) => setBotToken(event.target.value)}
                  placeholder="Paste the token from @BotFather"
                />
                <p className="text-xs text-muted-foreground">
                  The token controls the bot. SV2 UI stores it only in the local config volume with
                  owner-only file permissions and never returns it to the browser.
                </p>
              </div>

              <Button
                onClick={() => void handleConnect()}
                disabled={isPending || botToken.trim().length === 0}
              >
                {isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Bot className="mr-2 h-4 w-4" />
                )}
                Verify bot
              </Button>
            </div>
          )}

          {settings.connected && !settings.paired && (
            <div className="space-y-4">
              <div className="rounded-md border border-border bg-muted/30 p-4">
                <div className="flex items-center gap-2 font-medium">
                  <Bot className="h-4 w-4 text-primary" />
                  {settings.botName} · @{settings.botUsername}
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  Open the one-time link, press Start in Telegram, then come back and check the
                  pairing. This links only that private chat.
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <Button onClick={openPairingLink} disabled={!settings.pairingUrl}>
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Open Telegram
                </Button>
                <Button
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
            <div className="space-y-6">
              <div className="flex flex-col gap-3 rounded-md border border-green-500/30 bg-green-500/10 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <ShieldCheck className="h-5 w-5 text-green-600 dark:text-green-400" />
                  <div>
                    <p className="font-medium">Paired with {settings.recipient}</p>
                    <p className="text-sm text-muted-foreground">
                      @{settings.botUsername} sends updates from this local SV2 UI backend.
                    </p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
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

              <div className="space-y-5">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <Label htmlFor="telegram-enabled">Telegram notifications</Label>
                    <p className="mt-1 text-sm text-muted-foreground">
                      The backend keeps checking even when the browser is closed.
                    </p>
                  </div>
                  <Switch
                    id="telegram-enabled"
                    checked={settings.enabled}
                    onCheckedChange={(enabled) => {
                      clearError();
                      runMutation(update({ enabled }));
                    }}
                    disabled={isPending}
                  />
                </div>

                <div className="flex items-center justify-between gap-4">
                  <div>
                    <Label htmlFor="telegram-status-changes">Status-change alerts</Label>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Notify when mining starts, stops, or switches to another configured pool.
                    </p>
                  </div>
                  <Switch
                    id="telegram-status-changes"
                    checked={settings.notifyOnStatusChange}
                    onCheckedChange={(notifyOnStatusChange) => {
                      clearError();
                      runMutation(update({ notifyOnStatusChange }));
                    }}
                    disabled={isPending || !settings.enabled}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="telegram-summary-interval">Summary interval in minutes</Label>
                  <div className="flex max-w-sm gap-2">
                    <Input
                      id="telegram-summary-interval"
                      type="number"
                      min={0}
                      max={1440}
                      step={15}
                      value={summaryInterval}
                      onChange={(event) => setSummaryInterval(event.target.value)}
                      disabled={isPending || !settings.enabled}
                    />
                    <Button
                      variant="outline"
                      onClick={() => void handleUpdateSummary()}
                      disabled={isPending || !settings.enabled || summaryInterval.length === 0}
                    >
                      Save
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Use 0 to disable summaries, or choose 15-1440 minutes. Summaries include
                    hashrate, workers, and upstream share counts when monitoring data is available.
                  </p>
                </div>
              </div>

              <div className="border-t border-border pt-4">
                <Button
                  variant="ghost"
                  className="text-muted-foreground hover:text-destructive"
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
            </div>
          )}

          {error && (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </p>
          )}

          {testSent && !error && (
            <p className="text-sm text-green-600 dark:text-green-400" aria-live="polite">
              Test update sent to Telegram.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
