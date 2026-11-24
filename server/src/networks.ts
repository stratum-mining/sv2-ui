/**
 * Which Bitcoin networks this server offers.
 *
 * Regtest is useful for development and CI, but it must not appear in the
 * production image, where a setup against a test chain would only lose time.
 * The flag only controls discovery and the setup wizard: a saved regtest setup
 * stays valid so turning the option off cannot stop a stack that already runs.
 */

import { ALL_NETWORKS, SUPPORTED_NETWORKS } from '@sv2-ui/shared';
import type { BitcoinNetwork } from '@sv2-ui/shared';

function explicitRegtestSetting(env: NodeJS.ProcessEnv): boolean | null {
  const value = env.ENABLE_REGTEST?.trim().toLowerCase();
  if (value === '1' || value === 'true') return true;
  if (value === '0' || value === 'false') return false;
  return null;
}

export function isRegtestEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const explicit = explicitRegtestSetting(env);
  if (explicit !== null) return explicit;
  return env.NODE_ENV !== 'production';
}

export function getDiscoveryNetworks(env: NodeJS.ProcessEnv = process.env): BitcoinNetwork[] {
  return isRegtestEnabled(env) ? ALL_NETWORKS : SUPPORTED_NETWORKS;
}
