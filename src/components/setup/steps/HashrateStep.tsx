import { useState, useEffect } from 'react';
import { StepProps } from '../types';
import { Zap, HelpCircle } from 'lucide-react';

interface HashratePreset {
  id: string;
  label: string;
  hashrate: number;
  description: string;
}

const HASHRATE_PRESETS: HashratePreset[] = [
  {
    id: 'bitaxe',
    label: 'Bitaxe / USB Miner',
    hashrate: 500_000_000_000,
    description: '~500 GH/s',
  },
  {
    id: 'single-asic',
    label: 'Single ASIC',
    hashrate: 100_000_000_000_000,
    description: '~100 TH/s',
  },
  {
    id: 'small-farm',
    label: 'Small Farm',
    hashrate: 1_000_000_000_000_000,
    description: '~1 PH/s',
  },
  {
    id: 'custom',
    label: 'Custom',
    hashrate: 0,
    description: 'Enter your own value',
  },
];

function formatHashrateDisplay(hashrate: number): string {
  if (hashrate >= 1_000_000_000_000_000) {
    return `${(hashrate / 1_000_000_000_000_000).toFixed(2)} PH/s`;
  }
  if (hashrate >= 1_000_000_000_000) {
    return `${(hashrate / 1_000_000_000_000).toFixed(2)} TH/s`;
  }
  if (hashrate >= 1_000_000_000) {
    return `${(hashrate / 1_000_000_000).toFixed(2)} GH/s`;
  }
  if (hashrate >= 1_000_000) {
    return `${(hashrate / 1_000_000).toFixed(2)} MH/s`;
  }
  return `${hashrate.toLocaleString()} H/s`;
}

/**
 * Step: Expected Hashrate Configuration
 * Used to set min_individual_miner_hashrate for difficulty calculation.
 */
export function HashrateStep({ data, updateData, onNext }: StepProps) {
  const existingHashrate = data.translator?.min_hashrate || 0;

  const getInitialPreset = () => {
    if (!existingHashrate) return 'single-asic';
    const match = HASHRATE_PRESETS.find(p => p.hashrate === existingHashrate);
    return match?.id || 'custom';
  };

  const SLIDER_MIN = 9;  // log10(1 GH/s)
  const SLIDER_MAX = 16; // log10(10 PH/s)
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
  const [rawHashrate, setRawHashrate] = useState(
    existingHashrate > 0 ? existingHashrate : 100_000_000_000_000 // default 100 TH/s
  );

  const getHashrateValue = (): number => {
    if (selectedPreset === 'custom') return rawHashrate;
    return HASHRATE_PRESETS.find(p => p.id === selectedPreset)?.hashrate || 0;
  };

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

  const handlePresetClick = (presetId: string) => {
    setSelectedPreset(presetId);
  };

  const isValid = hashrate > 0;

  return (
    <div className="space-y-8">
      <div className="text-center">
        <h2 className="text-2xl md:text-3xl font-semibold tracking-tight mb-3">
          Expected Hashrate
        </h2>
        <p className="text-lg text-muted-foreground">
          What's the total hashrate you'll point to this SV2 client?
        </p>
      </div>

      {/* Info */}
      <div className="p-4 rounded-xl bg-info/10 border border-info/20">
        <div className="flex gap-3">
          <HelpCircle className="h-5 w-5 text-info flex-shrink-0 mt-0.5" />
          <div className="text-sm text-muted-foreground">
            <p>
              This helps configure the initial mining difficulty. The SV2 client will automatically 
              adjust difficulty based on actual hashrate (vardiff) in any case.
            </p>
          </div>
        </div>
      </div>

      {/* Preset Selection */}
      <div className="grid grid-cols-2 gap-3">
        {HASHRATE_PRESETS.map((preset) => (
          <button
            key={preset.id}
            onClick={() => handlePresetClick(preset.id)}
            className={`p-4 rounded-xl border-2 transition-all text-left ${
              selectedPreset === preset.id
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/50 hover:bg-accent'
            }`}
          >
            <div className="flex items-start gap-3">
              <Zap className={`h-5 w-5 mt-0.5 ${selectedPreset === preset.id ? 'text-primary' : 'text-muted-foreground'}`} />
              <div>
                <div className="font-medium">{preset.label}</div>
                <div className="text-sm text-muted-foreground">{preset.description}</div>
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Custom Slider */}
      {selectedPreset === 'custom' && (() => {
        const { label, multiplier } = getAutoUnit(rawHashrate);
        return (
          <div className="p-4 rounded-xl border border-border bg-muted/50 space-y-3">
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                value={parseFloat((rawHashrate / multiplier).toPrecision(6))}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (v >= 0) setRawHashrate(v * multiplier);
                }}
                className="flex-1 h-10 px-3 rounded-lg border border-input bg-background text-sm focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/15 outline-none transition-all"
              />
              <span className="text-sm font-medium text-muted-foreground w-12 text-right">{label}</span>
            </div>
            <input
              type="range"
              min={0}
              max={SLIDER_STEPS}
              value={rawToSlider(rawHashrate)}
              onChange={(e) => setRawHashrate(sliderToRaw(Number(e.target.value)))}
              className="w-full accent-primary"
            />
            <div className="flex justify-between text-xs text-muted-foreground select-none">
              <span>1 GH/s</span>
              <span>1 TH/s</span>
              <span>100 TH/s</span>
              <span>1 PH/s</span>
              <span>10 PH/s</span>
            </div>
          </div>
        );
      })()}

      {/* Summary */}
      {hashrate > 0 && (
        <div className="p-4 rounded-xl border border-primary/20 bg-primary/5 text-center">
          <div className="text-sm text-muted-foreground mb-1">Starting difficulty for</div>
          <div className="text-2xl font-semibold text-primary">
            {formatHashrateDisplay(hashrate)}
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="flex justify-end">
        <button
          onClick={onNext}
          disabled={!isValid}
          className="h-10 px-8 rounded-full bg-foreground text-background hover:bg-foreground/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
        >
          Continue
        </button>
      </div>
    </div>
  );
}
