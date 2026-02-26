// Bitcoin Core setup content component

import { useState } from "react";
import { ArrowRight, Settings, Play, Download, HardDrive, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { BitcoinNetwork } from '../types';
import { isMacOS } from '../constants';
import { CodeBlock, InfoCard } from '../ui';
import { IntegratedBitcoinCore } from './IntegratedBitcoinCore';

export const BitcoinSetupContent = ({
  network,
  data,
  updateData,
  onContinue,
  description,
  showBitcoinConf = true
}: {
  network: BitcoinNetwork,
  data?: any,
  updateData?: (newData: any) => void,
  onContinue?: () => void,
  description?: string,
  showBitcoinConf?: boolean
}) => {
  const [socketPath, setSocketPath] = useState(data?.socketPath || "");
  // Reset nodeStarted to false when component mounts to ensure confirmation button always shows
  const [nodeStarted, setNodeStarted] = useState(false);
  const [integratedRunning, setIntegratedRunning] = useState(false);
  const [socketCheck, setSocketCheck] = useState<'idle' | 'checking' | 'ok' | 'error'>('idle');
  const [socketCheckReason, setSocketCheckReason] = useState('');
  const networkFlag = network === "mainnet" ? "" : ` -${network}`;
  const startNodeCommand = `./bitcoin-30.2/bin/bitcoin -m node -ipcbind=unix${networkFlag}`;

  const handleCheckSocket = async () => {
    if (!socketPath) return;
    setSocketCheck('checking');
    setSocketCheckReason('');
    try {
      const res = await fetch(`/api/check-socket?path=${encodeURIComponent(socketPath)}`);
      const body = await res.json();
      if (body.ok) {
        setSocketCheck('ok');
      } else {
        setSocketCheck('error');
        setSocketCheckReason(body.reason || 'Socket not accessible');
      }
    } catch {
      setSocketCheck('error');
      setSocketCheckReason('Could not reach the backend');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (updateData) {
      updateData({
        socketPath: socketPath || undefined,
      });
    }
    if (onContinue) {
      onContinue();
    }
  };

  return (
    <div className="space-y-8">
      <div className="bg-card border border-border rounded-2xl p-4">
        <h3 className="text-primary font-semibold flex items-center gap-2 mb-2">
          <HardDrive className="w-4 h-4" /> Bitcoin Core Setup Required
        </h3>
        <p className="text-sm text-muted-foreground">
          {description || "You need a running Bitcoin Core node to construct your own block templates."}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <InfoCard number={1} title="Install Bitcoin Core" icon={Download}>
          <p className="text-sm text-muted-foreground mb-3">Download and install version 30.2 or later.</p>
          <Button variant="secondary" size="sm" className="w-full text-xs" asChild>
            <a href="https://bitcoincore.org/en/download/" target="_blank" rel="noopener noreferrer">
              Visit BitcoinCore.org
            </a>
          </Button>
        </InfoCard>
        {showBitcoinConf && (
          <InfoCard number={2} title="Configure bitcoin.conf" icon={Settings}>
            <p className="text-sm text-muted-foreground mb-3">
              Configure your Bitcoin Core node before starting it.
            </p>
            <p className="text-xs text-muted-foreground">
              See the configuration section below for required settings.
            </p>
          </InfoCard>
        )}
        {!showBitcoinConf && (
          <InfoCard number={2} title="Start Bitcoin Core" icon={Play}>
            <p className="text-sm text-muted-foreground mb-3">
              Start your Bitcoin Core node with IPC binding using the command shown below.
            </p>
            <p className="text-xs text-muted-foreground">
              Keep it running and wait for Initial Block Download (IBD) to finish.
            </p>
          </InfoCard>
        )}
        <InfoCard number={3} title={showBitcoinConf ? "Start Bitcoin Core" : "Locate Socket"} icon={showBitcoinConf ? Play : HardDrive}>
          <p className="text-sm text-muted-foreground mb-3">
            {showBitcoinConf
              ? "After configuring bitcoin.conf, start the node with IPC binding using the command shown below."
              : "After starting the node, locate the socket file path to continue."}
          </p>
          <p className="text-xs text-muted-foreground">
            Keep it running and wait for Initial Block Download (IBD) to finish. Leave it running while you continue the wizard.
          </p>
        </InfoCard>
      </div>

      {showBitcoinConf && (
        <div className="border-border bg-card rounded-2xl border p-6">
          <h3 className="text-primary font-semibold flex items-center gap-2 mb-4">
            <Settings className="w-4 h-4" /> Bitcoin Configuration File
          </h3>
          <p className="text-sm text-muted-foreground mb-4">
            <strong>Important:</strong> Add these settings to your <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">bitcoin.conf</code> file <strong>before</strong> launching the node. These RPC settings are required for JDS when miners want to use JD protocol and create their own block templates.
          </p>
          <div className="space-y-3">
            <div>
              <span className="text-xs uppercase tracking-widest text-muted-foreground block mb-2">bitcoin.conf location</span>
              <code className="block bg-muted px-3 py-2 rounded text-sm font-mono text-foreground">
                {isMacOS()
                  ? "~/Library/Application Support/Bitcoin/bitcoin.conf"
                  : "~/.bitcoin/bitcoin.conf"}
              </code>
            </div>
            <div>
              <span className="text-xs uppercase tracking-widest text-muted-foreground block mb-2">Required Configuration</span>
              <CodeBlock
                label="Add to bitcoin.conf"
                code={`server=1
rpcuser=username
rpcpassword=password
rpcbind=0.0.0.0
rpcallowip=0.0.0.0/0`}
              />
            </div>
          </div>
        </div>
      )}

      <div className="border-border bg-card rounded-2xl border p-6">
        <h3 className="text-primary font-semibold flex items-center gap-2 mb-4">
          <Play className="w-4 h-4" /> Start Bitcoin Core Node
        </h3>
        <p className="text-sm text-muted-foreground mb-4">
          {showBitcoinConf
            ? "After configuring bitcoin.conf, start your Bitcoin Core node with the following command:"
            : "Start your Bitcoin Core node with the following command:"}
        </p>
        <div className="mb-4">
          <CodeBlock label="Start command" code={startNodeCommand} />
          <p className="mt-3 text-xs text-muted-foreground">
            Keep the node running and wait for Initial Block Download (IBD) to finish. Leave it running while you continue the wizard.
          </p>
          <div className="mt-3 bg-muted/50 rounded-lg px-3 py-2.5 text-xs text-muted-foreground space-y-1">
            <p className="font-medium text-foreground">Where is the socket file?</p>
            <p>
              After starting, Bitcoin Core creates a socket file at:
            </p>
            <code className="block font-mono text-foreground">
              {network === 'mainnet'
                ? '~/.bitcoin/node.sock'
                : `~/.bitcoin/${network}/node.sock`}
            </code>
            <p>
              Replace <code className="font-mono">~</code> with your actual home directory, e.g.{' '}
              <code className="font-mono">
                {network === 'mainnet'
                  ? '/home/yourname/.bitcoin/node.sock'
                  : `/home/yourname/.bitcoin/${network}/node.sock`}
              </code>.
              Not sure? Run <code className="font-mono">echo $HOME</code> in a terminal to find it.
            </p>
          </div>
        </div>
      </div>

      {!integratedRunning && (
        <>
          {!nodeStarted ? (
            <div className="border border-border rounded-2xl p-6 bg-card">
              <div className="text-center space-y-4">
                <div>
                  <h4 className="text-lg font-semibold text-foreground mb-2">Confirm Node Startup</h4>
                  <p className="text-sm text-muted-foreground">
                    Once you've started your Bitcoin Core node with the command above, click below to continue.
                  </p>
                </div>
                <Button
                  onClick={() => {
                    setNodeStarted(true);
                    if (updateData) {
                      updateData({ nodeStarted: true });
                    }
                  }}
                  className="group"
                >
                  I have started my node with IPC binding
                  <ArrowRight className="ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </Button>
              </div>
            </div>
          ) : (
            <div className="border-border bg-card rounded-2xl border p-6">
              <h3 className="text-primary font-semibold flex items-center gap-2 mb-4">
                <HardDrive className="w-4 h-4" /> Socket File Location
              </h3>
              <p className="text-sm text-muted-foreground mb-4">
                Paste the full path to the socket file Bitcoin Core created when you started it.
                See the box above if you're unsure where to find it.
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="socketPath" className="text-foreground font-medium">
                    Bitcoin Core socket file location
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      id="socketPath"
                      required
                      placeholder={
                        network === 'mainnet'
                          ? '/home/yourname/.bitcoin/node.sock'
                          : `/home/yourname/.bitcoin/${network}/node.sock`
                      }
                      value={socketPath}
                      onChange={(e) => {
                        setSocketPath(e.target.value);
                        setSocketCheck('idle');
                      }}
                      className="font-mono text-sm"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={socketCheck === 'checking'}
                      onClick={handleCheckSocket}
                      className="shrink-0"
                    >
                      {socketCheck === 'checking' ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : socketCheck === 'ok' ? (
                        <><CheckCircle2 className="w-4 h-4 text-green-500 mr-1" />Verified</>
                      ) : (
                        'Verify'
                      )}
                    </Button>
                  </div>

                  {socketCheck === 'error' && (
                    <p className="flex items-center gap-1.5 text-xs text-destructive">
                      <XCircle className="w-3.5 h-3.5" />
                      {socketCheckReason}
                    </p>
                  )}

                  <p className="text-xs text-muted-foreground">
                    Enter the full path shown above — no shortcuts like <code className="font-mono">~</code>.
                    Click <strong>Verify</strong> to confirm the file is reachable before continuing.
                  </p>
                </div>
                <div className="flex justify-end">
                  <Button
                    type="submit"
                    disabled={socketCheck !== 'ok'}
                    className="group"
                  >
                    Continue
                    <ArrowRight className="ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </Button>
                </div>
              </form>
            </div>
          )}
        </>
      )}

      {/* Integrated Bitcoin Core Stack */}
      <IntegratedBitcoinCore
        network={network}
        onRunning={() => {
          setIntegratedRunning(true);
          if (updateData) {
            updateData({ integratedBitcoinCore: true, nodeStarted: true });
          }
        }}
      />

      {integratedRunning && onContinue && (
        <div className="flex justify-end">
          <Button onClick={onContinue} className="group">
            Continue
            <ArrowRight className="ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </Button>
        </div>
      )}
    </div>
  );
};
