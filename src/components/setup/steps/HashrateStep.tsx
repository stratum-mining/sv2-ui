import { useState, useEffect } from 'react';
import { StepProps } from '../types';
import { Check, ChevronDown, Settings2 } from 'lucide-react';

interface HashratePreset {
  id: string;
  label: string;
  hashrate: number;
  description: string;
}

const HASHRATE_PRESETS: HashratePreset[] = [
  { id: 'bitaxe',      label: 'Bitaxe / USB Miner', hashrate: 500_000_000_000,     description: '~500 GH/s' },
  { id: 'mid-asic',    label: 'Mid-Range ASIC',       hashrate: 100_000_000_000_000, description: '~100 TH/s' },
  { id: 'high-asic',   label: 'High-End ASIC',        hashrate: 300_000_000_000_000, description: '~300 TH/s' },
  { id: 'custom',      label: 'Custom',               hashrate: 0,                   description: 'Enter your own value' },
];

const DEFAULT_SHARES_PER_MINUTE = 6;
const DEFAULT_DOWNSTREAM_EXTRANONCE2_SIZE = 4;

function isPositiveNumber(value: string): boolean {
  const parsed = Number(value);
  return value.trim() !== '' && Number.isFinite(parsed) && parsed > 0;
}

function isPositiveInteger(value: string): boolean {
  const parsed = Number(value);
  return isPositiveNumber(value) && Number.isInteger(parsed);
}

function formatHashrateDisplay(hashrate: number): string {
  if (hashrate >= 1e15) return `${(hashrate / 1e15).toFixed(2)} PH/s`;
  if (hashrate >= 1e12) return `${(hashrate / 1e12).toFixed(2)} TH/s`;
  if (hashrate >= 1e9)  return `${(hashrate / 1e9).toFixed(2)} GH/s`;
  if (hashrate >= 1e6)  return `${(hashrate / 1e6).toFixed(2)} MH/s`;
  return `${hashrate.toLocaleString()} H/s`;
}

export function HashrateStep({ data, updateData, onNext }: StepProps) {
  const existingHashrate = data.translator?.min_hashrate || 0;
  const existingSharesPerMinute = data.translator?.shares_per_minute || DEFAULT_SHARES_PER_MINUTE;
  const existingDownstreamExtranonce2Size =
    data.translator?.downstream_extranonce2_size || DEFAULT_DOWNSTREAM_EXTRANONCE2_SIZE;

  const getInitialPreset = () => {
    if (!existingHashrate) return 'mid-asic';
    return HASHRATE_PRESETS.find(p => p.hashrate === existingHashrate)?.id || 'custom';
  };

  const SLIDER_MIN = 9;
  const SLIDER_MAX = 16;
  const SLIDER_STEPS = 1000;

  const rawToSlider = (hr: number) =>
    Math.round(((Math.log10(Math.max(hr, 1e9)) - SLIDER_MIN) / (SLIDER_MAX - SLIDER_MIN)) * SLIDER_STEPS);
  const sliderToRaw = (s: number) =>
    Math.round(Math.pow(10, SLIDER_MIN + (s / SLIDER_STEPS) * (SLIDER_MAX - SLIDER_MIN)));

  const getAutoUnit = (hr: number): { label: string; multiplier: number } => {
    if (hr >= 1e15) return { label: 'PH/s', multiplier: 1e15 };
    if (hr >= 1e12) return { label: 'TH/s', multiplier: 1e12 };
    if (hr >= 1e9)  return { label: 'GH/s', multiplier: 1e9  };
    return { label: 'MH/s', multiplier: 1e6 };
  };

  const [selectedPreset, setSelectedPreset] = useState(getInitialPreset());
  const [rawHashrate, setRawHashrate] = useState(existingHashrate > 0 ? existingHashrate : 100_000_000_000_000);
  const [customInputValue, setCustomInputValue] = useState(() => {
    const initial = existingHashrate > 0 ? existingHashrate : 100_000_000_000_000;
    const { multiplier } = getAutoUnit(initial);
    return (initial / multiplier).toPrecision(6).replace(/\.?0+$/, '');
  });
  const [inputError, setInputError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [sharesPerMinute, setSharesPerMinute] = useState(String(existingSharesPerMinute));
  const [downstreamExtranonce2Size, setDownstreamExtranonce2Size] = useState(
    String(existingDownstreamExtranonce2Size),
  );

  const syncCustomInputToRaw = (raw: number) => {
    const { multiplier } = getAutoUnit(raw);
    setCustomInputValue((raw / multiplier).toPrecision(6).replace(/\.?0+$/, ''));
  };

  const handlePresetChange = (presetId: string) => {
    setSelectedPreset(presetId);
    if (presetId !== 'custom') {
      const preset = HASHRATE_PRESETS.find(p => p.id === presetId);
      if (preset) {
        setRawHashrate(preset.hashrate);
        syncCustomInputToRaw(preset.hashrate);
      }
    }
  };

  const handleSliderChange = (value: number) => {
    const raw = sliderToRaw(value);
    setRawHashrate(raw);
    syncCustomInputToRaw(raw);
  };

  const handleInputChange = (value: string) => {
    const cleaned = value.replace(/e/i, '');
    setCustomInputValue(cleaned);

    const numValue = Number(cleaned);
    if (cleaned === '' || isNaN(numValue) || numValue < 0) {
      setInputError(cleaned === '' ? 'Required' : 'Invalid hashrate');
    } else {
      setInputError(null);
      const unit = getAutoUnit(rawHashrate);
      const newRaw = Math.round(numValue * unit.multiplier);
      setRawHashrate(newRaw);
    }
  };

  const getHashrateValue = () =>
    selectedPreset === 'custom' ? rawHashrate : (HASHRATE_PRESETS.find(p => p.id === selectedPreset)?.hashrate || 0);

  const hashrate = getHashrateValue();
  const advancedIsValid =
    isPositiveNumber(sharesPerMinute) &&
    isPositiveInteger(downstreamExtranonce2Size);

  useEffect(() => {
    updateData({
      translator: {
        ...data.translator,
        user_identity: data.translator?.user_identity || '',
        enable_vardiff: true,
        aggregate_channels: data.translator?.aggregate_channels ?? false,
        min_hashrate: hashrate,
        shares_per_minute: Number(sharesPerMinute) || DEFAULT_SHARES_PER_MINUTE,
        downstream_extranonce2_size:
          Number(downstreamExtranonce2Size) || DEFAULT_DOWNSTREAM_EXTRANONCE2_SIZE,
      },
    });
  // intentionally excluded: data.translator and updateData cause infinite loop when included
    // eslint-disable-next-line react-hooks/exhaustive-deps
}, [hashrate, sharesPerMinute, downstreamExtranonce2Size]);

  return (
    <div className="space-y-8">
      <div className="text-center">
        <h2 className="text-2xl md:text-3xl font-semibold tracking-tight mb-3">Lowest Worker Hashrate</h2>
        <p className="text-lg text-muted-foreground">
          One worker? Enter its hashrate. Multiple? Use the lowest performing.
        </p>
      </div>

      <div className="p-4 rounded-xl bg-muted/40" role="note">
        <p className="text-sm text-muted-foreground">
          Difficulty per worker is automatically adjusted via variable difficulty (vardiff) algorithm.
          Give it a starting point. Using the approximate hashrate of your{' '}
          <span className="text-foreground font-medium">lowest performing worker</span> ensures every
          device can find shares right away.
        </p>
      </div>

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
              className={`relative p-4 rounded-xl border transition-all text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
                active ? 'border-primary bg-primary/[0.04]' : 'border-border bg-card hover:border-primary/45 hover:bg-primary/[0.02]'
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

      {selectedPreset === 'custom' && (() => {
        const { label } = getAutoUnit(rawHashrate);
        return (
          <div className="p-4 rounded-xl bg-muted/40 space-y-3">
            <div className="flex items-center gap-2">
              <label htmlFor="custom-hashrate" className="sr-only">Hashrate value in {label}</label>
              <input
                id="custom-hashrate"
                type="number"
                min="0"
                value={customInputValue}
                onChange={(e) => handleInputChange(e.target.value)}
                aria-describedby="hashrate-unit hashrare-error"
                className="flex-1 h-10 px-3 rounded-lg border border-input bg-background text-sm focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/15 outline-none transition-all"
              />
              <span id="hashrate-unit" className="text-sm font-medium text-muted-foreground w-12 text-right" aria-live="polite">{label}</span>
            </div>
            {inputError && (
              <div id="hashrare-error" className="text-xs text-destructive">{inputError}</div>
            )}
            <input
              type="range"
              min={0}
              max={SLIDER_STEPS}
              value={rawToSlider(rawHashrate)}
              onChange={(e) => handleSliderChange(Number(e.target.value))}
              aria-label={`Hashrate: ${formatHashrateDisplay(rawHashrate)}`}
              aria-valuemin={0}
              aria-valuemax={SLIDER_STEPS}
              aria-valuenow={rawToSlider(rawHashrate)}
              className="w-full accent-primary"
            />
            <div className="flex justify-between text-xs text-muted-foreground select-none">
              <span>1 GH/s</span><span>8 GH/s</span><span>56 GH/s</span><span>420 GH/s</span><span>3 TH/s</span><span>24 TH/s</span><span>180 TH/s</span><span>1 PH/s</span><span>10 PH/s</span>
            </div>
          </div>
        );
      })()}

      {hashrate > 0 && (() => {
        const display = formatHashrateDisplay(hashrate);
        return (
          <div className="p-4 rounded-xl bg-primary/[0.08] text-center">
            <div className="text-sm text-muted-foreground mb-1">Starting difficulty per miner</div>
            <div className="text-2xl font-semibold text-primary">{display}</div>
          </div>
        );
      })()}

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
          <div className="border-t border-border p-4 space-y-4">
            <div>
              <label htmlFor="shares-per-minute" className="block text-sm font-medium mb-2">
                Shares Per Minute
              </label>
              <input
                id="shares-per-minute"
                type="number"
                min="0.1"
                step="0.1"
                value={sharesPerMinute}
                onChange={(e) => setSharesPerMinute(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/15 outline-none transition-all"
              />
              {!isPositiveNumber(sharesPerMinute) && (
                <p className="text-xs text-destructive mt-1">Enter a value greater than 0.</p>
              )}
              <p className="text-xs text-muted-foreground mt-2">
                Target share rate used by variable difficulty mechanism by the Stratum V2 Client.
              </p>
            </div>

            <div>
              <label htmlFor="downstream-extranonce2-size" className="block text-sm font-medium mb-2">
                Downstream Extranonce2 Size
              </label>
              <input
                id="downstream-extranonce2-size"
                type="number"
                min="1"
                step="1"
                value={downstreamExtranonce2Size}
                onChange={(e) => setDownstreamExtranonce2Size(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/15 outline-none transition-all"
              />
              {!isPositiveInteger(downstreamExtranonce2Size) && (
                <p className="text-xs text-destructive mt-1">Enter a whole number greater than 0.</p>
              )}
              <p className="text-xs text-muted-foreground mt-2">
                Extranonce2 bytes assigned to downstream SV1 connections.
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="flex justify-center">
        <button
          type="button"
          onClick={onNext}
          disabled={hashrate <= 0 || !advancedIsValid}
          className="h-11 px-10 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 transition-colors font-medium"
        >
          Continue
        </button>
      </div>
    </div>
  );
}
