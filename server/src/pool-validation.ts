import bs58check from 'bs58check';
import type { PoolConfig } from './types.js';

const MAX_POOL_NAME_LENGTH = 128;
const MAX_POOL_ADDRESS_LENGTH = 255;
const MAX_AUTHORITY_KEY_LENGTH = 128;
const MAX_IDENTITY_LENGTH = 512;

// These characters can escape or terminate a generated TOML basic string.
// eslint-disable-next-line no-control-regex
const TOML_UNSAFE_CHARS = /["\\\u0000-\u001F\u007F]/;

function isSafeBoundedString(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' &&
    value.length > 0 &&
    value.length <= maxLength &&
    value === value.trim() &&
    !TOML_UNSAFE_CHARS.test(value);
}

function isValidAuthorityPublicKey(value: unknown): value is string {
  if (!isSafeBoundedString(value, MAX_AUTHORITY_KEY_LENGTH)) return false;

  try {
    bs58check.decode(value);
    return true;
  } catch {
    return false;
  }
}

export function getPoolConfigError(pool: PoolConfig, label: string): string | null {
  if (typeof pool.name !== 'string' || pool.name.length === 0 || pool.name.length > MAX_POOL_NAME_LENGTH) {
    return `${label} name is required and must be at most ${MAX_POOL_NAME_LENGTH} characters`;
  }
  if (!isSafeBoundedString(pool.address, MAX_POOL_ADDRESS_LENGTH)) {
    return `${label} address is required and cannot contain quotes, backslashes, control characters, or surrounding whitespace`;
  }
  if (!Number.isInteger(pool.port) || pool.port <= 0 || pool.port > 65535) {
    return `${label} port must be between 1 and 65535`;
  }
  if (!isValidAuthorityPublicKey(pool.authority_public_key)) {
    return `${label} authority public key is invalid`;
  }
  if (!isSafeBoundedString(pool.user_identity, MAX_IDENTITY_LENGTH)) {
    return `${label} username is required and cannot contain quotes, backslashes, control characters, or surrounding whitespace`;
  }
  return null;
}
