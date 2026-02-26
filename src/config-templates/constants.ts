// Constants and default values for configuration

export const DEFAULT_AUTHORITY_PUBLIC_KEY = "9auqWEzQDVyd2oe1JVGFLMLHZtCo2FFqZwtKA5gd9xbuEu7PH72";
export const DEFAULT_AUTHORITY_SECRET_KEY = "mkDLTBBRxdBv998612qipDYoTK3YUrqLe8uWw7gu3iXbSrn2n";

// Default configuration values
export const DEFAULT_CONFIG_VALUES = {
  // Shares and difficulty
  sharesPerMinute: 6.0,
  shareBatchSize: 10,
  minIndividualMinerHashrate: 10000000000000.0, // 100Th/s in H/s

  // Fee and interval
  feeThreshold: 100,
  minInterval: 5,

  // Network ports
  poolPort: 34254,
  jdsPort: 34264,
  jdcPort: 34265,
  translatorDownstreamPort: 34255,

  // RPC ports by network
  rpcPorts: {
    mainnet: 8332,
    testnet4: 48332,
    regtest: 18443
  },

  // Addresses
  localhost: "127.0.0.1",
  anyAddress: "0.0.0.0",

  // User defaults
  defaultUserIdentity: "your_username_here",
  defaultJdcSignature: "Sv2MinerSignature",
  defaultPoolSignature: "Stratum V2 SRI Pool",

  // Address placeholders
  addressPlaceholders: {
    mainnet: "bc1q...",
    testnet4: "tb1q...",
    regtest: "bcrt1q..."
  }
} as const;

type NetworkKey = 'mainnet' | 'testnet4' | 'regtest';

// Network-specific RPC ports
export function getRpcPort(network: NetworkKey = 'mainnet'): number {
  return DEFAULT_CONFIG_VALUES.rpcPorts[network];
}

// Get address placeholder for network
export function getAddressPlaceholder(network: NetworkKey = 'mainnet'): string {
  return DEFAULT_CONFIG_VALUES.addressPlaceholders[network];
}
