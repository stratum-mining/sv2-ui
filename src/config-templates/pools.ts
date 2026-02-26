/**
 * Pool Configuration Data
 *
 * Predefined configurations for available Stratum V2 pools that miners can connect to.
 *
 * Available pools:
 * - community_sri: SRI Community Pool (mainnet & testnet4)
 *   - Supports both JD and non-JD modes
 *   - Community hosted for testing
 *
 * - braiins: Braiins Pool (mainnet only)
 *   - Non-JD mode only (uses pool's templates)
 *   - Leading mining pool provider
 *
 * - demand: DMND Pool (mainnet only)
 *   - Supports both JD and non-JD modes
 */

import type { PoolConfig } from './types.js';

// Re-export the type for backward compatibility
export type { PoolConfig };

export const POOLS: Record<string, PoolConfig> = {
  braiins: {
    name: "Braiins Pool",
    address: "107.170.42.64",
    port: 3333,
    authorityPubkey: "9awtMD5KQgvRUh2yFbjVeT7b6hjipWcAsQHd6wEhgtDT9soosna",
    aggregateChannels: true,
    iconUrl: "https://avatars.githubusercontent.com/u/9007738?s=280&v=4"
  },
  community_sri: {
    name: "Community SRI Pool",
    address: "75.119.150.111",
    port: 3333, // Default (mainnet), will be overridden by network-specific configs
    authorityPubkey: "9auqWEzQDVyd2oe1JVGFLMLHZtCo2FFqZwtKA5gd9xbuEu7PH72",
    aggregateChannels: false,
    jdsAddress: "75.119.150.111",
    jdsPort: 3334, // Default (mainnet), will be overridden by network-specific configs
    iconUrl: "https://stratumprotocol.org/assets/sv2-logo.png",
    networks: {
      mainnet: {
        port: 3333,
        jdsPort: 3334,
      },
      testnet4: {
        port: 43333,
        jdsPort: 43334,
      }
    }
  },
  blitzpool: {
    name: "Blitzpool",
    address: "62.2.188.226",
    port: 3333,
    authorityPubkey: "9bCoFxTszKCuffyywH5uS5o6WcU4vsjTH2axxc7wE86y2HhvULU",
    aggregateChannels: false,
    jdsAddress: "62.2.188.226",
    jdsPort: 3335,
    iconUrl: "/blitzpool-logo.png"
  },
  blitzpool_regtest: {
    name: "Blitzpool Regtest",
    address: "62.2.188.235",
    port: 3333,
    authorityPubkey: "9bCoFxTszKCuffyywH5uS5o6WcU4vsjTH2axxc7wE86y2HhvULU",
    aggregateChannels: false,
    jdsAddress: "62.2.188.235",
    jdsPort: 3335,
    iconUrl: "/blitzpool-logo.png"
  },
  demand: {
    name: "DMND",
    address: "127.0.0.1", // Placeholder - update when available
    port: 34254,
    authorityPubkey: "9auqWEzQDVyd2oe1JVGFLMLHZtCo2FFqZwtKA5gd9xbuEu7PH72", // Placeholder
    aggregateChannels: false,
    jdsAddress: "127.0.0.1", // Placeholder - update when available
    jdsPort: 34264,
    iconUrl: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTYJ8mwY8Huwid6Op_rGoQawOGKkH0UhKQkXw&s"
  }
};

export function getPoolConfig(
  poolValue: string | undefined,
  network?: 'mainnet' | 'testnet4' | 'regtest'
): PoolConfig | null {
  if (!poolValue) return null;

  // Map pool values to config keys
  const poolMap: Record<string, string> = {
    "braiins": "braiins",
    "community_sri": "community_sri",
    "blitzpool": "blitzpool",
    "blitzpool_regtest": "blitzpool_regtest",
    "demand": "demand"
  };

  const poolKey = poolMap[poolValue];
  if (!poolKey || !POOLS[poolKey]) return null;

  const baseConfig = POOLS[poolKey];

  // If network is specified and pool has network-specific config, merge it
  if (network && baseConfig.networks?.[network]) {
    return {
      ...baseConfig,
      ...baseConfig.networks[network]
    };
  }

  return baseConfig;
}
