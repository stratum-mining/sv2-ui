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

  const [selectedPreset, setSelectedPreset] = useState(getInitialPreset());
  const [customHashrate, setCustomHashrate] = useState(
    selectedPreset === 'custom' ? existingHashrate : 0
  );
  const [customUnit, setCustomUnit] = useState<'mh' | 'gh' | 'th' | 'ph'>('th');

  const getHashrateValue = (): number => {
    if (selectedPreset === 'custom') {
      const multipliers: Record<string, number> = {
        mh: 1_000_000,
        gh: 1_000_000_000,
        th: 1_000_000_000_000,
        ph: 1_000_000_000_000_000,
      };
      return customHashrate * multipliers[customUnit];
    }
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
    if (presetId !== 'custom') {
      setCustomHashrate(0);
    }
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

      {/* Custom Input */}
      {selectedPreset === 'custom' && (
        <div className="p-4 rounded-xl border border-border bg-muted/50">
          <label className="block text-sm font-medium mb-3">Enter your hashrate</label>
          <div className="flex gap-3">
            <input
              type="number"
              value={customHashrate || ''}
              onChange={(e) => setCustomHashrate(Number(e.target.value))}
              placeholder="0"
              min="0"
              className="flex-1 h-10 px-3 rounded-lg border border-input bg-background text-sm focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/15 outline-none transition-all"
            />
            <select
              value={customUnit}
              onChange={(e) => setCustomUnit(e.target.value as 'mh' | 'gh' | 'th' | 'ph')}
              className="h-10 px-3 rounded-lg border border-input bg-background text-sm focus-visible:border-primary outline-none"
            >
              <option value="mh">MH/s</option>
              <option value="gh">GH/s</option>
              <option value="th">TH/s</option>
              <option value="ph">PH/s</option>
            </select>
          </div>
        </div>
      )}

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
