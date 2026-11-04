import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { 
  formatDifficulty,
  formatHashrate,
  getBitcoinAddressError,
  getBitcoinAddressPlaceholder,
  getIdentifierError,
  isTomlSafeIdentifier,
  isValidBitcoinAddress,
  isValidPoolAddress,
  getPoolAddressError,
  isValidPoolAuthorityPubkey,
  stripWrappingQuotes
} from '@sv2-ui/shared';

export {
  formatDifficulty,
  formatHashrate,
  getBitcoinAddressError,
  getBitcoinAddressPlaceholder,
  getIdentifierError,
  isTomlSafeIdentifier,
  isValidBitcoinAddress,
  isValidPoolAddress,
  getPoolAddressError,
  isValidPoolAuthorityPubkey,
  stripWrappingQuotes,
};

/**
 * Combines class names with Tailwind merge support.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Formats uptime in seconds to a human-readable duration string.
 */
export function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;

  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

/**
 * Truncates a hex string for display, showing first and last N characters.
 */
export function truncateHex(hex: string, chars: number = 6): string {
  if (hex.length <= chars * 2 + 3) return hex;
  return `${hex.slice(0, chars)}...${hex.slice(-chars)}`;
}

/**
 * Formats a number with thousands separators.
 */
export function formatNumber(num: number, decimals: number = 0): string {
  return num.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Calculates shares per minute rate from total shares and uptime.
 */
export function calculateSharesPerMinute(shares: number, uptimeSecs: number): number {
  if (uptimeSecs === 0) return 0;
  return (shares / uptimeSecs) * 60;
}

export function getPoolAuthorityPubkeyError(v: string): string | null {
  if (!v) return null;
  return isValidPoolAuthorityPubkey(v) ? null : 'Invalid authority public key';
}
