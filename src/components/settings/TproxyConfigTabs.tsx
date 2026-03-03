import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, ScrollText, Trash2 } from 'lucide-react';
import { FieldRow, TomlPreview, ActionFooter, type StatusMsg } from './JdcConfigTabs';
import { LogsPanel } from './LogsPanel';
import { UpdateTab } from './UpdateTab';

// ─── Default config ──────────────────────────────────────────────────────────

const TPROXY_DEFAULTS: Record<string, unknown> = {
  downstream_address: '0.0.0.0',
  downstream_port: 34255,
  max_supported_version: 2,
  min_supported_version: 2,
  downstream_extranonce2_size: 4,
  user_identity: '',
  aggregate_channels: false,
  monitoring_address: '0.0.0.0:9092',
  downstream_difficulty_config: {
    min_individual_miner_hashrate: 10_000_000_000_000,
    shares_per_minute: 20,
    enable_vardiff: true,
    job_keepalive_interval_secs: 60,
  },
  upstreams: [],
};

// ─── tProxy structured tabs ──────────────────────────────────────────────────

export function TproxyTabs() {
  const [activeSubTab, setActiveSubTab] = useState('basic');
  const [loading, setLoading] = useState(true);
  const [cfg, setCfg] = useState<Record<string, unknown>>(TPROXY_DEFAULTS);
  const [saveStatus, setSaveStatus] = useState<StatusMsg | null>(null);
  const [restarting, setRestarting] = useState(false);
  const [restartStatus, setRestartStatus] = useState<StatusMsg | null>(null);

  useEffect(() => {
    fetch('/api/config?service=tproxy&format=json')
      .then((r) => r.json())
      .then((d) => {
        setCfg(d.data ?? TPROXY_DEFAULTS);
        setLoading(false);
      })
      .catch(() => {
        setCfg(TPROXY_DEFAULTS);
        setLoading(false);
      });
  }, []);

  const upd = (key: string, val: unknown) =>
    setCfg((d) => ({ ...d, [key]: val }));

  const diff = (cfg.downstream_difficulty_config as Record<string, unknown>) ?? {};

  const updDiff = (key: string, val: unknown) =>
    setCfg((d) => ({
      ...d,
      downstream_difficulty_config: {
        ...(d.downstream_difficulty_config as Record<string, unknown>),
        [key]: val,
      },
    }));

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
        { address: '', port: 3333, authority_pubkey: '' },
      ],
    }));

  const removeUpstream = (idx: number) =>
    setCfg((d) => ({
      ...d,
      upstreams: ((d.upstreams as Array<Record<string, unknown>>) ?? []).filter((_, i) => i !== idx),
    }));

  const minHashrateHz = (diff.min_individual_miner_hashrate as number) ?? 0;
  const minHashrateTh = minHashrateHz / 1e12;

  const handleSave = async () => {
    setSaveStatus(null);
    try {
      const r = await fetch('/api/config?service=tproxy&format=json', {
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
        body: JSON.stringify({ containers: ['tproxy'] }),
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
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="basic">Basic</TabsTrigger>
          <TabsTrigger value="mining">Mining</TabsTrigger>
          <TabsTrigger value="upstreams">Upstreams</TabsTrigger>
          <TabsTrigger value="difficulty">Difficulty</TabsTrigger>
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
              <CardDescription>Downstream connection and protocol version bounds.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FieldRow label="Downstream Address" hint="Address for SV1 miners to connect to.">
                  <Input
                    value={(cfg.downstream_address as string) ?? ''}
                    onChange={(e) => upd('downstream_address', e.target.value)}
                    placeholder="0.0.0.0"
                  />
                </FieldRow>
                <FieldRow label="Downstream Port">
                  <Input
                    type="number"
                    value={(cfg.downstream_port as number) ?? 34255}
                    onChange={(e) => upd('downstream_port', parseInt(e.target.value) || 34255)}
                  />
                </FieldRow>
              </div>
              <FieldRow label="Extranonce2 Size (bytes)">
                <Input
                  type="number"
                  value={(cfg.downstream_extranonce2_size as number) ?? 4}
                  onChange={(e) => { const v = parseInt(e.target.value); upd('downstream_extranonce2_size', isNaN(v) ? 4 : v); }}
                  className="max-w-32"
                />
              </FieldRow>
              <FieldRow label="Monitoring Address (optional)">
                <Input
                  value={(cfg.monitoring_address as string) ?? ''}
                  onChange={(e) => upd('monitoring_address', e.target.value)}
                  placeholder="0.0.0.0:9092"
                />
              </FieldRow>
              <div className="grid grid-cols-2 gap-4">
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
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Mining */}
        <TabsContent value="mining">
          <Card className="glass-card border-none shadow-md bg-card/40">
            <CardHeader>
              <CardTitle>Mining Settings</CardTitle>
              <CardDescription>Identity and channel aggregation.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FieldRow label="User Identity" hint="Username sent upstream to identify this proxy.">
                <Input
                  value={(cfg.user_identity as string) ?? ''}
                  onChange={(e) => upd('user_identity', e.target.value)}
                />
              </FieldRow>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="aggregate_channels"
                  checked={(cfg.aggregate_channels as boolean) ?? false}
                  onChange={(e) => upd('aggregate_channels', e.target.checked)}
                  className="h-4 w-4 rounded border-border cursor-pointer accent-primary"
                />
                <Label htmlFor="aggregate_channels">Aggregate Channels</Label>
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
                  <div className="grid grid-cols-2 gap-4">
                    <FieldRow label="Address">
                      <Input
                        value={(up.address as string) ?? ''}
                        onChange={(e) => updUpstream(idx, 'address', e.target.value)}
                        placeholder="pool.example.com"
                      />
                    </FieldRow>
                    <FieldRow label="Port">
                      <Input
                        type="number"
                        value={(up.port as number) ?? 3333}
                        onChange={(e) => updUpstream(idx, 'port', parseInt(e.target.value) || 3333)}
                      />
                    </FieldRow>
                  </div>
                  <FieldRow label="Authority Public Key">
                    <Input
                      value={(up.authority_pubkey as string) ?? ''}
                      onChange={(e) => updUpstream(idx, 'authority_pubkey', e.target.value)}
                      className="font-mono text-xs"
                      placeholder="Base58-encoded public key"
                    />
                  </FieldRow>
                </CardContent>
              </Card>
            ))}
            <Button variant="outline" onClick={addUpstream} className="flex items-center gap-1">
              <Plus className="h-4 w-4" /> Add Upstream
            </Button>
          </div>
        </TabsContent>

        {/* Difficulty */}
        <TabsContent value="difficulty">
          <Card className="glass-card border-none shadow-md bg-card/40">
            <CardHeader>
              <CardTitle>Difficulty Settings</CardTitle>
              <CardDescription>Vardiff and hashrate configuration for downstream miners.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FieldRow label="Min Miner Hashrate (Th/s)" hint="Minimum expected hashrate per miner, stored internally as H/s.">
                <Input
                  type="number"
                  step="0.001"
                  value={minHashrateTh}
                  onChange={(e) => updDiff('min_individual_miner_hashrate', (parseFloat(e.target.value) || 0) * 1e12)}
                  placeholder="10"
                />
              </FieldRow>
              <FieldRow label="Shares Per Minute">
                <Input
                  type="number"
                  value={(diff.shares_per_minute as number) ?? 20}
                  onChange={(e) => updDiff('shares_per_minute', parseInt(e.target.value) || 0)}
                  className="max-w-32"
                />
              </FieldRow>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="enable_vardiff"
                  checked={(diff.enable_vardiff as boolean) ?? true}
                  onChange={(e) => updDiff('enable_vardiff', e.target.checked)}
                  className="h-4 w-4 rounded border-border cursor-pointer accent-primary"
                />
                <Label htmlFor="enable_vardiff">Enable Vardiff</Label>
              </div>
              <FieldRow label="Job Keepalive Interval (sec)">
                <Input
                  type="number"
                  value={(diff.job_keepalive_interval_secs as number) ?? 60}
                  onChange={(e) => updDiff('job_keepalive_interval_secs', parseInt(e.target.value) || 0)}
                  className="max-w-32"
                />
              </FieldRow>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Update */}
        <TabsContent value="update">
          <UpdateTab container="tproxy" />
        </TabsContent>

      </Tabs>

      {/* LogsPanel kept always-mounted so log state survives sub-tab switches */}
      <div className={activeSubTab !== 'logs' ? 'hidden' : ''}>
        <LogsPanel container="tproxy" active={activeSubTab === 'logs'} />
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
