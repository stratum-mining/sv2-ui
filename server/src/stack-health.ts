import type { HealthStatus } from '@sv2-ui/shared';
import type { SavedState } from './state.js';
import type { StatusResponse } from './types.js';

type StackMode = SavedState['mode'];
type StackContainers = StatusResponse['containers'];

function isUp(status: HealthStatus | undefined): boolean {
  return status === 'healthy' || status === 'starting';
}

export function isStackRunning(mode: StackMode, containers: StackContainers): boolean {
  return mode === 'jd'
    ? isUp(containers.translator?.status) && isUp(containers.jdc?.status)
    : isUp(containers.translator?.status);
}

/**
 * In JD mode the Translator's only upstream is JDC, and it exits when it cannot
 * reach it: while JDC is still connecting to a pool, or when JDC fails over to
 * another pool and drops its downstreams. JDC keeps mining for SV2 devices
 * connected to it directly, so only the Translator needs to come back.
 * Recreating JDC would discard its in-memory fallback progress and send it
 * back to the primary pool.
 */
export function isOnlyTranslatorStopped(mode: StackMode, containers: StackContainers): boolean {
  return mode === 'jd' && isUp(containers.jdc?.status) && !isUp(containers.translator?.status);
}

/**
 * JDC is up while the Translator is down, or was restarted and has not yet
 * stayed up long enough to count as recovered.
 */
export function isDegraded(
  mode: StackMode,
  containers: StackContainers,
  translatorRecovering: boolean
): boolean {
  return isOnlyTranslatorStopped(mode, containers) ||
    (translatorRecovering && mode === 'jd' && isUp(containers.jdc?.status));
}
