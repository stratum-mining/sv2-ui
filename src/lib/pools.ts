/**
 * Shared pool preset definitions used by both the Setup Wizard and Settings.
 */
import type { PoolConfig } from '@sv2-ui/shared';

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
    id: 'bitaxepool',
    name: 'Bitaxe Pool',
    address: 'stratum.bitaxe.de',
    port: 3336,
    authority_public_key: '9awpfZGWfrRBH8fkf82mWvnXMSTC7i9M3mshB8M56cw9UXTGdYi',
    description: 'Bitaxe Pool',
    monogram: 'BX',
  },
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
    address: 'stratum.ckpool.org',
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

// Trusted pool identity for official branding. Requires address, port, AND
// authority public key to match. A correct endpoint with a forged or wrong key
// must never match, so this must not be used for deduplication where a
// wrong-key entry should still occupy its endpoint.
export function isSameTrustedPool(
  a: Pick<PoolConfig, 'address' | 'port' | 'authority_public_key'> | null | undefined,
  b: Pick<PoolConfig, 'address' | 'port' | 'authority_public_key'> | null | undefined,
): boolean {
  if (!a || !b) return false;
  return (
    a.address.trim().toLowerCase() === b.address.trim().toLowerCase() &&
    a.port === b.port &&
    a.authority_public_key === b.authority_public_key
  );
}

// Endpoint-only equality (address + port). Used for duplicate detection so a
// known endpoint cannot be configured twice even when the authority key is
// wrong or missing. Deliberately ignores the authority key.
export function hasSameEndpoint(
  a: Pick<PoolConfig, 'address' | 'port'> | null | undefined,
  b: Pick<PoolConfig, 'address' | 'port'> | null | undefined,
): boolean {
  if (!a || !b) return false;
  return a.address.trim().toLowerCase() === b.address.trim().toLowerCase() && a.port === b.port;
}

// Decides whether two pool entries are duplicates for editor deduplication.
// Currently any shared endpoint (address+port) collapses as a duplicate
// regardless of authority key, so a misconfigured (wrong-key) entry still
// occupies that endpoint and cannot be re-added. If the product later wants to
// intentionally support multiple authorities on one endpoint, this is the
// single place to change.
export function isDuplicatePoolEndpoint(
  a: Pick<PoolConfig, 'address' | 'port'> | null | undefined,
  b: Pick<PoolConfig, 'address' | 'port'> | null | undefined,
): boolean {
  return hasSameEndpoint(a, b);
}

export function getKnownPoolForConfig(pool: Pick<PoolConfig, 'address' | 'port' | 'authority_public_key'> | null | undefined): KnownPool | null {
  return ALL_KNOWN_POOLS.find((knownPool) => isSameTrustedPool(pool, knownPool)) ?? null;
}


