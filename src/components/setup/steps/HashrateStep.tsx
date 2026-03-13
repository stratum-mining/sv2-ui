import { useState, useEffect } from 'react';
import { StepProps } from '../types';
import { HelpCircle, Check } from 'lucide-react';

interface HashratePreset {
  id: string;
  label: string;
  hashrate: number;
  description: string;
}

const HASHRATE_PRESETS: HashratePreset[] = [
  { id: 'bitaxe',      label: 'Bitaxe / USB Miner', hashrate: 500_000_000_000,       description: '~500 GH/s' },
  { id: 'single-asic', label: 'Single ASIC',         hashrate: 100_000_000_000_000,   description: '~100 TH/s' },
  { id: 'small-farm',  label: 'Small Farm',           hashrate: 1_000_000_000_000_000, description: '~1 PH/s'   },
  { id: 'custom',      label: 'Custom',               hashrate: 0,                     description: 'Enter your own value' },
];

function formatHashrateDisplay(hashrate: number): string {
  if (hashrate >= 1e15) return `${(hashrate / 1e15).toFixed(2)} PH/s`;
  if (hashrate >= 1e12) return `${(hashrate / 1e12).toFixed(2)} TH/s`;
  if (hashrate >= 1e9)  return `${(hashrate / 1e9).toFixed(2)} GH/s`;
  if (hashrate >= 1e6)  return `${(hashrate / 1e6).toFixed(2)} MH/s`;
  return `${hashrate.toLocaleString()} H/s`;
}

export function HashrateStep({ data, updateData, onNext }: StepProps) {
  const existingHashrate = data.translator?.min_hashrate || 0;

  const getInitialPreset = () => {
    if (!existingHashrate) return 'single-asic';
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

  const getHashrateValue = () =>
    selectedPreset === 'custom' ? rawHashrate : (HASHRATE_PRESETS.find(p => p.id === selectedPreset)?.hashrate || 0);

  const hashrate = getHashrateValue();

  useEffect(() => {
    updateData({
      translator: {
        ...data.translator,
        user_identity: data.translator?.user_identity || '',
        enable_vardiff: data.translator?.enable_vardiff ?? true,
        aggregate_channels: data.translator?.aggregate_channels ?? false,
        min_hashrate: hashrate,
      },
    });
  }, [hashrate, data.translator, updateData]);

  return (
    <div className="space-y-8">
      <div className="text-center">
        <h2 className="text-2xl md:text-3xl font-semibold tracking-tight mb-3">Expected Hashrate</h2>
        <p className="text-lg text-muted-foreground">
          What's the total hashrate you'll point to this SV2 client?
        </p>
      </div>

      <div className="p-4 rounded-xl bg-muted/40 flex gap-3" role="note">
        <HelpCircle className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">
          This sets the initial mining difficulty. The SV2 client will automatically adjust via vardiff.
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
              onClick={() => setSelectedPreset(preset.id)}
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
        const { label, multiplier } = getAutoUnit(rawHashrate);
        return (
          <div className="p-4 rounded-xl bg-muted/40 space-y-3">
            <div className="flex items-center gap-2">
              <label htmlFor="custom-hashrate" className="sr-only">Hashrate value in {label}</label>
              <input
                id="custom-hashrate"
                type="number"
                min="0"
                value={parseFloat((rawHashrate / multiplier).toPrecision(6))}
                onChange={(e) => { const v = Number(e.target.value); if (v >= 0) setRawHashrate(v * multiplier); }}
                aria-describedby="hashrate-unit"
                className="flex-1 h-10 px-3 rounded-lg border border-input bg-background text-sm focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/15 outline-none transition-all"
              />
              <span id="hashrate-unit" className="text-sm font-medium text-muted-foreground w-12 text-right" aria-live="polite">{label}</span>
            </div>
            <input
              type="range"
              min={0}
              max={SLIDER_STEPS}
              value={rawToSlider(rawHashrate)}
              onChange={(e) => setRawHashrate(sliderToRaw(Number(e.target.value)))}
              aria-label={`Hashrate: ${formatHashrateDisplay(rawHashrate)}`}
              aria-valuemin={0}
              aria-valuemax={SLIDER_STEPS}
              aria-valuenow={rawToSlider(rawHashrate)}
              className="w-full accent-primary"
            />
            <div className="flex justify-between text-xs text-muted-foreground select-none">
              <span>1 GH/s</span><span>1 TH/s</span><span>100 TH/s</span><span>1 PH/s</span><span>10 PH/s</span>
            </div>
          </div>
        );
      })()}

      {hashrate > 0 && (
        <div className="p-4 rounded-xl bg-primary/[0.08] text-center">
          <div className="text-sm text-muted-foreground mb-1">Starting difficulty for</div>
          <div className="text-2xl font-semibold text-primary">{formatHashrateDisplay(hashrate)}</div>
        </div>
      )}

      <div className="flex justify-center">
        <button
          type="button"
          onClick={onNext}
          disabled={hashrate <= 0}
          className="h-11 px-10 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 transition-colors font-medium"
        >
          Continue
        </button>
      </div>
    </div>
  );
}
