import { useState, useEffect } from 'react';
import { StepProps, TranslatorConfig } from '../types';
import { Switch } from '@/components/ui/switch';
import { Info } from 'lucide-react';
import { TRANSLATOR_PORT } from '@/lib/ports';
export function TranslatorConfigStep({ data, updateData, onNext }: StepProps) {
  const isSoloMode = data.miningMode === 'solo';
  
  const [config, setConfig] = useState<TranslatorConfig>(
    data.translator || {
      enable_vardiff: false,
      aggregate_channels: false,
      min_hashrate: 0,
      shares_per_minute: 6,
      downstream_extranonce2_size: 4,
    }
  );

  useEffect(() => {
    updateData({ translator: config });
  }, [config, updateData]);

  const handleChange = (field: keyof TranslatorConfig, value: string | boolean) => {
    setConfig({ ...config, [field]: value });
  };

  return (
    <div className="space-y-8">
      <div className="text-center">
        <h2 className="text-2xl md:text-3xl font-semibold tracking-tight mb-3">
          Translator Proxy Configuration
        </h2>
        <p className="text-lg text-muted-foreground">
          Configure how your SV1 miners connect to the SV2 network
        </p>
      </div>

      <div className="p-4 rounded-xl bg-success/10 border border-success/20" role="note">
        <div className="flex gap-3">
          <Info className="h-5 w-5 text-success flex-shrink-0 mt-0.5" aria-hidden="true" />
          <div className="text-sm text-muted-foreground">
            <p>
              The Translator Proxy bridges your SV1 mining hardware to the SV2 {isSoloMode ? 'solo pool' : 'pool'}.
              Your miners will connect to the Translator on port <code className="text-xs bg-muted px-1 py-0.5 rounded">{TRANSLATOR_PORT}</code>.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="p-6 rounded-xl border border-border bg-muted space-y-4">
          <div className="text-sm font-semibold mb-4">Advanced Options</div>

          <div className="flex items-center justify-between gap-4">
            <div className="space-y-0.5">
              <p id="vardiff-label" className="text-sm font-medium">Variable Difficulty</p>
              <p id="vardiff-desc" className="text-xs text-muted-foreground">
                Adjust difficulty per miner based on hashrate
              </p>
            </div>
            <Switch
              id="vardiff-switch"
              checked={config.enable_vardiff}
              onCheckedChange={(checked) => handleChange('enable_vardiff', checked)}
              aria-labelledby="vardiff-label"
              aria-describedby="vardiff-desc"
            />
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="space-y-0.5">
              <p id="aggregation-label" className="text-sm font-medium">Channel Aggregation</p>
              <p id="aggregation-desc" className="text-xs text-muted-foreground">
                Aggregate multiple miners into fewer upstream channels
              </p>
            </div>
            <Switch
              id="aggregation-switch"
              checked={config.aggregate_channels}
              onCheckedChange={(checked) => handleChange('aggregate_channels', checked)}
              aria-labelledby="aggregation-label"
              aria-describedby="aggregation-desc"
            />
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex justify-center">
        <button
          type="button"
          onClick={onNext}
          disabled={false}
          className="h-11 px-10 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 transition-colors font-medium"
        >
          Continue
        </button>
      </div>
    </div>
  );
}
