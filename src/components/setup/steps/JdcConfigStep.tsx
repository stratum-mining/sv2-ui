import { useState, useEffect } from 'react';
import { StepProps, JdcConfig } from '../types';
import { Info } from 'lucide-react';
import { isValidBitcoinAddress } from '@/lib/utils';

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

  const [coinbaseError, setCoinbaseError] = useState('');

  const handleChange = (field: keyof JdcConfig, value: string) => {
    if (field === 'coinbase_reward_address') setCoinbaseError('');
    setConfig({ ...config, [field]: value });
  };

  const isValid =
    config.user_identity.length > 0 &&
    config.coinbase_reward_address.length > 0;

  const handleContinue = () => {
    if (!isValidBitcoinAddress(config.coinbase_reward_address)) {
      setCoinbaseError('Invalid Bitcoin address');
      return;
    }
    onNext();
  };

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

      <div className="p-4 rounded-xl bg-info/10 border border-info/20" role="note">
        <div className="flex gap-3">
          <Info className="h-5 w-5 text-info flex-shrink-0 mt-0.5" aria-hidden="true" />
          <div className="text-sm text-muted-foreground">
            <p>
              The JD Client connects to the pool and declares your custom block templates.
              The coinbase reward address is used as a fallback for solo mining if the pool connection fails.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <label htmlFor="jdc-user-identity" className="block text-sm font-medium mb-2">
            User Identity <span className="text-primary" aria-hidden="true">*</span>
            <span className="sr-only">(required)</span>
          </label>
          <input
            id="jdc-user-identity"
            type="text"
            value={config.user_identity}
            onChange={(e) => handleChange('user_identity', e.target.value)}
            placeholder="miner.worker1"
            aria-required="true"
            autoComplete="off"
            className="w-full h-10 px-3 rounded-lg border border-input bg-background focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/15 outline-none transition-all"
          />
          <p className="text-xs text-muted-foreground mt-2">
            Your mining identity (e.g., username.workername)
          </p>
        </div>

        <div>
          <label htmlFor="jdc-coinbase-address" className="block text-sm font-medium mb-2">
            Coinbase Reward Address <span className="text-primary" aria-hidden="true">*</span>
            <span className="sr-only">(required)</span>
          </label>
          <input
            id="jdc-coinbase-address"
            type="text"
            value={config.coinbase_reward_address}
            onChange={(e) => handleChange('coinbase_reward_address', e.target.value)}
            placeholder="bc1q..."
            aria-required="true"
            autoComplete="off"
            className="w-full h-10 px-3 rounded-lg border border-input bg-background font-mono text-sm focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/15 outline-none transition-all"
          />
          {coinbaseError
            ? <p className="text-xs text-destructive mt-1">{coinbaseError}</p>
            : <p className="text-xs text-muted-foreground mt-2">Bitcoin address for receiving mining rewards (fallback for solo mining)</p>
          }
        </div>
      </div>

      <div className="flex justify-center">
        <button
          type="button"
          onClick={handleContinue}
          disabled={!isValid}
          className="h-11 px-10 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 transition-colors font-medium"
        >
          Continue
        </button>
      </div>
    </div>
  );
}
