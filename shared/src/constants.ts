import type { BitcoinCoreVersion, BitcoinNetwork, OperatingSystem } from './types.js';

export const SUPPORTED_BITCOIN_CORE_VERSIONS: BitcoinCoreVersion[] = ['30', '31'];

export const SUPPORTED_NETWORKS: BitcoinNetwork[] = ['mainnet', 'testnet4'];

export const DEFAULT_BITCOIN_PATHS: Record<OperatingSystem, string> = {
  linux: '~/.bitcoin',
  macos: '~/Library/Application Support/Bitcoin',
  umbrel: '~/.bitcoin',
};

export const RPC_PORTS: Record<BitcoinNetwork, number> = {
  mainnet: 8332,
  testnet4: 48332,
};

export const CONTAINER_NAMES = {
  network: 'sv2-network',
  configVolume: 'sv2-config',
  translator: 'sv2-translator',
  jdc: 'sv2-jdc',
} as const;

export const DOCKER_SOCKET_PATHS = [
  '/var/run/docker.sock',
  '~/.docker/run/docker.sock',
  '~/Library/Containers/com.docker.docker/Data/docker-cli.sock',
  '~/.colima/default/docker.sock',
  '~/.orbstack/run/docker.sock',
] as const;

export const TRANSLATOR_PORT = 34255;
export const JDC_PORT = 34265;
export const JDC_AUTHORITY_PUBLIC_KEY = '9auqWEzQDVyd2oe1JVGFLMLHZtCo2FFqZwtKA5gd9xbuEu7PH72';

export const TRANSLATOR_MONITORING_PORT = 9092;
export const JDC_MONITORING_PORT = 9091;

export const DEFAULT_SHARES_PER_MINUTE = 6;
export const DEFAULT_DOWNSTREAM_EXTRANONCE2_SIZE = 4;
export const DEFAULT_MIN_HASHRATE = 100_000_000_000_000;
export const DEFAULT_POOL_PORT = 34254;
export const MAX_FALLBACK_POOLS = 16;

export function computeDefaultSocketPath(dataDir: string, network: BitcoinNetwork): string {
  return network === 'mainnet' ? `${dataDir}/node.sock` : `${dataDir}/${network}/node.sock`;
}
