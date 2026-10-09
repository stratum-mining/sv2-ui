import { SUPPORTED_BITCOIN_CORE_VERSIONS, DEFAULT_BITCOIN_PATHS } from './constants.js';
import type { BitcoinCoreVersion, OperatingSystem } from './types.js';

export function formatSummaryInterval(minutes: number): string {
  if (minutes === 0) return 'Off';
  if (minutes % 60 === 0) return `Every ${minutes / 60} h`;
  return `Every ${minutes} min`;
}

export function formatBitcoinCoreVersion(version: BitcoinCoreVersion): string {
  return `${version}.x`;
}

export function formatSupportedVersions(): string {
  const v = SUPPORTED_BITCOIN_CORE_VERSIONS.map(formatBitcoinCoreVersion);
  if (v.length === 0) return '';
  if (v.length === 1) return v[0];
  if (v.length === 2) return `${v[0]} or ${v[1]}`;
  return `${v.slice(0, -1).join(', ')}, or ${v[v.length - 1]}`;
}

export function normalizeBitcoinCoreVersion(
  version: string | null | undefined
): BitcoinCoreVersion | null {
  if (!version) return null;

  const major = version.split('.')[0];
  return SUPPORTED_BITCOIN_CORE_VERSIONS.includes(major as BitcoinCoreVersion)
    ? major as BitcoinCoreVersion
    : null;
}

export function isSupportedBitcoinCoreVersion(
  version: string | null | undefined
): boolean {
  return normalizeBitcoinCoreVersion(version) !== null;
}

export function rpcVersionToCoreVersion(rpcVersion: number): BitcoinCoreVersion | null {
  const major = Math.floor(rpcVersion / 10000);
  return normalizeBitcoinCoreVersion(String(major));
}

export function rpcVersionToDisplayVersion(rpcVersion: number): string {
  const major = Math.floor(rpcVersion / 10000);
  const minor = Math.floor((rpcVersion % 10000) / 100);
  return `${major}.${minor}`;
}

export function bitcoinCoreVersionToIpcMajor(
  version: string | null | undefined
): number | null {
  const normalized = normalizeBitcoinCoreVersion(version);
  return normalized ? Number(normalized) : null;
}

export function inferOsFromDataDir(dataDir: string): OperatingSystem {
  return dataDir.includes(DEFAULT_BITCOIN_PATHS.macos.replace('~/', '')) ? 'macos' : 'linux';
}

export function mapHostOsToOperatingSystem(hostOs: string): OperatingSystem | null {
  const normalized = hostOs.toLowerCase();
  if (normalized === 'linux') return 'linux';
  if (normalized === 'macos') return 'macos';
  if (normalized === 'umbrel') return 'umbrel';
  return null;
}
