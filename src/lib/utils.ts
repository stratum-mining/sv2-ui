import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from 'tiny-secp256k1';
import bs58check from 'bs58check';

// Required for taproot (P2TR) address validation
bitcoin.initEccLib(ecc);

/**
 * Combines class names with Tailwind merge support.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Formats hashrate with appropriate unit (H/s, KH/s, MH/s, GH/s, TH/s, PH/s, EH/s).
 */
export function formatHashrate(hashrate: number | null): string {
  if (hashrate === null || hashrate === 0) return '0 H/s';
  
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
 * Counts rejected-share payloads returned by SRI monitoring APIs.
 */
export function countRejectedShares(value: unknown): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }
  if (Array.isArray(value)) {
    return value.length;
  }
  if (value !== null && typeof value === 'object') {
    return Object.keys(value).length;
  }
  return 0;
}

/**
 * Calculates shares per minute rate from total shares and uptime.
 */
export function calculateSharesPerMinute(shares: number, uptimeSecs: number): number {
  if (uptimeSecs === 0) return 0;
  return (shares / uptimeSecs) * 60;
}

/**
 * Validates a Bitcoin address against the specified network.
 * Supports P2PKH, P2SH, P2WPKH, P2WSH, and P2TR address formats.
 */
export function isValidBitcoinAddress(addr: string, network: 'mainnet' | 'testnet4'): boolean {
  if (!addr) return false;
  const btcNetwork = network === 'mainnet' ? bitcoin.networks.bitcoin : bitcoin.networks.testnet;
  try {
    bitcoin.address.toOutputScript(addr, btcNetwork);
    return true;
  } catch {
    return false;
  }
}

/**
 * Returns an error message if the address is invalid for the given network,
 * distinguishing between a wrong network address and a completely invalid one.
 */
export function getBitcoinAddressError(addr: string, network: 'mainnet' | 'testnet4'): string | null {
  if (!addr || isValidBitcoinAddress(addr, network)) return null;
  const otherNetwork = network === 'mainnet' ? 'testnet4' : 'mainnet';
  return isValidBitcoinAddress(addr, otherNetwork) ? 'Wrong network' : 'Invalid Bitcoin address';
}

/**
 * Returns a network-specific address placeholder for form hints.
 */
export function getBitcoinAddressPlaceholder(network: 'mainnet' | 'testnet4'): string {
  return network === 'mainnet' ? 'bc1q...' : 'tb1q...';
}

// Pubkeys in pool docs / Discord are almost always shown wrapped in quotes,
// and users copy them with the quotes. Strip one matched pair, then trim.
export function stripWrappingQuotes(v: string): string {
  const trimmed = v.trim();
  if (
    trimmed.length >= 2 &&
    ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'")))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

// The SRI Noise-protocol authority key is base58check-encoded, so a corrupted
// character or missing byte fails the checksum — which is exactly what
// copy-paste mistakes produce. Wrapping quotes (the dominant mistake from
// docs/Discord) are stripped here so the caller does not have to remember to
// normalize before calling.
export function isValidPoolAuthorityPubkey(v: string): boolean {
  const normalized = stripWrappingQuotes(v);
  if (!normalized) return false;
  try {
    bs58check.decode(normalized);
    return true;
  } catch {
    return false;
  }
}

export function getPoolAuthorityPubkeyError(v: string): string | null {
  if (!v) return null;
  return isValidPoolAuthorityPubkey(v) ? null : 'Invalid authority public key';
}

// Characters that would break a TOML basic string ("..."): the quote itself,
// the escape character, and any C0/DEL control character.
// eslint-disable-next-line no-control-regex
const TOML_UNSAFE_CHARS = /["\\\u0000-\u001F\u007F]/;

export function isTomlSafeIdentifier(v: string): boolean {
  if (!v) return false;
  if (v !== v.trim()) return false;
  return !TOML_UNSAFE_CHARS.test(v);
}

export function getIdentifierError(v: string): string | null {
  if (!v) return null;
  if (v !== v.trim()) return 'Leading or trailing whitespace is not allowed';
  if (TOML_UNSAFE_CHARS.test(v)) {
    return 'Contains characters that are not allowed (quotes, backslashes, control characters)';
  }
  return null;
}
