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
    id: 'blitzpool',
    name: 'Blitzpool',
    address: 'blitzpool.yourdevice.ch',
    port: 3333,
    authority_public_key: '9bCoFxTszKCuffyywH5uS5o6WcU4vsjTH2axxc7wE86y2HhvULU',
    description: 'Solo mining pool by Blitzpool',
    logoUrl: '/blitzpool.svg',
  },
  {
    id: 'mkpool',
    name: 'MKPool',
    address: 'btc.mkpool.com',
    port: 3340,
    authority_public_key: '9c9aZWzETaiJyqGGUSCn8GqFgTpxs96ert4d4jGeRnvxqRqhZar',
    description: 'Solo mining pool by MKPool',
    logoUrl: '/mkpool-avatar-navy.svg',
  },
  {
    id: 'publicpool',
    name: 'PublicPool',
    address: 'public-pool.io',
    port: 3333,
    authority_public_key: '9c4zpyJ2ndm4e8sP2uNc1VNCGxYjqaxWS6wUCjk8zFj6njFquH6',
    description: 'Solo mining pool by PublicPool',
    logoUrl: '/public-pool-logo.svg',
  },
  {
    id: 'sri-solo',
    name: 'SRI Community Solo Pool',
    address: '75.119.150.111',
    port: 3333,
    authority_public_key: '9auqWEzQDVyd2oe1JVGFLMLHZtCo2FFqZwtKA5gd9xbuEu7PH72',
    description: 'Community-run solo mining pool',
    logoUrl: '/sri-logo.png',
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

export function knownPoolToConfig(p: KnownPool): PoolConfig {
  return { name: p.name, address: p.address, port: p.port, authority_public_key: p.authority_public_key };
}

export function knownPoolsForSlot(
  pools: KnownPool[],
  primary: PoolConfig | null,
  fallbacks: PoolConfig[],
  slotIndex: number,
): KnownPool[] {
  return pools.filter((kp) => {
    const kpAsConfig = knownPoolToConfig(kp);
    if (isSamePool(fallbacks[slotIndex], kpAsConfig)) return true;
    if (primary && isSamePool(primary, kpAsConfig)) return false;
    return !fallbacks.some((other, j) => j !== slotIndex && isSamePool(other, kpAsConfig));
  });
}
