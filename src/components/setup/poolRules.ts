import type { PoolConfig } from './types';

const BRAIINS_POOL_AUTHORITY_KEY = '9awtMD5KQgvRUh2yFbjVeT7b6hjipWcAsQHd6wEhgtDT9soosna';
const BRAIINS_POOL_ADDRESS = 'stratum.braiins.com';
const BRAIINS_POOL_NAME = 'Braiins Pool';

export function isAggregatedTproxyPoolName(poolName: string | null | undefined): boolean {
  return poolName?.trim().toLowerCase() === BRAIINS_POOL_NAME.toLowerCase();
}

export function shouldAggregateTranslatorChannels(pool: PoolConfig | null): boolean {
  if (!pool) return false;

  return pool.authority_public_key === BRAIINS_POOL_AUTHORITY_KEY
    || pool.address.toLowerCase() === BRAIINS_POOL_ADDRESS;
}
