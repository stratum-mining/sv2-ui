import { useEffect, useState } from 'react';
import { StepProps } from '../types';

import {
  getBitcoinAddressError,
  getBitcoinAddressPlaceholder,
  getIdentifierError,
  isTomlSafeIdentifier,
  isValidBitcoinAddress,
} from '@/lib/utils';
import { Alert } from '@/components/ui/alert';
import { FieldError } from '@/components/ui/field-error';

export function MiningIdentityStep({ data, updateData, onNext }: StepProps) {
  const isSoloMode = data.miningMode === 'solo';
  const isSovereignSolo = isSoloMode && data.mode === 'jd';
  const network = data.bitcoin?.network ?? 'mainnet';

  const [coinbaseAddress, setCoinbaseAddress] = useState(data.jdc?.coinbase_reward_address || '');
  const [minerSignature, setMinerSignature] = useState(data.jdc?.jdc_signature || '');

  useEffect(() => {
    updateData({
      jdc: {
        coinbase_reward_address: coinbaseAddress,
        jdc_signature: minerSignature,
      },
    });
  // intentionally excluded: updateData causes an infinite loop when included
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coinbaseAddress, minerSignature]);

  const bitcoinAddressPlaceholder = getBitcoinAddressPlaceholder(network);
  const coinbaseLabel = isSovereignSolo ? 'Block Reward Address' : 'Solo Fallback Address';
  const coinbaseNotice = isSovereignSolo
    ? 'This is where the full block reward will be paid when your node finds a block.'
    : 'Used for coinbase rewards if the Job Declarator falls back to solo mining due to pool connection issues.';
  const isSignatureValid = minerSignature === '' || isTomlSafeIdentifier(minerSignature);
  const isValid = isValidBitcoinAddress(coinbaseAddress, network) && isSignatureValid;

  return (
    <div className="space-y-8">
      <div className="text-center">
        <h2 className="text-2xl md:text-3xl font-semibold tracking-tight mb-3">Job Declaration</h2>
        <p className="text-lg text-muted-foreground">
          Configure reward and coinbase details
        </p>
      </div>

      <div>
        <label htmlFor="jdc-signature" className="block text-sm font-medium mb-2">
          Miner Signature <span className="text-muted-foreground text-xs font-normal">(optional)</span>
        </label>
        <input
          id="jdc-signature"
          type="text"
          value={minerSignature}
          onChange={(e) => setMinerSignature(e.target.value)}
          placeholder={isSovereignSolo ? 'solo_miner' : 'MyBusinessName'}
          autoComplete="off"
          className="w-full h-10 px-3 rounded-lg border border-input bg-background focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/15 outline-none transition-all font-mono text-sm"
        />
        {minerSignature && (
          <FieldError message={getIdentifierError(minerSignature)} />
        )}
        <p className="text-xs text-muted-foreground mt-2">
          Miner-chosen tag shown in coinbase transactions on block explorers
        </p>
      </div>

      <div>
        <label htmlFor="coinbase-address" className="block text-sm font-medium mb-2">
          {coinbaseLabel} <span className="text-primary" aria-hidden="true">*</span>
          <span className="sr-only">(required)</span>
        </label>

        <Alert variant="neutral" className="mb-3">
          <p>{coinbaseNotice}</p>
        </Alert>

        <input
          id="coinbase-address"
          type="text"
          value={coinbaseAddress}
          onChange={(e) => setCoinbaseAddress(e.target.value)}
          placeholder={bitcoinAddressPlaceholder}
          aria-required="true"
          autoComplete="off"
          className="w-full h-10 px-3 rounded-lg border border-input bg-background focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/15 outline-none transition-all font-mono text-sm"
        />
        <FieldError message={getBitcoinAddressError(coinbaseAddress, network)} />
        <p className="text-xs text-muted-foreground mt-2">
          Bitcoin address that receives solo mining rewards
        </p>
      </div>

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
