import { useState, useEffect } from 'react';
import { StepProps, JdcConfig } from '../types';
import { Info } from 'lucide-react';

/**
 * Step 4 (JD mode only): JDC Configuration (sv2-wizard inspired)
 */
export function JdcConfigStep({ data, updateData, onNext }: StepProps) {
  const [config, setConfig] = useState<JdcConfig>(
    data.jdc || {
      user_identity: 'miner.worker1',
      jdc_signature: '',
      coinbase_reward_address: '',
    }
  );

  useEffect(() => {
    updateData({ jdc: config });
  }, [config, updateData]);

  const handleChange = (field: keyof JdcConfig, value: string) => {
    setConfig({ ...config, [field]: value });
  };

  const isValid = 
    config.user_identity.length > 0 && 
    config.coinbase_reward_address.length > 0;

  return (
    <div className="space-y-8">
      <div className="text-center">
        <h2 className="text-2xl md:text-3xl font-semibold tracking-tight mb-3">
          Job Declarator Configuration
        </h2>
        <p className="text-lg text-muted-foreground">
          Configure your Job Declarator Client settings
        </p>
      </div>

      {/* Info Card */}
      <div className="p-4 rounded-xl bg-info/10 border border-info/20">
        <div className="flex gap-3">
          <Info className="h-5 w-5 text-info flex-shrink-0 mt-0.5" />
          <div className="text-sm text-muted-foreground">
            <p>
              The JD Client connects to the pool and declares your custom block templates.
              The coinbase reward address is used as a fallback for solo mining if the pool connection fails.
            </p>
          </div>
        </div>
      </div>

      {/* Configuration Form */}
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-2">
            User Identity <span className="text-primary">*</span>
          </label>
          <input
            type="text"
            value={config.user_identity}
            onChange={(e) => handleChange('user_identity', e.target.value)}
            placeholder="miner.worker1"
            className="w-full h-10 px-3 rounded-lg border border-input bg-background focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/15 outline-none transition-all"
          />
          <p className="text-xs text-muted-foreground mt-2">
            Your mining identity (e.g., username.workername)
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">
            Coinbase Reward Address <span className="text-primary">*</span>
          </label>
          <input
            type="text"
            value={config.coinbase_reward_address}
            onChange={(e) => handleChange('coinbase_reward_address', e.target.value)}
            placeholder="bc1q..."
            className="w-full h-10 px-3 rounded-lg border border-input bg-background font-mono text-sm focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/15 outline-none transition-all"
          />
          <p className="text-xs text-muted-foreground mt-2">
            Bitcoin address for receiving mining rewards (fallback for solo mining)
          </p>
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
