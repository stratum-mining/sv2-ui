/**
 * Persistence for the user-owned setup data.
 *
 * Generated TOML files can always be recreated. state.json cannot: it is the
 * durable record of the choices needed to recreate those files, so it is
 * written atomically and invalid data is never treated as a fresh install.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { normalizeBitcoinCoreVersion } from '@sv2-ui/shared';
import { normalizeSetupData } from './config-generator.js';
import { ensureConfigDir } from './config-dir.js';
import { writeFileAtomically } from './atomic-write.js';
import type { SetupData } from './types.js';

export type SavedState = {
  configured: boolean;
  miningMode: 'solo' | 'pool' | null;
  mode: 'jd' | 'no-jd' | null;
  data: SetupData | null;
  shouldBeRunning: boolean;
};

export class SavedStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SavedStateError';
  }
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function getDefaultState(): SavedState {
  return {
    configured: false,
    miningMode: null,
    mode: null,
    data: null,
    shouldBeRunning: false,
  };
}

function normalizePersistedSetupData(data: SetupData): SetupData {
  const normalizedBitcoinData = data.bitcoin
    ? {
      ...data,
      bitcoin: {
        ...data.bitcoin,
        core_version: normalizeBitcoinCoreVersion(data.bitcoin.core_version),
      },
    }
    : data;

  return normalizeSetupData(normalizedBitcoinData);
}

/**
 * Validate and normalise the saved user setup. Service configuration changes
 * are handled by regenerating TOML files; this only protects the saved user
 * choices from being silently discarded or overwritten.
 */
export function normalizeSavedState(rawState: unknown): SavedState {
  if (!isJsonObject(rawState)) {
    throw new SavedStateError('Saved setup is not a JSON object');
  }

  const rawData = rawState.data;
  if (rawData !== undefined && rawData !== null && !isJsonObject(rawData)) {
    throw new SavedStateError('Saved setup data has an invalid shape');
  }

  const configured = rawState.configured === undefined
    ? rawData !== undefined && rawData !== null
    : rawState.configured;
  if (typeof configured !== 'boolean') {
    throw new SavedStateError('Saved setup has an invalid configured flag');
  }
  if (configured && (rawData === undefined || rawData === null)) {
    throw new SavedStateError('Saved setup is marked configured but has no setup data');
  }
  if (!configured && rawData !== undefined && rawData !== null) {
    throw new SavedStateError('Saved setup contains data but is marked unconfigured');
  }

  if (rawState.shouldBeRunning !== undefined && typeof rawState.shouldBeRunning !== 'boolean') {
    throw new SavedStateError('Saved setup has an invalid running preference');
  }

  const data = rawData === undefined || rawData === null
    ? null
    : normalizePersistedSetupData(rawData as unknown as SetupData);

  return {
    configured,
    miningMode: data?.miningMode ?? null,
    mode: data?.mode ?? null,
    data,
    shouldBeRunning: rawState.shouldBeRunning === undefined
      ? configured
      : rawState.shouldBeRunning as boolean,
  };
}

export async function loadSavedState(stateFile: string): Promise<SavedState> {
  let content: string;
  try {
    // O_NOFOLLOW refuses a symlinked state file; O_NONBLOCK keeps a planted
    // FIFO from wedging a threadpool worker.
    const handle = await fs.open(
      stateFile,
      fs.constants.O_RDONLY | fs.constants.O_NONBLOCK | fs.constants.O_NOFOLLOW,
    );
    try {
      content = await handle.readFile('utf8');
    } finally {
      await handle.close();
    }
  } catch (error) {
    // Only a missing file is a fresh install. Unreadable/corrupt state is
    // preserved and surfaced to the UI so setup cannot overwrite it.
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return getDefaultState();
    }
    throw new SavedStateError('Saved setup could not be read');
  }

  let rawState: unknown;
  try {
    rawState = JSON.parse(content) as unknown;
  } catch {
    throw new SavedStateError('Saved setup contains invalid JSON');
  }

  try {
    return normalizeSavedState(rawState);
  } catch (error) {
    if (error instanceof SavedStateError) throw error;
    throw new SavedStateError('Saved setup data has an invalid shape');
  }
}

export async function saveSavedState(
  stateFile: string,
  data: SetupData,
  shouldBeRunning = true,
): Promise<void> {
  const normalizedData = normalizePersistedSetupData(data);
  await ensureConfigDir(path.dirname(stateFile));
  await writeFileAtomically(stateFile, JSON.stringify({
    configured: true,
    miningMode: normalizedData.miningMode,
    mode: normalizedData.mode,
    data: normalizedData,
    shouldBeRunning,
  }, null, 2), { mode: 0o600 });
}
