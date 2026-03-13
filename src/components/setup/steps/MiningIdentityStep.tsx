import { useState, useEffect } from 'react';
import { StepProps } from '../types';
import { Info } from 'lucide-react';

export function MiningIdentityStep({ data, updateData, onNext }: StepProps) {
  const isSoloMode = data.miningMode === 'solo';
  const isJdMode = data.mode === 'jd';

  const [userIdentity, setUserIdentity] = useState(
    data.translator?.user_identity || data.jdc?.user_identity || ''
  );
  const [coinbaseAddress, setCoinbaseAddress] = useState(data.jdc?.coinbase_reward_address || '');

  useEffect(() => {
    updateData({
      jdc: isJdMode
        ? { user_identity: userIdentity, coinbase_reward_address: coinbaseAddress, jdc_signature: data.jdc?.jdc_signature || '' }
        : null,
      translator: data.translator
        ? { ...data.translator, user_identity: userIdentity, enable_vardiff: true }
        : { user_identity: userIdentity, enable_vardiff: true, aggregate_channels: false, min_hashrate: 0 },
    });
  }, [userIdentity, coinbaseAddress, isJdMode, data.jdc?.jdc_signature, data.translator, updateData]);

  const isValid = userIdentity.length > 0 && (!isJdMode || coinbaseAddress.length > 0);

  return (
    <div className="space-y-8">
      <div className="text-center">
        <h2 className="text-2xl md:text-3xl font-semibold tracking-tight mb-3">Mining Identity</h2>
        <p className="text-lg text-muted-foreground">
          {isSoloMode ? 'Configure your payout address' : 'Configure your pool credentials'}
        </p>
      </div>

      <div>
        <label htmlFor="user-identity" className="block text-sm font-medium mb-2">
          {isSoloMode ? 'Bitcoin Address' : 'Pool Username'} <span className="text-primary" aria-hidden="true">*</span>
          <span className="sr-only">(required)</span>
        </label>
        <input
          id="user-identity"
          type="text"
          value={userIdentity}
          onChange={(e) => setUserIdentity(e.target.value)}
          placeholder={isSoloMode ? 'bc1q...' : 'username.worker1'}
          aria-required="true"
          autoComplete="off"
          className="w-full h-10 px-3 rounded-lg border border-input bg-background focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/15 outline-none transition-all font-mono text-sm"
        />
        <p className="text-xs text-muted-foreground mt-2">
          {isSoloMode
            ? 'Your Bitcoin address where you want to receive mining rewards'
            : 'Your pool account username (e.g., username.workername)'}
        </p>
      </div>

      {isJdMode && (
        <div>
          <label htmlFor="coinbase-address" className="block text-sm font-medium mb-2">
            Fallback Bitcoin Address <span className="text-primary" aria-hidden="true">*</span>
            <span className="sr-only">(required)</span>
          </label>

          <div className="mb-3 p-3 rounded-xl bg-muted/40 flex gap-3" role="note">
            <Info className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">
              Used for coinbase rewards if the Job Declarator falls back to solo mining due to pool connection issues.
            </p>
          </div>

          <input
            id="coinbase-address"
            type="text"
            value={coinbaseAddress}
            onChange={(e) => setCoinbaseAddress(e.target.value)}
            placeholder="bc1q..."
            aria-required="true"
            autoComplete="off"
            className="w-full h-10 px-3 rounded-lg border border-input bg-background focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/15 outline-none transition-all font-mono text-sm"
          />
          <p className="text-xs text-muted-foreground mt-2">
            Bitcoin address for receiving rewards during solo mining fallback
          </p>
        </div>
      )}

      <div className="flex justify-center">
        <button
          type="button"
          onClick={onNext}
          disabled={!isValid}
          className="h-11 px-10 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 transition-colors font-medium"
        >
          Continue
        </button>
      </div>
    </div>
  );
}
