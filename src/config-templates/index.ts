// Main entry point for config templates module

// Types
export type { PoolConfig, ConfigTemplateData, ConfigType } from './types.js';

// Constants
export {
  DEFAULT_AUTHORITY_PUBLIC_KEY,
  DEFAULT_AUTHORITY_SECRET_KEY,
  DEFAULT_CONFIG_VALUES,
  getRpcPort,
  getAddressPlaceholder
} from './constants.js';

// Templates
export {
  JD_CLIENT_CONFIG_TEMPLATE,
  TRANSLATOR_CONFIG_TEMPLATE,
} from './templates/index.js';

// Utilities
export { processConfigTemplate } from './utils.js';

// Config builders
export {
  buildJdClientConfig,
  buildTranslatorConfig,
} from './config-builder.js';

// Pools
export { POOLS, getPoolConfig } from './pools.js';
export type { PoolConfig as PoolConfigType } from './pools.js';
