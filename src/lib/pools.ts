/**
 * Shared pool preset definitions used by both the Setup Wizard and Settings.
 */
import {
  MAX_FALLBACK_POOLS,
  type MiningMode,
  type PoolConfig,
} from '@sv2-ui/shared';
import { withCompatiblePoolIdentity } from './miningIdentity';

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
  monogram?: string;
  invertLogoInDarkMode?: boolean;
  logoScale?: number;
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
    description: 'Blitzpool',
    logoUrl: '/blitzpool.svg',
    invertLogoInDarkMode: true,
  },
  {
    id: 'ckpool',
    name: 'CKPool',
    address: 'sv2solo.ckpool.org',
    port: 3336,
    authority_public_key: '9anrRNhBh7869XtNnFcCuGBRZP51E635qGbu457J5kHdszhfRc3',
    description: 'CKPool',
    monogram: 'CK',
  },
  {
    id: 'mkpool',
    name: 'MKPool',
    address: 'btc.mkpool.com',
    port: 3340,
    authority_public_key: '9c9aZWzETaiJyqGGUSCn8GqFgTpxs96ert4d4jGeRnvxqRqhZar',
    description: 'MKPool',
    logoUrl: '/mkpool-avatar-navy.svg',
  },
  {
    id: 'nexuspool',
    name: 'NexusPool',
    address: 'nexuspool.io',
    port: 3350,
    authority_public_key: '9amd6GUzTaGXASESCa75c9Rx3vWYihRyLUAE3Vrmqwgm3T9jtxN',
    description: 'NexusPool',
    logoUrl: '/nexuspool-logo.png',
    logoScale: 1.4,
  },
  {
    id: 'publicpool',
    name: 'PublicPool',
    address: 'public-pool.io',
    port: 23330,
    authority_public_key: '9c4zpyJ2ndm4e8sP2uNc1VNCGxYjqaxWS6wUCjk8zFj6njFquH6',
    description: 'PublicPool',
    logoUrl: '/public-pool-logo.svg',
    logoScale: 1.15,
  },
  {
    id: 'pyblock',
    name: 'PyBLØCK',
    address: 'pool.pyblock.xyz',
    port: 5555,
    authority_public_key: '9anZZb1uaJDqubvJhekPiNRHA2tuShcNaugDmFxtnTq54sDvTf5',
    description: 'PyBLØCK',
    logoUrl: '/pyblock-pool-logo.svg',
  },
  {
    id: 'sri-solo',
    name: 'SRI Community Solo Pool',
    address: '75.119.150.111',
    port: 3333,
    authority_public_key: '9auqWEzQDVyd2oe1JVGFLMLHZtCo2FFqZwtKA5gd9xbuEu7PH72',
    description: 'Community-run',
    logoUrl: '/sri-logo.png',
  },
];

export const ALL_KNOWN_POOLS: KnownPool[] = [
  ...POOL_MINING_NO_JD,
  ...POOL_MINING_JD,
  ...SOLO_POOLS,
];

/**
 * Get available pools for a given mining mode and template mode.
 */
export function getPoolsForMode(miningMode: string | null, templateMode: string | null): KnownPool[] {
  if (miningMode === 'solo') return SOLO_POOLS;
  if (templateMode === 'jd') return POOL_MINING_JD;
  return POOL_MINING_NO_JD;
}

export function knownPoolToConfig(pool: KnownPool, userIdentity = ''): PoolConfig {
  return {
    name: pool.name,
    address: pool.address,
    port: pool.port,
    authority_public_key: pool.authority_public_key,
    user_identity: userIdentity,
  };
}

export function createEmptyCustomPool(userIdentity = ''): PoolConfig {
  return {
    name: 'Custom Pool',
    address: '',
    port: 3333,
    authority_public_key: '',
    user_identity: userIdentity,
  };
}

export function appendEmptyCustomPool(
  pools: PoolConfig[],
  miningMode: MiningMode | null,
): PoolConfig[] {
  if (!canAddPool(pools)) return pools;

  return [
    ...pools,
    withCompatiblePoolIdentity(
      pools[0],
      createEmptyCustomPool(),
      miningMode,
    ),
  ];
}

export function canAddPool(pools: PoolConfig[]): boolean {
  return pools.length < MAX_FALLBACK_POOLS + 1;
}

export function isSamePool(a: Pick<PoolConfig, 'address' | 'port'> | null | undefined, b: Pick<PoolConfig, 'address' | 'port'> | null | undefined): boolean {
  if (!a || !b) return false;
  return a.address.trim().toLowerCase() === b.address.trim().toLowerCase() && a.port === b.port;
}

export function getKnownPoolForConfig(pool: Pick<PoolConfig, 'address' | 'port'> | null | undefined): KnownPool | null {
  return ALL_KNOWN_POOLS.find((knownPool) => isSamePool(pool, knownPool)) ?? null;
}

export function getKnownPoolByName(name: string | null | undefined): KnownPool | null {
  const normalizedName = name?.trim().toLowerCase();
  if (!normalizedName) return null;

  return ALL_KNOWN_POOLS.find((pool) => pool.name.trim().toLowerCase() === normalizedName) ?? null;
}
