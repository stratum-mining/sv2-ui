/**
 * Persistence for the sv2-ui admin credential.
 *
 * Stores a scrypt hash of the operator password next to state.json in the
 * config volume. The plaintext password MUST NOT be written to disk.
 */

import fs from 'node:fs/promises';
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { writeFileAtomically } from './atomic-write.js';

const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

export const MIN_PASSWORD_LENGTH = 8;

export type StoredCredential = {
  version: 1;
  algorithm: 'scrypt';
  salt: string;
  hash: string;
  recoveryKey?: StoredCredential;
};

export class CredentialError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CredentialError';
  }
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStoredCredentialShape(value: unknown): value is StoredCredential {
  if (!isJsonObject(value)) return false;
  return (
    value.version === 1 &&
    value.algorithm === 'scrypt' &&
    typeof value.salt === 'string' &&
    typeof value.hash === 'string'
  );
}

export function getPasswordValidationError(password: unknown): string | null {
  if (typeof password !== 'string' || password.length === 0) {
    return 'A password is required.';
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  return null;
}

export async function hashPassword(password: string): Promise<StoredCredential> {
  const salt = randomBytes(SALT_LENGTH);
  const hash = await scrypt(password, salt, KEY_LENGTH);
  return {
    version: 1,
    algorithm: 'scrypt',
    salt: salt.toString('base64'),
    hash: hash.toString('base64'),
  };
}

export async function verifyPassword(
  password: string,
  credential: StoredCredential,
): Promise<boolean> {
  const salt = Buffer.from(credential.salt, 'base64');
  const expected = Buffer.from(credential.hash, 'base64');
  if (expected.length === 0) return false;
  const actual = await scrypt(password, salt, expected.length);
  // Constant-time comparison avoids leaking the hash through timing.
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function generateRecoveryKey(): string {
  return randomBytes(24).toString('base64url');
}

export async function verifyRecoveryKey(
  recoveryKey: string,
  credential: StoredCredential | null,
): Promise<boolean> {
  if (!credential?.recoveryKey) return false;
  return verifyPassword(recoveryKey, credential.recoveryKey);
}

export async function loadCredential(filePath: string): Promise<StoredCredential | null> {
  let raw: string;
  let handle: fs.FileHandle | null = null;
  try {
    // Like state.ts: refuse to follow a symlinked credential file so a link
    // planted at the path cannot feed credentials from outside the volume.
    // O_NONBLOCK keeps a planted FIFO from wedging one threadpool worker per
    // auth request, which stalls the whole server after a few requests.
    handle = await fs.open(
      filePath,
      fs.constants.O_RDONLY | fs.constants.O_NONBLOCK | fs.constants.O_NOFOLLOW,
    );
    raw = await handle.readFile('utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw new CredentialError('Stored credential could not be read.');
  } finally {
    await handle?.close();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new CredentialError('Stored credential could not be read.');
  }

  if (!isStoredCredentialShape(parsed)) {
    throw new CredentialError('Stored credential is malformed.');
  }

  if (parsed.recoveryKey !== undefined && !isStoredCredentialShape(parsed.recoveryKey)) {
    throw new CredentialError('Stored credential is malformed.');
  }

  return parsed as unknown as StoredCredential;
}

export async function saveCredential(
  filePath: string,
  credential: StoredCredential,
): Promise<void> {
  await writeFileAtomically(filePath, `${JSON.stringify(credential, null, 2)}\n`, { mode: 0o600 });
}
