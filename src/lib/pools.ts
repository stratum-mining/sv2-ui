/**
 * Shared pool preset definitions used by both the Setup Wizard and Settings.
 */
import type { PoolConfig, SetupData } from '@sv2-ui/shared';

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
  /**
   * Endpoints this preset used before its current one. A setup saved with one
   * of them is still this pool: it keeps the preset's name and logo and is
   * offered the current endpoint. Each one is matched on address, port and
   * key together, like the current endpoint. Leave out an endpoint whose key
   * was retired because it leaked: setups still on it must not keep the
   * preset's name and logo.
   */
  previousEndpoints?: Pick<PoolConfig, 'address' | 'port' | 'authority_public_key'>[];
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
    address: 'stratum.ckpool.org',
    port: 3336,
    authority_public_key: '9anrRNhBh7869XtNnFcCuGBRZP51E635qGbu457J5kHdszhfRc3',
    description: 'CKPool',
    monogram: 'CK',
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
    previousEndpoints: [
      { address: 'public-pool.io', port: 3333, authority_public_key: '9c4zpyJ2ndm4e8sP2uNc1VNCGxYjqaxWS6wUCjk8zFj6njFquH6' },
    ],
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

export const CUSTOM_POOL_BASE_NAME = 'Custom Pool';

// Returns "Custom Pool", then "Custom Pool 2", "Custom Pool 3", ... using the
// lowest number not already taken.
export function getNextCustomPoolName(pools: Pick<PoolConfig, 'name'>[]): string {
  const usedNames = new Set(pools.map((pool) => pool.name?.trim().toLowerCase()));
  if (!usedNames.has(CUSTOM_POOL_BASE_NAME.toLowerCase())) return CUSTOM_POOL_BASE_NAME;

  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${CUSTOM_POOL_BASE_NAME} ${suffix}`;
    if (!usedNames.has(candidate.toLowerCase())) return candidate;
  }
}

export function createEmptyCustomPool(userIdentity = '', name = CUSTOM_POOL_BASE_NAME): PoolConfig {
  return {
    name,
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

export function getKnownPoolForConfig(
  pool: Pick<PoolConfig, 'address' | 'port' | 'authority_public_key'> | null | undefined,
  presets: KnownPool[] = ALL_KNOWN_POOLS,
): KnownPool | null {
  return presets.find((preset) => isSameTrustedPool(pool, preset))
    ?? presets.find((preset) => preset.previousEndpoints?.some((endpoint) => isSameTrustedPool(pool, endpoint)))
    ?? null;
}

// The preset a pool was saved from, when that preset has since moved to a new
// endpoint. Null for custom pools and pools already on the current endpoint.
export function getMovedPreset(pool: PoolConfig, presets: KnownPool[] = ALL_KNOWN_POOLS): KnownPool | null {
  const preset = getKnownPoolForConfig(pool, presets);
  return preset && !isSameTrustedPool(pool, preset) ? preset : null;
}

// Sovereign solo mining uses no upstream pools, even when an older save still
// holds a primary pool.
function getUpstreamPools(config: SetupData): PoolConfig[] {
  if (config.miningMode === 'solo' && config.mode === 'jd') return [];
  return [config.pool, ...(config.fallbackPools ?? [])].filter((pool): pool is PoolConfig => Boolean(pool));
}

export function getMovedPresetPools(
  config: SetupData | null | undefined,
  presets: KnownPool[] = ALL_KNOWN_POOLS,
): { pool: PoolConfig; preset: KnownPool }[] {
  if (!config) return [];
  return getUpstreamPools(config).flatMap((pool) => {
    const preset = getMovedPreset(pool, presets);
    return preset ? [{ pool, preset }] : [];
  });
}

// Moves each saved pool on a moved preset's old endpoint to the current one,
// keeping its identity and priority. If the current endpoint is also in the
// list, only the higher-priority entry is kept: the backend would save the
// duplicate, and the pool editors would then refuse to save the list.
export function withCurrentPresetEndpoints(
  config: SetupData,
  presets: KnownPool[] = ALL_KNOWN_POOLS,
): Pick<SetupData, 'pool' | 'fallbackPools'> {
  const pools = getUpstreamPools(config).map((pool) => {
    const preset = getMovedPreset(pool, presets);
    return preset
      ? { ...pool, address: preset.address, port: preset.port, authority_public_key: preset.authority_public_key }
      : pool;
  });
  const [pool = null, ...fallbackPools] = pools.filter((pool, index) => (
    !pools.slice(0, index).some((earlier) => hasSameEndpoint(earlier, pool))
  ));
  return { pool, fallbackPools };
}

// Indexes of all pools that share an address and port with another pool in the
// list. Pools without an address yet are skipped, so empty custom pools don't count.
export function getDuplicatePoolEndpointIndexes(
  pools: Array<Pick<PoolConfig, 'address' | 'port'> | null | undefined>,
): Set<number> {
  const duplicates = new Set<number>();
  pools.forEach((pool, index) => {
    if (!pool?.address.trim()) return;
    pools.forEach((other, otherIndex) => {
      if (otherIndex <= index || !other?.address.trim()) return;
      if (isDuplicatePoolEndpoint(pool, other)) {
        duplicates.add(index);
        duplicates.add(otherIndex);
      }
    });
  });
  return duplicates;
}

// Presets the pool editors still offer. A preset is taken when a pool is on its
// endpoint, whatever the key, or is that preset on one of its old endpoints.
export function getUnselectedPresets(presets: KnownPool[], pools: PoolConfig[]): KnownPool[] {
  return presets.filter((preset) => !pools.some((pool) => (
    isDuplicatePoolEndpoint(pool, preset) || getKnownPoolForConfig(pool, presets) === preset
  )));
}
