import { useState, useEffect } from 'react';
import { stringify as tomlStringify } from 'smol-toml';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Copy, KeyRound, Plus, RefreshCw, ScrollText, Trash2 } from 'lucide-react';
import { LogsPanel } from './LogsPanel';
import { UpdateTab } from './UpdateTab';

export type StatusMsg = { ok: boolean; msg: string };

// ─── Shared field row helper ─────────────────────────────────────────────────

export function FieldRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

// ─── Live TOML preview panel ─────────────────────────────────────────────────

export function TomlPreview({ cfg }: { cfg: Record<string, unknown> }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  let preview = '';
  let error = '';
  if (open) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      preview = tomlStringify(cfg as any);
    } catch (e) {
      error = e instanceof Error ? e.message : 'Serialization error';
    }
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(preview);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="pt-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <span className={`transition-transform duration-150 ${open ? 'rotate-90' : ''}`}>▶</span>
        {open ? 'Hide' : 'Show'} TOML preview
      </button>

      {open && (
        <Card className="mt-2 glass-card border-none shadow-md bg-card/40">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                Generated TOML
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCopy}
                disabled={!!error}
                className="h-7 px-2 flex items-center gap-1 text-xs"
              >
                <Copy className="h-3 w-3" />
                {copied ? 'Copied!' : 'Copy'}
              </Button>
            </div>
            <CardDescription className="text-xs">
              Live preview — exactly what will be written to disk on Save.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {error ? (
              <p className="text-sm text-red-500">Serialization error: {error}</p>
            ) : (
              <pre className="text-xs font-mono bg-black/80 text-green-400 p-3 rounded-md overflow-auto max-h-[28rem] whitespace-pre">
                {preview}
              </pre>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Save / Restart footer ────────────────────────────────────────────────────

export function ActionFooter({
  onSave,
  onRestart,
  restarting,
  saveStatus,
  restartStatus,
}: {
  onSave: () => void;
  onRestart: () => void;
  restarting: boolean;
  saveStatus: StatusMsg | null;
  restartStatus: StatusMsg | null;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 pt-4 border-t border-border/40 mt-4">
      <Button onClick={onSave}>Save Config</Button>
      <Button variant="outline" onClick={onRestart} disabled={restarting} className="flex items-center gap-1">
        {restarting && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
        Restart Container
      </Button>
      {saveStatus && (
        <span className={`text-sm ${saveStatus.ok ? 'text-green-500' : 'text-red-500'}`}>
          {saveStatus.ok ? '✓' : '✗'} {saveStatus.msg}
        </span>
      )}
      {restartStatus && (
        <span className={`text-sm ${restartStatus.ok ? 'text-green-500' : 'text-red-500'}`}>
          {restartStatus.ok ? '✓' : '✗'} {restartStatus.msg}
        </span>
      )}
    </div>
  );
}

// ─── Default config ──────────────────────────────────────────────────────────

const JDC_DEFAULTS: Record<string, unknown> = {
  listening_address: '0.0.0.0:34265',
  max_supported_version: 2,
  min_supported_version: 2,
  authority_public_key: '',
  authority_secret_key: '',
  cert_validity_sec: 3600,
  user_identity: '',
  shares_per_minute: 10,
  share_batch_size: 20,
  mode: 'FULLTEMPLATE',
  jdc_signature: '',
  coinbase_reward_script: '',
  monitoring_address: '0.0.0.0:9091',
  upstreams: [],
  template_provider_type: {
    BitcoinCoreIpc: { network: 'mainnet', fee_threshold: 500, min_interval: 20 },
  },
};

// ─── JD-Client structured tabs ───────────────────────────────────────────────

export function JdcTabs() {
  const [activeSubTab, setActiveSubTab] = useState('basic');
  const [loading, setLoading] = useState(true);
  const [cfg, setCfg] = useState<Record<string, unknown>>(JDC_DEFAULTS);
  const [saveStatus, setSaveStatus] = useState<StatusMsg | null>(null);
  const [restarting, setRestarting] = useState(false);
  const [restartStatus, setRestartStatus] = useState<StatusMsg | null>(null);

  useEffect(() => {
    fetch('/api/config?service=jdc&format=json')
      .then((r) => r.json())
      .then((d) => {
        setCfg(d.data ?? JDC_DEFAULTS);
        setLoading(false);
      })
      .catch(() => {
        setCfg(JDC_DEFAULTS);
        setLoading(false);
      });
  }, []);

  const upd = (key: string, val: unknown) =>
    setCfg((d) => ({ ...d, [key]: val }));

  const upstreams = (cfg.upstreams as Array<Record<string, unknown>>) ?? [];

  const updUpstream = (idx: number, key: string, val: unknown) =>
    setCfg((d) => {
      const ups = [...((d.upstreams as Array<Record<string, unknown>>) ?? [])];
      ups[idx] = { ...ups[idx], [key]: val };
      return { ...d, upstreams: ups };
    });

  const addUpstream = () =>
    setCfg((d) => ({
      ...d,
      upstreams: [
        ...((d.upstreams as Array<Record<string, unknown>>) ?? []),
        { authority_pubkey: '', pool_address: '', pool_port: 3333, jds_address: '', jds_port: 3456 },
      ],
    }));

  const removeUpstream = (idx: number) =>
    setCfg((d) => ({
      ...d,
      upstreams: ((d.upstreams as Array<Record<string, unknown>>) ?? []).filter((_, i) => i !== idx),
    }));

  const tpObj = (cfg.template_provider_type as Record<string, unknown>) ?? {};
  const tpType = 'Sv2Tp' in tpObj ? 'Sv2Tp' : 'BitcoinCoreIpc';
  const btcIpc = (tpObj.BitcoinCoreIpc as Record<string, unknown>) ?? {};
  const sv2tp = (tpObj.Sv2Tp as Record<string, unknown>) ?? {};

  const setTpType = (newType: string) =>
    setCfg((d) => {
      const existing = (d.template_provider_type as Record<string, unknown>) ?? {};
      const existingData =
        existing[newType] ??
        (newType === 'BitcoinCoreIpc'
          ? { network: 'mainnet', fee_threshold: 500, min_interval: 20 }
          : { address: '' });
      return { ...d, template_provider_type: { [newType]: existingData } };
    });

  const updTp = (key: string, val: unknown) =>
    setCfg((d) => {
      const tp = (d.template_provider_type as Record<string, unknown>) ?? {};
      const inner = (tp[tpType] as Record<string, unknown>) ?? {};
      return { ...d, template_provider_type: { ...tp, [tpType]: { ...inner, [key]: val } } };
    });

  const rawScript = (cfg.coinbase_reward_script as string) ?? '';
  const coinbaseAddr =
    rawScript.startsWith('addr(') && rawScript.endsWith(')')
      ? rawScript.slice(5, -1)
      : rawScript;

  const handleSave = async () => {
    setSaveStatus(null);
    try {
      const r = await fetch('/api/config?service=jdc&format=json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: cfg }),
      });
      const d = await r.json();
      setSaveStatus(r.ok ? { ok: true, msg: 'Saved successfully.' } : { ok: false, msg: d.error ?? 'Save failed.' });
    } catch {
      setSaveStatus({ ok: false, msg: 'Network error.' });
    }
  };

  const handleRestart = async () => {
    setRestarting(true);
    setRestartStatus(null);
    try {
      const r = await fetch('/api/restart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ containers: ['jd_client'] }),
      });
      const d = await r.json();
      setRestartStatus(r.ok ? { ok: true, msg: 'Container restarted.' } : { ok: false, msg: d.error ?? 'Restart failed.' });
    } catch {
      setRestartStatus({ ok: false, msg: 'Network error.' });
    } finally {
      setRestarting(false);
    }
  };

  if (loading) return <p className="text-sm text-muted-foreground">Loading config…</p>;

  return (
    <div className="space-y-4">
      <Tabs defaultValue="basic" value={activeSubTab} onValueChange={setActiveSubTab}>
        <TabsList className="grid w-full grid-cols-7">
          <TabsTrigger value="basic">Basic</TabsTrigger>
          <TabsTrigger value="keys">Keys</TabsTrigger>
          <TabsTrigger value="mining">Mining</TabsTrigger>
          <TabsTrigger value="upstreams">Upstreams</TabsTrigger>
          <TabsTrigger value="template">Template</TabsTrigger>
          <TabsTrigger value="logs" className="flex items-center gap-1">
            <ScrollText className="h-3.5 w-3.5" /> Logs
          </TabsTrigger>
          <TabsTrigger value="update">Update</TabsTrigger>
        </TabsList>

        {/* Basic */}
        <TabsContent value="basic">
          <Card className="glass-card border-none shadow-md bg-card/40">
            <CardHeader>
              <CardTitle>Basic Settings</CardTitle>
              <CardDescription>Network addresses and protocol version bounds.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FieldRow label="Listening Address" hint="Address:port the JDC listens on for downstream SV2 miners.">
                <Input
                  value={(cfg.listening_address as string) ?? ''}
                  onChange={(e) => upd('listening_address', e.target.value)}
                  placeholder="0.0.0.0:34265"
                />
              </FieldRow>
              <FieldRow label="Monitoring Address (optional)" hint="HTTP monitoring endpoint address.">
                <Input
                  value={(cfg.monitoring_address as string) ?? ''}
                  onChange={(e) => upd('monitoring_address', e.target.value)}
                  placeholder="0.0.0.0:9091"
                />
              </FieldRow>
              <div className="grid grid-cols-3 gap-4">
                <FieldRow label="Max Protocol Version">
                  <Input
                    type="number"
                    value={(cfg.max_supported_version as number) ?? 2}
                    onChange={(e) => upd('max_supported_version', parseInt(e.target.value) || 2)}
                  />
                </FieldRow>
                <FieldRow label="Min Protocol Version">
                  <Input
                    type="number"
                    value={(cfg.min_supported_version as number) ?? 2}
                    onChange={(e) => upd('min_supported_version', parseInt(e.target.value) || 2)}
                  />
                </FieldRow>
                <FieldRow label="Cert Validity (sec)">
                  <Input
                    type="number"
                    value={(cfg.cert_validity_sec as number) ?? 3600}
                    onChange={(e) => { const v = parseInt(e.target.value); upd('cert_validity_sec', isNaN(v) ? 3600 : v); }}
                  />
                </FieldRow>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Keys */}
        <TabsContent value="keys">
          <Card className="glass-card border-none shadow-md bg-card/40">
            <CardHeader>
              <CardTitle>Authority Keys</CardTitle>
              <CardDescription>Noise protocol keypair for encrypted downstream connections.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FieldRow label="Authority Public Key">
                <Input
                  value={(cfg.authority_public_key as string) ?? ''}
                  onChange={(e) => upd('authority_public_key', e.target.value)}
                  className="font-mono text-xs"
                  placeholder="Base58-encoded public key"
                />
              </FieldRow>
              <FieldRow label="Authority Secret Key">
                <Input
                  value={(cfg.authority_secret_key as string) ?? ''}
                  onChange={(e) => upd('authority_secret_key', e.target.value)}
                  className="font-mono text-xs"
                  placeholder="Base58-encoded secret key"
                />
              </FieldRow>
              <Button
                variant="outline"
                onClick={async () => {
                  try {
                    const r = await fetch('/api/keys/generate', { method: 'POST' });
                    if (!r.ok) throw new Error('Generation failed');
                    const { publicKey, secretKey } = await r.json();
                    upd('authority_public_key', publicKey);
                    upd('authority_secret_key', secretKey);
                  } catch {
                    // silent — user can retry
                  }
                }}
                className="flex items-center gap-1.5"
              >
                <KeyRound className="h-3.5 w-3.5" />
                Generate New Keypair
              </Button>
              <p className="text-xs text-muted-foreground">
                Generates a fresh Noise authority keypair. The tProxy upstream key is also updated automatically.
                Click Save Config then restart both JDC and tProxy containers to apply.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Mining */}
        <TabsContent value="mining">
          <Card className="glass-card border-none shadow-md bg-card/40">
            <CardHeader>
              <CardTitle>Mining Settings</CardTitle>
              <CardDescription>Identity, coinbase payout, and share parameters.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FieldRow label="User Identity" hint="Username sent upstream to identify this miner.">
                <Input
                  value={(cfg.user_identity as string) ?? ''}
                  onChange={(e) => upd('user_identity', e.target.value)}
                />
              </FieldRow>
              <FieldRow label="JDC Signature" hint="String appended to coinbase scriptSig.">
                <Input
                  value={(cfg.jdc_signature as string) ?? ''}
                  onChange={(e) => upd('jdc_signature', e.target.value)}
                />
              </FieldRow>
              <FieldRow label="Coinbase Address" hint="Bitcoin address for block rewards (stored as addr(...) in TOML).">
                <Input
                  value={coinbaseAddr}
                  onChange={(e) =>
                    upd(
                      'coinbase_reward_script',
                      e.target.value ? `addr(${e.target.value})` : '',
                    )
                  }
                  placeholder="bc1q..."
                />
              </FieldRow>
              <FieldRow label="Mode">
                <Select
                  value={(cfg.mode as string) ?? 'FULLTEMPLATE'}
                  onValueChange={(v) => upd('mode', v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FULLTEMPLATE">FULLTEMPLATE</SelectItem>
                    <SelectItem value="COINBASEONLY">COINBASEONLY</SelectItem>
                  </SelectContent>
                </Select>
              </FieldRow>
              <div className="grid grid-cols-2 gap-4">
                <FieldRow label="Shares Per Minute">
                  <Input
                    type="number"
                    value={(cfg.shares_per_minute as number) ?? 10}
                    onChange={(e) => upd('shares_per_minute', parseInt(e.target.value) || 0)}
                  />
                </FieldRow>
                <FieldRow label="Share Batch Size">
                  <Input
                    type="number"
                    value={(cfg.share_batch_size as number) ?? 20}
                    onChange={(e) => upd('share_batch_size', parseInt(e.target.value) || 0)}
                  />
                </FieldRow>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Upstreams */}
        <TabsContent value="upstreams">
          <div className="space-y-4">
            {upstreams.map((up, idx) => (
              <Card key={idx} className="glass-card border-none shadow-md bg-card/40">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">Upstream #{idx + 1}</CardTitle>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeUpstream(idx)}
                      className="text-red-500 hover:text-red-600 h-7 px-2"
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1" /> Remove
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FieldRow label="Authority Public Key">
                    <Input
                      value={(up.authority_pubkey as string) ?? ''}
                      onChange={(e) => updUpstream(idx, 'authority_pubkey', e.target.value)}
                      className="font-mono text-xs"
                      placeholder="Pool authority pubkey"
                    />
                  </FieldRow>
                  <div className="grid grid-cols-2 gap-4">
                    <FieldRow label="Pool Address">
                      <Input
                        value={(up.pool_address as string) ?? ''}
                        onChange={(e) => updUpstream(idx, 'pool_address', e.target.value)}
                        placeholder="pool.example.com"
                      />
                    </FieldRow>
                    <FieldRow label="Pool Port">
                      <Input
                        type="number"
                        value={(up.pool_port as number) ?? 3333}
                        onChange={(e) => updUpstream(idx, 'pool_port', parseInt(e.target.value) || 3333)}
                      />
                    </FieldRow>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <FieldRow label="JDS Address">
                      <Input
                        value={(up.jds_address as string) ?? ''}
                        onChange={(e) => updUpstream(idx, 'jds_address', e.target.value)}
                        placeholder="jds.example.com"
                      />
                    </FieldRow>
                    <FieldRow label="JDS Port">
                      <Input
                        type="number"
                        value={(up.jds_port as number) ?? 3456}
                        onChange={(e) => updUpstream(idx, 'jds_port', parseInt(e.target.value) || 3456)}
                      />
                    </FieldRow>
                  </div>
                </CardContent>
              </Card>
            ))}
            <Button variant="outline" onClick={addUpstream} className="flex items-center gap-1">
              <Plus className="h-4 w-4" /> Add Upstream
            </Button>
          </div>
        </TabsContent>

        {/* Template Provider */}
        <TabsContent value="template">
          <Card className="glass-card border-none shadow-md bg-card/40">
            <CardHeader>
              <CardTitle>Template Provider</CardTitle>
              <CardDescription>Source for block templates used in Job Declaration.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FieldRow label="Provider Type">
                <Select value={tpType} onValueChange={setTpType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BitcoinCoreIpc">Bitcoin Core IPC</SelectItem>
                    <SelectItem value="Sv2Tp">SV2 Template Provider</SelectItem>
                  </SelectContent>
                </Select>
              </FieldRow>

              {tpType === 'BitcoinCoreIpc' && (
                <>
                  <FieldRow label="Network">
                    <Select
                      value={(btcIpc.network as string) ?? 'mainnet'}
                      onValueChange={(v) => updTp('network', v)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="mainnet">Mainnet</SelectItem>
                        <SelectItem value="testnet4">Testnet4</SelectItem>
                        <SelectItem value="regtest">Regtest</SelectItem>
                      </SelectContent>
                    </Select>
                  </FieldRow>
                  <div className="grid grid-cols-2 gap-4">
                    <FieldRow label="Fee Threshold (sat/vB)">
                      <Input
                        type="number"
                        value={(btcIpc.fee_threshold as number) ?? 500}
                        onChange={(e) => updTp('fee_threshold', parseInt(e.target.value) || 0)}
                      />
                    </FieldRow>
                    <FieldRow label="Min Interval (sec)">
                      <Input
                        type="number"
                        value={(btcIpc.min_interval as number) ?? 20}
                        onChange={(e) => updTp('min_interval', parseInt(e.target.value) || 0)}
                      />
                    </FieldRow>
                  </div>
                  <FieldRow label="Data Directory (optional)" hint="Bitcoin Core data dir. Leave empty to use the default.">
                    <Input
                      value={(btcIpc.data_dir as string) ?? ''}
                      onChange={(e) => {
                        if (e.target.value) {
                          updTp('data_dir', e.target.value);
                        } else {
                          setCfg((d) => {
                            const tp = (d.template_provider_type as Record<string, unknown>) ?? {};
                            const inner = { ...(tp[tpType] as Record<string, unknown>) };
                            delete inner['data_dir'];
                            return { ...d, template_provider_type: { ...tp, [tpType]: inner } };
                          });
                        }
                      }}
                      placeholder="/home/user/.bitcoin"
                    />
                  </FieldRow>
                </>
              )}

              {tpType === 'Sv2Tp' && (
                <>
                  <FieldRow label="Address" hint="Stratum V2 template provider address:port.">
                    <Input
                      value={(sv2tp.address as string) ?? ''}
                      onChange={(e) => updTp('address', e.target.value)}
                      placeholder="127.0.0.1:8442"
                    />
                  </FieldRow>
                  <FieldRow label="Public Key (optional)">
                    <Input
                      value={(sv2tp.public_key as string) ?? ''}
                      onChange={(e) => {
                        if (e.target.value) {
                          updTp('public_key', e.target.value);
                        } else {
                          setCfg((d) => {
                            const tp = (d.template_provider_type as Record<string, unknown>) ?? {};
                            const inner = { ...(tp[tpType] as Record<string, unknown>) };
                            delete inner['public_key'];
                            return { ...d, template_provider_type: { ...tp, [tpType]: inner } };
                          });
                        }
                      }}
                      className="font-mono text-xs"
                      placeholder="Base58-encoded public key"
                    />
                  </FieldRow>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Update */}
        <TabsContent value="update">
          <UpdateTab container="jd_client" />
        </TabsContent>

      </Tabs>

      {/* LogsPanel kept always-mounted so log state survives sub-tab switches */}
      <div className={activeSubTab !== 'logs' ? 'hidden' : ''}>
        <LogsPanel container="jd_client" active={activeSubTab === 'logs'} />
      </div>

      <TomlPreview cfg={cfg} />

      <ActionFooter
        onSave={handleSave}
        onRestart={handleRestart}
        restarting={restarting}
        saveStatus={saveStatus}
        restartStatus={restartStatus}
      />
    </div>
  );
}
