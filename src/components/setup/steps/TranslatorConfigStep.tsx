import { useState, useEffect } from 'react';
import { StepProps, TranslatorConfig } from '../types';
import { Switch } from '@/components/ui/switch';
import { Info } from 'lucide-react';

/**
 * Step 5 (or 3 for solo): Translator Proxy Configuration (sv2-wizard inspired)
 */
export function TranslatorConfigStep({ data, updateData, onNext }: StepProps) {
  const isSoloMode = data.miningMode === 'solo';
  
  const [config, setConfig] = useState<TranslatorConfig>(
    data.translator || {
      user_identity: '',
      enable_vardiff: false,
      aggregate_channels: false,
      min_hashrate: 0,
    }
  );

  useEffect(() => {
    updateData({ translator: config });
  }, [config, updateData]);

  const handleChange = (field: keyof TranslatorConfig, value: string | boolean) => {
    setConfig({ ...config, [field]: value });
  };

  const isValid = config.user_identity.length > 0;

  const getUserIdentityLabel = () => {
    if (isSoloMode) {
      return 'Bitcoin Address';
    }
    return 'Pool Username';
  };

  const getUserIdentityPlaceholder = () => {
    if (isSoloMode) {
      return 'bc1q...';
    }
    return 'username.worker1';
  };

  const getUserIdentityDescription = () => {
    if (isSoloMode) {
      return 'Your Bitcoin address where you want to receive mining rewards';
    }
    return 'Your pool account username (e.g., username.workername)';
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

      {/* Info Card */}
      <div className="p-4 rounded-xl bg-success/10 border border-success/20">
        <div className="flex gap-3">
          <Info className="h-5 w-5 text-success flex-shrink-0 mt-0.5" />
          <div className="text-sm text-muted-foreground">
            <p>
              The Translator Proxy bridges your SV1 mining hardware to the SV2 {isSoloMode ? 'solo pool' : 'pool'}.
              Your miners will connect to the Translator on port <code className="text-xs bg-muted px-1 py-0.5 rounded">34255</code>.
            </p>
          </div>
        </div>
      </div>

      {/* Configuration Form */}
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-2">
            {getUserIdentityLabel()} <span className="text-primary">*</span>
          </label>
          <input
            type="text"
            value={config.user_identity}
            onChange={(e) => handleChange('user_identity', e.target.value)}
            placeholder={getUserIdentityPlaceholder()}
            className="w-full h-10 px-3 rounded-lg border border-input bg-background focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/15 outline-none transition-all font-mono text-sm"
          />
          <p className="text-xs text-muted-foreground mt-2">
            {getUserIdentityDescription()}
          </p>
        </div>

        {/* Advanced Options */}
        <div className="p-6 rounded-xl border border-border bg-muted space-y-4">
          <div className="text-sm font-semibold mb-4">Advanced Options</div>
          
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <label className="text-sm font-medium">Variable Difficulty</label>
              <p className="text-xs text-muted-foreground">
                Adjust difficulty per miner based on hashrate
              </p>
            </div>
            <Switch
              checked={config.enable_vardiff}
              onCheckedChange={(checked) => handleChange('enable_vardiff', checked)}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <label className="text-sm font-medium">Channel Aggregation</label>
              <p className="text-xs text-muted-foreground">
                Aggregate multiple miners into fewer upstream channels
              </p>
            </div>
            <Switch
              checked={config.aggregate_channels}
              onCheckedChange={(checked) => handleChange('aggregate_channels', checked)}
            />
          </div>
        </div>
      </div>

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
