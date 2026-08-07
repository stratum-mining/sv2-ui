import { useEffect, useRef, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { FieldError } from '@/components/ui/field-error';
import {
  shouldAggregateTranslatorChannels,
  type BitcoinNetwork,
  type MiningMode,
  type PoolConfig,
} from '@sv2-ui/shared';
import {
  buildSriIdentity,
  getPoolIdentityError,
  isSriPool,
  normalizePoolUserIdentity,
  parseSriIdentity,
} from '@/lib/miningIdentity';
import {
  getBitcoinAddressError,
  getBitcoinAddressPlaceholder,
} from '@/lib/utils';

const DONATION_SNAP_POINTS = [0, 10, 25, 50, 75, 100];
const DONATION_SNAP_THRESHOLD = 3;

function snapDonation(value: number): number {
  const nearest = DONATION_SNAP_POINTS.find((point) => (
    Math.abs(value - point) <= DONATION_SNAP_THRESHOLD
  ));
  return nearest ?? value;
}

export function PoolIdentityFields({
  pool,
  miningMode,
  network,
  idPrefix,
  onChange,
}: {
  pool: PoolConfig;
  miningMode: MiningMode | null;
  network: BitcoinNetwork;
  idPrefix: string;
  onChange: (pool: PoolConfig) => void;
}) {
  if (miningMode === 'solo' && isSriPool(pool)) {
    return (
      <SriPoolIdentityFields
        pool={pool}
        network={network}
        idPrefix={idPrefix}
        onChange={onChange}
      />
    );
  }

  const label = miningMode === 'solo' ? 'Payout address' : 'Pool username';
  const placeholder = miningMode === 'solo' ? getBitcoinAddressPlaceholder(network) : 'username.worker1';
  const error = getPoolIdentityError(pool, miningMode, network);
  const showBraiinsUsernameWarning = miningMode !== 'solo' && shouldAggregateTranslatorChannels(pool);

  return (
    <div>
      <label htmlFor={`${idPrefix}-identity`} className="block text-sm font-medium mb-2">
        {label} <span className="text-primary" aria-hidden="true">*</span>
        <span className="sr-only">(required)</span>
      </label>
      {showBraiinsUsernameWarning && (
        <Alert variant="warning" className="mb-3">
          <p>
            Use the exact username from your Braiins Pool account. If this value does not match an existing
            Braiins account, the pool connection will not be established properly.
          </p>
        </Alert>
      )}
      <input
        id={`${idPrefix}-identity`}
        type="text"
        value={pool.user_identity}
        onChange={(event) => onChange({ ...pool, user_identity: event.target.value })}
        placeholder={placeholder}
        aria-required="true"
        autoComplete="off"
        className="w-full h-10 px-3 rounded-lg border border-input bg-background focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/15 outline-none transition-all font-mono text-sm"
      />
      <FieldError message={error} />
      <p className="text-xs text-muted-foreground mt-2">
        {miningMode === 'solo'
          ? 'Bitcoin address used by the pool for solo mining payouts.'
          : 'Pool account username sent to this upstream'}
      </p>
    </div>
  );
}

function SriPoolIdentityFields({
  pool,
  network,
  idPrefix,
  onChange,
}: {
  pool: PoolConfig;
  network: BitcoinNetwork;
  idPrefix: string;
  onChange: (pool: PoolConfig) => void;
}) {
  const parsed = parseSriIdentity(pool.user_identity);
  const [savedPayoutAddress, setSavedPayoutAddress] = useState(parsed.address);
  const payoutAddress = parsed.address || savedPayoutAddress;
  const needsAddress = parsed.donationPercent < 100;
  const identityError = getPoolIdentityError(pool, 'solo', network);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    const normalizedPool = normalizePoolUserIdentity(pool, 'solo');
    if (normalizedPool !== pool) {
      onChangeRef.current(normalizedPool);
    }
  }, [pool]);

  const updateSriIdentity = (address: string, workerName: string, donationPercent: number) => {
    setSavedPayoutAddress(address);
    onChange({
      ...pool,
      user_identity: buildSriIdentity(address, workerName, donationPercent),
    });
  };

  return (
    <div className="space-y-4">
      {needsAddress && (
        <div>
          <label htmlFor={`${idPrefix}-payout-address`} className="block text-sm font-medium mb-2">
            Bitcoin payout address <span className="text-primary" aria-hidden="true">*</span>
            <span className="sr-only">(required)</span>
          </label>
          <input
            id={`${idPrefix}-payout-address`}
            type="text"
            value={payoutAddress}
            onChange={(event) => updateSriIdentity(event.target.value, parsed.workerName, parsed.donationPercent)}
            placeholder={getBitcoinAddressPlaceholder(network)}
            aria-required="true"
            autoComplete="off"
            className="w-full h-10 px-3 rounded-lg border border-input bg-background focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/15 outline-none transition-all font-mono text-sm"
          />
          <FieldError message={getBitcoinAddressError(payoutAddress, network)} />
          <p className="text-xs text-muted-foreground mt-2">
            Used with worker and donation settings to build this pool identity.
          </p>
        </div>
      )}

      <div>
        <label htmlFor={`${idPrefix}-worker-name`} className="block text-sm font-medium mb-2">
          Worker Name <span className="text-muted-foreground text-xs font-normal">(optional)</span>
        </label>
        <input
          id={`${idPrefix}-worker-name`}
          type="text"
          value={parsed.workerName}
          onChange={(event) => updateSriIdentity(payoutAddress, event.target.value, parsed.donationPercent)}
          placeholder="worker1"
          autoComplete="off"
          className="w-full h-10 px-3 rounded-lg border border-input bg-background focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/15 outline-none transition-all font-mono text-sm"
        />
      </div>

      <div>
        <label htmlFor={`${idPrefix}-donation-slider`} className="block text-sm font-medium mb-2">
          Donation to SRI Development <span className="text-muted-foreground text-xs font-normal">(optional)</span>
        </label>
        <div className="p-4 rounded-xl bg-muted/40 space-y-3">
          <input
            id={`${idPrefix}-donation-slider`}
            type="range"
            min={0}
            max={100}
            value={parsed.donationPercent}
            onChange={(event) => updateSriIdentity(
              payoutAddress,
              parsed.workerName,
              snapDonation(Number(event.target.value)),
            )}
            aria-label={`Donation: ${parsed.donationPercent}%`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={parsed.donationPercent}
            className="w-full accent-primary"
            list={`${idPrefix}-donation-snap-points`}
          />
          <datalist id={`${idPrefix}-donation-snap-points`}>
            <option value="0" />
            <option value="10" />
            <option value="25" />
            <option value="50" />
            <option value="75" />
            <option value="100" />
          </datalist>
          <div className="flex justify-between text-xs text-muted-foreground select-none">
            <span>0%</span><span>25%</span><span>50%</span><span>75%</span><span>100%</span>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          {parsed.donationPercent === 0
            ? 'Full block reward goes to your payout address'
            : parsed.donationPercent >= 100
              ? 'Full block reward is donated to SRI development'
              : `${parsed.donationPercent}% of the block reward goes to SRI development, ${100 - parsed.donationPercent}% to your address`}
        </p>
      </div>

      <FieldError message={identityError} />
    </div>
  );
}
