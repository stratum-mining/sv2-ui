import type { TranslatorConfig } from '@sv2-ui/shared';
import {
  DEFAULT_DOWNSTREAM_EXTRANONCE2_SIZE,
  DEFAULT_SHARES_PER_MINUTE,
  MAX_DOWNSTREAM_EXTRANONCE2_SIZE,
} from '@sv2-ui/shared';

import { Switch } from '@/components/ui/switch';
import { FieldError } from '@/components/ui/field-error';

export interface AdvancedMiningConfigValues {
  sharesPerMinute: string;
  downstreamExtranonce2Size: string;
  verifyPayout: boolean;
}

interface ParsedAdvancedMiningConfigValues {
  sharesPerMinute: number;
  downstreamExtranonce2Size: number;
  verifyPayout: boolean;
}

interface AdvancedMiningConfigFormProps {
  idPrefix: string;
  value: AdvancedMiningConfigValues;
  onChange: (value: AdvancedMiningConfigValues) => void;
  showCoinbaseVerification?: boolean;
}

function isPositiveNumber(value: string): boolean {
  const parsed = Number(value);
  return value.trim() !== '' && Number.isFinite(parsed) && parsed > 0;
}

function isPositiveInteger(value: string): boolean {
  return isPositiveNumber(value) && Number.isInteger(Number(value));
}

function isValidDownstreamExtranonce2Size(value: string): boolean {
  return isPositiveInteger(value) && Number(value) <= MAX_DOWNSTREAM_EXTRANONCE2_SIZE;
}

export function createAdvancedMiningConfigValues(
  translator?: TranslatorConfig | null,
): AdvancedMiningConfigValues {
  return {
    sharesPerMinute: String(translator?.shares_per_minute ?? DEFAULT_SHARES_PER_MINUTE),
    downstreamExtranonce2Size: String(
      translator?.downstream_extranonce2_size ?? DEFAULT_DOWNSTREAM_EXTRANONCE2_SIZE,
    ),
    verifyPayout: translator?.verify_payout ?? true,
  };
}

export function isAdvancedMiningConfigValid(value: AdvancedMiningConfigValues): boolean {
  return isPositiveNumber(value.sharesPerMinute)
    && isValidDownstreamExtranonce2Size(value.downstreamExtranonce2Size);
}

export function parseAdvancedMiningConfigValues(
  value: AdvancedMiningConfigValues,
): ParsedAdvancedMiningConfigValues {
  return {
    sharesPerMinute: Number(value.sharesPerMinute) || DEFAULT_SHARES_PER_MINUTE,
    downstreamExtranonce2Size: isValidDownstreamExtranonce2Size(value.downstreamExtranonce2Size)
      ? Number(value.downstreamExtranonce2Size)
      : DEFAULT_DOWNSTREAM_EXTRANONCE2_SIZE,
    verifyPayout: value.verifyPayout,
  };
}

/** Shared compact form for translator settings shown during setup and later configuration. */
export function AdvancedMiningConfigForm({
  idPrefix,
  value,
  onChange,
  showCoinbaseVerification = false,
}: AdvancedMiningConfigFormProps) {
  const sharesPerMinuteValid = isPositiveNumber(value.sharesPerMinute);
  const downstreamExtranonce2SizeValid = isValidDownstreamExtranonce2Size(
    value.downstreamExtranonce2Size,
  );
  const verifyPayoutLabelId = `${idPrefix}-verify-payout-label`;
  const verifyPayoutDescriptionId = `${idPrefix}-verify-payout-description`;
  const sharesPerMinuteId = `${idPrefix}-shares-per-minute`;
  const sharesPerMinuteDescriptionId = `${idPrefix}-shares-per-minute-description`;
  const downstreamExtranonce2SizeId = `${idPrefix}-downstream-extranonce2-size`;
  const downstreamExtranonce2SizeDescriptionId = `${idPrefix}-downstream-extranonce2-size-description`;

  return (
    <div className="max-w-3xl space-y-3">
      {showCoinbaseVerification && (
        <div className="flex items-center justify-between gap-4 rounded-lg border border-border/50 bg-muted/20 px-3 py-2.5">
          <div className="min-w-0 space-y-0.5">
            <p id={verifyPayoutLabelId} className="text-xs font-medium">Coinbase Verification</p>
            <p id={verifyPayoutDescriptionId} className="text-xs text-muted-foreground">
              Verify that your payout address is included in the pool&apos;s coinbase transaction.
            </p>
          </div>
          <Switch
            id={`${idPrefix}-verify-payout-switch`}
            checked={value.verifyPayout}
            onCheckedChange={(checked) => onChange({ ...value, verifyPayout: checked })}
            aria-labelledby={verifyPayoutLabelId}
            aria-describedby={verifyPayoutDescriptionId}
            className="shrink-0"
          />
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="min-w-0">
          <label htmlFor={sharesPerMinuteId} className="mb-1 block text-xs font-medium">
            Shares Per Minute
          </label>
          <input
            id={sharesPerMinuteId}
            type="number"
            min="0.1"
            step="0.1"
            value={value.sharesPerMinute}
            onChange={(event) => onChange({ ...value, sharesPerMinute: event.target.value })}
            aria-describedby={sharesPerMinuteDescriptionId}
            aria-invalid={!sharesPerMinuteValid}
            className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none transition-all focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/15"
          />
          {!sharesPerMinuteValid ? (
            <FieldError message="Enter a value greater than 0." className="mt-1" id={sharesPerMinuteDescriptionId} />
          ) : (
            <p id={sharesPerMinuteDescriptionId} className="mt-1 text-xs text-muted-foreground">
              Target share rate for variable difficulty.
            </p>
          )}
        </div>

        <div className="min-w-0">
          <label htmlFor={downstreamExtranonce2SizeId} className="mb-1 block text-xs font-medium">
            Extranonce2 Size
          </label>
          <input
            id={downstreamExtranonce2SizeId}
            type="number"
            min="1"
            max={MAX_DOWNSTREAM_EXTRANONCE2_SIZE}
            step="1"
            value={value.downstreamExtranonce2Size}
            onChange={(event) => onChange({ ...value, downstreamExtranonce2Size: event.target.value })}
            aria-describedby={downstreamExtranonce2SizeDescriptionId}
            aria-invalid={!downstreamExtranonce2SizeValid}
            className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none transition-all focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/15"
          />
          {!downstreamExtranonce2SizeValid ? (
            <FieldError message="Enter a whole number from 1 to 65,535." className="mt-1" id={downstreamExtranonce2SizeDescriptionId} />
          ) : (
            <p id={downstreamExtranonce2SizeDescriptionId} className="mt-1 text-xs text-muted-foreground">
              Bytes assigned to downstream SV1 miners.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
