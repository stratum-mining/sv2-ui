import type { BitcoinNetwork, MiningMode, PoolConfig } from '@sv2-ui/shared';
import { getPoolIdentityError } from './miningIdentity';
import { isValidPoolAuthorityPubkey } from './utils';

export function isPoolConnectionComplete(pool: PoolConfig | null | undefined): boolean {
  return Boolean(
    pool?.address &&
    Number.isInteger(pool.port) &&
    pool.port > 0 &&
    pool.port <= 65535 &&
    (pool.jds_port === undefined || (
      Number.isInteger(pool.jds_port) && pool.jds_port > 0 && pool.jds_port <= 65535
    )) &&
    isValidPoolAuthorityPubkey(pool.authority_public_key),
  );
}

export function isPoolComplete(
  pool: PoolConfig | null | undefined,
  miningMode: MiningMode | null,
  network: BitcoinNetwork,
): boolean {
  return Boolean(
    isPoolConnectionComplete(pool) &&
    !getPoolIdentityError(pool, miningMode, network),
  );
}
