import { useState, useEffect } from 'react';
import { StepProps } from '../types';
import {
  DEFAULT_MIN_HASHRATE,
  getMinerTelemetryCidrError,
  normalizeMinerTelemetryCidr,
} from '@sv2-ui/shared';
import { Check, ChevronDown, Settings2 } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { FieldError } from '@/components/ui/field-error';
import {
  AdvancedMiningConfigForm,
  createAdvancedMiningConfigValues,
  isAdvancedMiningConfigValid,
  parseAdvancedMiningConfigValues,
} from '@/components/mining/AdvancedMiningConfigForm';
import { HashrateInput } from '@/components/ui/hashrate-input';
import { formatHashrate } from '@/lib/utils';

interface HashratePreset {
  id: string;
  label: string;
  hashrate: number;
  description: string;
}

const HASHRATE_PRESETS: HashratePreset[] = [
  { id: 'bitaxe', label: 'Bitaxe / USB Miner', hashrate: 500_000_000_000, description: '~500 GH/s' },
  { id: 'mid-asic', label: 'Mid-Range ASIC', hashrate: DEFAULT_MIN_HASHRATE, description: '~100 TH/s' },
  { id: 'high-asic', label: 'High-End ASIC', hashrate: 300_000_000_000_000, description: '~300 TH/s' },
  { id: 'custom', label: 'Custom', hashrate: 0, description: 'Enter your own value' },
];

export function HashrateStep({ data, updateData, onNext }: StepProps) {
  const isSoloPool = data.miningMode === 'solo' && data.mode === 'no-jd';
  const existingHashrate = data.translator?.min_hashrate || 0;

  const getInitialPreset = () => {
    if (!existingHashrate) return 'mid-asic';
    return HASHRATE_PRESETS.find(p => p.hashrate === existingHashrate)?.id || 'custom';
  };

  const [selectedPreset, setSelectedPreset] = useState(getInitialPreset());
  const [rawHashrate, setRawHashrate] = useState(existingHashrate > 0 ? existingHashrate : DEFAULT_MIN_HASHRATE);
  const [hashrateInputValid, setHashrateInputValid] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [minerTelemetryCidr, setMinerTelemetryCidr] = useState(data.miner_telemetry_cidr ?? '');
  const [advancedConfig, setAdvancedConfig] = useState(() => (
    createAdvancedMiningConfigValues(data.translator)
  ));

  const handlePresetChange = (presetId: string) => {
    setSelectedPreset(presetId);
    if (presetId !== 'custom') {
      const preset = HASHRATE_PRESETS.find(p => p.id === presetId);
      if (preset) {
        setRawHashrate(preset.hashrate);
      }
    }
  };

  const hashrate = rawHashrate;
  const minerTelemetryCidrError = getMinerTelemetryCidrError(minerTelemetryCidr);
  const advancedIsValid =
    !minerTelemetryCidrError &&
    isAdvancedMiningConfigValid(advancedConfig);

  useEffect(() => {
    const parsedAdvancedConfig = parseAdvancedMiningConfigValues(advancedConfig);
    updateData({
      miner_telemetry_cidr: normalizeMinerTelemetryCidr(minerTelemetryCidr),
      translator: {
        enable_vardiff: true,
        aggregate_channels: data.translator?.aggregate_channels ?? false,
        ...(isSoloPool ? { verify_payout: parsedAdvancedConfig.verifyPayout } : {}),
        min_hashrate: hashrate,
        shares_per_minute: parsedAdvancedConfig.sharesPerMinute,
        downstream_extranonce2_size: parsedAdvancedConfig.downstreamExtranonce2Size,
      },
    });
    // intentionally excluded: data.translator and updateData cause infinite loop when included
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hashrate, minerTelemetryCidr, advancedConfig, isSoloPool]);

  return (
    <div className="space-y-8">
      <div className="text-center">
        <h2 className="text-2xl md:text-3xl font-semibold tracking-tight mb-3">Lowest Worker Hashrate</h2>
        <p className="text-lg text-muted-foreground">
          One worker? Enter its hashrate. Multiple? Use the lowest performing.
        </p>
      </div>

      <Alert variant="neutral">
        <p>
          Difficulty per worker is automatically adjusted via variable difficulty (vardiff) algorithm.
          Give it a starting point. Using the approximate hashrate of your{' '}
          <span className="text-foreground font-medium">lowest performing worker</span> ensures every
          device can find shares right away.
        </p>
      </Alert>

      <div className="grid grid-cols-2 gap-3" role="group" aria-labelledby="hashrate-group-label">
        <span id="hashrate-group-label" className="sr-only">Select hashrate preset</span>
        {HASHRATE_PRESETS.map((preset) => {
          const active = selectedPreset === preset.id;
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => handlePresetChange(preset.id)}
              aria-pressed={active}
              className={`relative p-4 rounded-xl border transition-all text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${active ? 'border-primary bg-primary/[0.04]' : 'border-border bg-card hover:border-primary/45 hover:bg-primary/[0.02]'
                }`}
            >
              {active && <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-primary flex items-center justify-center" aria-hidden="true"><Check className="w-3 h-3 text-background" /></div>}
              <div className="pr-6">
                <div className={`font-medium text-sm mb-1 ${active ? 'text-primary' : ''}`}>{preset.label}</div>
                <div className="text-xs text-muted-foreground leading-relaxed">{preset.description}</div>
              </div>
            </button>
          );
        })}
      </div>

      {selectedPreset === 'custom' && (
        <HashrateInput
          idPrefix="custom-hashrate"
          value={rawHashrate}
          onChange={setRawHashrate}
          onValidityChange={setHashrateInputValid}
        />
      )}

      {hashrate > 0 && (() => {
        const display = formatHashrate(hashrate);
        return (
          <div className="p-4 rounded-xl bg-primary/[0.08] text-center">
            <div className="text-sm text-muted-foreground mb-1">Starting difficulty per miner</div>
            <div className="text-2xl font-semibold text-primary">{display}</div>
          </div>
        );
      })()}

      <div className="p-4 rounded-xl border border-border bg-card space-y-3">
        <div>
          <label htmlFor="miner-telemetry-cidr" className="block text-sm font-medium mb-2">
            Miners' LAN CIDR <span className="text-muted-foreground font-normal">(optional)</span>
          </label>
          <input
            id="miner-telemetry-cidr"
            type="text"
            value={minerTelemetryCidr}
            onChange={(event) => setMinerTelemetryCidr(event.target.value)}
            placeholder="192.168.1.0/24"
            autoComplete="off"
            aria-invalid={Boolean(minerTelemetryCidrError)}
            aria-describedby="miner-telemetry-cidr-desc miner-telemetry-cidr-error"
            className="w-full h-10 px-3 rounded-lg border border-input bg-background font-mono text-sm focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/15 outline-none transition-all"
          />
          <FieldError message={minerTelemetryCidrError} />
          <p id="miner-telemetry-cidr-desc" className="text-xs text-muted-foreground mt-2">
            Recommended for better telemetry. Use the private LAN subnet where miners expose
            their web/API interface.
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card">
        <button
          type="button"
          onClick={() => setShowAdvanced((open) => !open)}
          aria-expanded={showAdvanced}
          className="w-full p-4 flex items-center justify-between gap-3 text-left hover:bg-muted/40 rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          <span className="flex items-center gap-2">
            <Settings2 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <span className="text-sm font-semibold">Advanced Options</span>
          </span>
          <ChevronDown
            className={`h-4 w-4 text-muted-foreground transition-transform ${showAdvanced ? 'rotate-180' : ''}`}
            aria-hidden="true"
          />
        </button>

        {showAdvanced && (
          <div className="border-t border-border p-4">
            <AdvancedMiningConfigForm
              idPrefix="setup-advanced-mining"
              value={advancedConfig}
              onChange={setAdvancedConfig}
              showCoinbaseVerification={isSoloPool}
            />
          </div>
        )}
      </div>

      <div className="flex justify-center">
        <button
          type="button"
          onClick={onNext}
          disabled={hashrate <= 0 || (selectedPreset === 'custom' && !hashrateInputValid) || !advancedIsValid}
          className="h-11 px-10 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 transition-colors font-medium"
        >
          Continue
        </button>
      </div>
    </div>
  );
}