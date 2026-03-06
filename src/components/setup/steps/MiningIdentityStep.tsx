import { useState, useEffect } from 'react';
import { StepProps } from '../types';
import { Info } from 'lucide-react';

/**
 * Mining Identity Step - Asks for user identity once, used for both JDC and Translator
 */
export function MiningIdentityStep({ data, updateData, onNext }: StepProps) {
  const isSoloMode = data.miningMode === 'solo';
  const isJdMode = data.mode === 'jd';
  
  const [userIdentity, setUserIdentity] = useState(
    data.translator?.user_identity || data.jdc?.user_identity || ''
  );
  const [coinbaseAddress, setCoinbaseAddress] = useState(
    data.jdc?.coinbase_reward_address || ''
  );

  useEffect(() => {
    // Update both JDC and Translator with the same user_identity
    updateData({
      jdc: isJdMode
        ? {
            user_identity: userIdentity,
            coinbase_reward_address: coinbaseAddress,
            jdc_signature: data.jdc?.jdc_signature || '',
          }
        : null,
      translator: data.translator
        ? { ...data.translator, user_identity: userIdentity, enable_vardiff: true }
        : { user_identity: userIdentity, enable_vardiff: true, aggregate_channels: false, min_hashrate: 0 },
    });
  }, [userIdentity, coinbaseAddress, isJdMode, data.jdc?.jdc_signature, data.translator, updateData]);

  const isValid = userIdentity.length > 0 && (!isJdMode || coinbaseAddress.length > 0);

  const getUserIdentityLabel = () => {
    if (isSoloMode) return 'Bitcoin Address';
    return 'Pool Username';
  };

  const getUserIdentityPlaceholder = () => {
    if (isSoloMode) return 'bc1q...';
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
          Mining Identity
        </h2>
        <p className="text-lg text-muted-foreground">
          {isSoloMode ? 'Configure your payout address' : 'Configure your pool credentials'}
        </p>
      </div>

      {/* User Identity */}
      <div>
        <label className="block text-sm font-medium mb-2">
          {getUserIdentityLabel()} <span className="text-primary">*</span>
        </label>
        <input
          type="text"
          value={userIdentity}
          onChange={(e) => setUserIdentity(e.target.value)}
          placeholder={getUserIdentityPlaceholder()}
          className="w-full h-10 px-3 rounded-lg border border-input bg-background focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/15 outline-none transition-all font-mono text-sm"
        />
        <p className="text-xs text-muted-foreground mt-2">
          {getUserIdentityDescription()}
        </p>
      </div>

      {/* Coinbase Address (JD mode only) */}
      {isJdMode && (
        <div>
          <label className="block text-sm font-medium mb-2">
            Fallback Bitcoin Address <span className="text-primary">*</span>
          </label>
          
          <div className="mb-3 p-4 rounded-xl border border-info/20 bg-info/10">
            <div className="flex gap-3">
              <Info className="h-5 w-5 text-info flex-shrink-0 mt-0.5" />
              <div className="text-sm text-muted-foreground">
                <p>
                  This address will be used for coinbase rewards if the Job Declarator
                  falls back to solo mining due to pool connection issues.
                </p>
              </div>
            </div>
          </div>

          <input
            type="text"
            value={coinbaseAddress}
            onChange={(e) => setCoinbaseAddress(e.target.value)}
            placeholder="bc1q..."
            className="w-full h-10 px-3 rounded-lg border border-input bg-background focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/15 outline-none transition-all font-mono text-sm"
          />
          <p className="text-xs text-muted-foreground mt-2">
            Bitcoin address for receiving rewards during solo mining fallback
          </p>
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
