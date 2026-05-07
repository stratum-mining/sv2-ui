/**
 * Shared pool preset definitions used by both the Setup Wizard and Settings.
 */

import type { PoolConfig } from '@/components/setup/types';
import { isValidPoolAuthorityPubkey } from '@/lib/utils';

export const EMPTY_CUSTOM_POOL: PoolConfig = {
  name: 'Custom Pool',
  address: '',
  port: 34254,
  authority_public_key: '',
};

// Two pools are the same iff their full SV2 endpoint triplet matches.
// Address+port alone isn't enough — a typo'd or malicious pubkey on the
// same host:port is a different security context, not a duplicate.
export function isSamePool(a: PoolConfig, b: PoolConfig): boolean {
  return (
    a.address.toLowerCase() === b.address.toLowerCase() &&
    a.port === b.port &&
    a.authority_public_key === b.authority_public_key
  );
}

export function isPoolValid(p: PoolConfig): boolean {
  return p.address.length > 0 && isValidPoolAuthorityPubkey(p.authority_public_key);
}

export interface KnownPool {
  id: string;
  name: string;
  address: string;
  port: number;
  authority_public_key: string;
  description: string;
  badge?: 'testing' | 'coming-soon';
  logoUrl?: string;
  logoOnDark?: boolean;
}

export const POOL_MINING_NO_JD: KnownPool[] = [
  {
    id: 'braiins',
    name: 'Braiins Pool',
    address: 'stratum.braiins.com',
    port: 3333,
    authority_public_key: '9awtMD5KQgvRUh2yFbjVeT7b6hjipWcAsQHd6wEhgtDT9soosna',
    description: 'Production SV2 pool by Braiins',
    logoUrl: '/braiins.svg',
    logoOnDark: true,
  },
];

export const POOL_MINING_JD: KnownPool[] = [
  {
    id: 'sri-solo',
    name: 'SRI Pool',
    address: '75.119.150.111',
    port: 3333,
    authority_public_key: '9auqWEzQDVyd2oe1JVGFLMLHZtCo2FFqZwtKA5gd9xbuEu7PH72',
    description: 'Community testing pool. Payouts go to SRI development.',
    badge: 'testing',
    logoUrl: '/sri-logo.png',
  },
];

export const SOLO_POOLS: KnownPool[] = [
  {
    id: 'sri-solo',
    name: 'SRI Community Solo Pool',
    address: '75.119.150.111',
    port: 3333,
    authority_public_key: '9auqWEzQDVyd2oe1JVGFLMLHZtCo2FFqZwtKA5gd9xbuEu7PH72',
    description: 'Community-run solo mining pool',
    logoUrl: '/sri-logo.png',
  },
  {
    id: 'blitzpool',
    name: 'Blitzpool',
    address: 'blitzpool.yourdevice.ch',
    port: 3333,
    authority_public_key: '9bCoFxTszKCuffyywH5uS5o6WcU4vsjTH2axxc7wE86y2HhvULU',
    description: 'Solo mining pool by Blitzpool',
    logoUrl: '/blitzpool.svg',
  },
];

/**
 * Get available pools for a given mining mode and template mode.
 */
export function getPoolsForMode(miningMode: string | null, templateMode: string | null): KnownPool[] {
  if (miningMode === 'solo') return SOLO_POOLS;
  if (templateMode === 'jd') return POOL_MINING_JD;
  return POOL_MINING_NO_JD;
}
