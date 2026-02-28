import { useState, useEffect } from 'react';
import { Shell } from '@/components/layout/Shell';
import { Network, Cpu, ChevronDown, ChevronUp, Copy, Check, Key } from 'lucide-react';
import { useJdcHealth, useTranslatorHealth } from '@/hooks/usePoolData';
import { CodeBlock } from '@/wizard/components/ui';

export function ConnectionDetails() {
  const [showCpuMiner, setShowCpuMiner] = useState(false);
  const [copied, setCopied] = useState(false);

  const [wizardData, setWizardData] = useState<Record<string, any> | null>(null);
  const [authorityPubKey, setAuthorityPubKey] = useState<string | null>(null);
  useEffect(() => {
    fetch('/api/wizard-data')
      .then((res) => (res.ok ? res.json() : null))
      .then((wd) => { if (wd) setWizardData(wd); })
      .catch(() => {});
    fetch('/api/config?service=jdc&format=json')
      .then((res) => (res.ok ? res.json() : null))
      .then((cfg) => {
        if (cfg?.data?.authority_public_key) setAuthorityPubKey(cfg.data.authority_public_key);
      })
      .catch(() => {});
  }, []);

  const deployedTproxy = wizardData
    ? !(wizardData.constructTemplates === true && wizardData.skipped_translator_proxy_configuration === true)
    : true;
  const deployedJdc = wizardData?.constructTemplates === true;

  const { data: jdcOk } = useJdcHealth(deployedJdc);
  const { data: translatorOk } = useTranslatorHealth(deployedTproxy);

  const tproxyRunning = deployedTproxy && translatorOk === true;
  const jdcRunning = deployedJdc && jdcOk === true;

  // Determine what miners connect to
  const endpoint = tproxyRunning ? 'Translator Proxy' : jdcRunning ? 'JD Client' : null;
  const port = tproxyRunning ? '34255' : '34265';
  const minerType = tproxyRunning ? 'SV1' : 'SV2';

  return (
    <Shell appMode="translator">
      <div className="space-y-8">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Connection Details</h2>
          <p className="text-muted-foreground">
            How to connect your miners to the running stack.
          </p>
        </div>

        {!endpoint ? (
          <div className="rounded-xl border border-border/40 bg-card/40 backdrop-blur-sm p-8 text-center text-muted-foreground">
            No services are currently running. Deploy via the Setup Wizard first.
          </div>
        ) : (
          <>
            {/* Main connection info */}
            <div className="rounded-2xl border border-border/40 bg-card/40 backdrop-blur-sm p-6">
              <div className="flex items-start gap-3">
                <Network className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-foreground mb-2">
                    Connect {minerType} Miners to {endpoint}
                  </h3>
                  <p className="text-sm text-muted-foreground mb-3">
                    {endpoint} is listening on port{' '}
                    <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">{port}</code>.
                    {tproxyRunning
                      ? ' Point your SV1 mining devices here:'
                      : ' Connect your SV2-native mining devices here:'}
                  </p>
                  <div className="bg-muted/50 rounded p-3 mb-4">
                    <code className="text-sm font-mono text-foreground block">
                      stratum+tcp://&lt;host-ip&gt;:{port}
                    </code>
                  </div>

                  {!tproxyRunning && jdcRunning && authorityPubKey && (
                    <div className="mb-4">
                      <div className="flex items-center gap-2 mb-1.5">
                        <Key className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="text-xs font-medium text-muted-foreground">Authority Public Key</span>
                      </div>
                      <div className="bg-muted/50 rounded p-3 flex items-center gap-2">
                        <code className="text-xs font-mono text-foreground flex-1 break-all select-all">
                          {authorityPubKey}
                        </code>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(authorityPubKey);
                            setCopied(true);
                            setTimeout(() => setCopied(false), 2000);
                          }}
                          className="flex-shrink-0 p-1.5 rounded hover:bg-muted transition-colors"
                          title="Copy to clipboard"
                        >
                          {copied ? (
                            <Check className="w-3.5 h-3.5 text-green-500" />
                          ) : (
                            <Copy className="w-3.5 h-3.5 text-muted-foreground" />
                          )}
                        </button>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-1.5">
                        Configure your SV2 miner with this key for Noise-encrypted connections.
                      </p>
                    </div>
                  )}

                  {!tproxyRunning && jdcRunning && (
                    <p className="text-xs text-muted-foreground mb-4">
                      No Translator Proxy is running. Your SV2-native miners connect directly to the JD Client.
                    </p>
                  )}

                  {/* Running services summary */}
                  <div className="space-y-2 pt-3 border-t border-border/40">
                    {jdcRunning && (
                      <div className="flex items-center gap-2 text-sm">
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                        </span>
                        <span className="text-foreground">JD Client</span>
                        <span className="text-xs text-muted-foreground font-mono ml-auto">port 34265</span>
                      </div>
                    )}
                    {tproxyRunning && (
                      <div className="flex items-center gap-2 text-sm">
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                        </span>
                        <span className="text-foreground">Translator Proxy</span>
                        <span className="text-xs text-muted-foreground font-mono ml-auto">port 34255</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* CPU Miner section — only relevant for SV1 (tproxy) */}
            {tproxyRunning && (
              <>
                <button
                  onClick={() => setShowCpuMiner(!showCpuMiner)}
                  className="w-full flex items-center justify-center gap-2 text-sm font-medium text-foreground bg-card/40 hover:bg-accent border border-border/40 rounded-xl px-4 py-3 transition-all"
                >
                  <Cpu className="w-4 h-4" />
                  {showCpuMiner ? (
                    <>
                      <ChevronUp className="w-4 h-4" />
                      Hide CPU Miner Instructions
                    </>
                  ) : (
                    <>
                      <ChevronDown className="w-4 h-4" />
                      I don't have an ASIC, but I want to try with a CPU miner
                    </>
                  )}
                </button>

                {showCpuMiner && (
                  <div className="rounded-2xl border border-border/40 bg-card/40 backdrop-blur-sm p-4">
                    <div className="flex items-start gap-3">
                      <Cpu className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                      <div className="flex-1 space-y-3">
                        <h3 className="text-sm font-semibold text-foreground">CPU Miner</h3>
                        <p className="text-sm text-muted-foreground">
                          If you don't have a physical miner, you can test with CPUMiner.
                        </p>
                        <div className="space-y-3">
                          <div>
                            <p className="text-xs text-muted-foreground mb-1 font-semibold">Setup the correct CPUMiner for your OS:</p>
                            <ul className="text-xs text-muted-foreground space-y-1 ml-4 list-disc">
                              <li>Download the binary from <a href="https://sourceforge.net/projects/cpuminer/files/" target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary/80 underline">here</a></li>
                              <li>Or compile from <a href="https://github.com/pooler/cpuminer" target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary/80 underline">github.com/pooler/cpuminer</a></li>
                            </ul>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground mb-1 font-semibold">Run CPUMiner:</p>
                            <CodeBlock
                              label="Run cpuminer"
                              code="./minerd -a sha256d -o stratum+tcp://localhost:34255 -q -D -P"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </Shell>
  );
}
