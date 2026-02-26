export const CONTAINER_NAMES = {
  tproxy: 'tproxy',
  jd_client: 'jd_client',
} as const;

export const IMAGES = {
  tproxy: 'stratumv2/translator_sv2:main',
  jd_client: 'stratumv2/jd_client_sv2:main',
} as const;

export const NETWORK_NAME = 'sv2';

export const CONFIG_DIR = process.env.CONFIG_DIR || '/data/configs';

// Docker volume name for the sv2-ui data volume (used when mounting configs into sibling containers)
// This must match the volume name from docker-compose.yml (project name + volume name)
export const DATA_VOLUME_NAME = process.env.DATA_VOLUME_NAME || 'sv2-ui_sv2-data';

export const PORTS = {
  tproxy: {
    downstream: 34255,
    monitoring: 9092,
  },
  jd_client: {
    listening: 34265,
    monitoring: 9091,
  },
} as const;

export const CONFIG_FILES = {
  tproxy: 'translator-config.toml',
  jd_client: 'jdc-config.toml',
} as const;

export const BITCOIN_CORE = {
  image: 'sv2-bitcoin-core-ipc:30.2',
  contextPath: '/app/bitcoin-core-ipc',
  containers: {
    mainnet: 'sv2-bitcoin-mainnet',
    testnet4: 'sv2-bitcoin-testnet',
    regtest: 'sv2-bitcoin-regtest',
  },
  volumes: {
    data: {
      mainnet: 'sv2-bitcoin-mainnet-data',
      testnet4: 'sv2-bitcoin-testnet-data',
      regtest: 'sv2-bitcoin-regtest-data',
    },
    ipc: {
      mainnet: 'sv2-bitcoin-mainnet-ipc',
      testnet4: 'sv2-bitcoin-testnet-ipc',
      regtest: 'sv2-bitcoin-regtest-ipc',
    },
  },
  ports: {
    mainnet: { rpc: 8332, p2p: 8333 },
    testnet4: { rpc: 48332, p2p: 48333 },
    regtest: { rpc: 18443, p2p: 18444 },
  },
  env: {
    mainnet: {
      NETWORK: 'mainnet',
      RPC_USER: 'stratum',
      RPC_PASSWORD: 'stratum123',
    },
    testnet4: {
      NETWORK: 'testnet4',
      RPC_USER: 'stratum',
      RPC_PASSWORD: 'stratum123',
    },
    regtest: {
      NETWORK: 'regtest',
      RPC_USER: 'stratum',
      RPC_PASSWORD: 'stratum123',
    },
  },
} as const;
