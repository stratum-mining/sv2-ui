import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Combines class names with Tailwind merge support.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Formats hashrate with appropriate unit (H/s, KH/s, MH/s, GH/s, TH/s, PH/s, EH/s).
 */
export function formatHashrate(hashrate: number): string {
  if (hashrate === 0) return '0 H/s';
  
  const units = ['H/s', 'KH/s', 'MH/s', 'GH/s', 'TH/s', 'PH/s', 'EH/s'];
  const k = 1000;
  const i = Math.floor(Math.log(hashrate) / Math.log(k));
  const index = Math.min(i, units.length - 1);
  
  return `${(hashrate / Math.pow(k, index)).toFixed(2)} ${units[index]}`;
}

/**
 * Formats difficulty as a human-readable string.
 */
export function formatDifficulty(diff: number): string {
  if (diff === 0) return '0';
  if (diff >= 1e15) return `${(diff / 1e15).toFixed(2)}P`;
  if (diff >= 1e12) return `${(diff / 1e12).toFixed(2)}T`;
  if (diff >= 1e9) return `${(diff / 1e9).toFixed(2)}G`;
  if (diff >= 1e6) return `${(diff / 1e6).toFixed(2)}M`;
  if (diff >= 1e3) return `${(diff / 1e3).toFixed(2)}K`;
  return diff.toFixed(2);
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
