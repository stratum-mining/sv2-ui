/**
 * Reconciles the mining stack against the saved intent to run it.
 *
 * `shouldBeRunning` in state.json is the durable record of the user wanting
 * mining to be up. This reconciler keeps that intent true across app boots,
 * app updates, and generated-config drift: whenever the stack is stopped or
 * running with stale generated files, it brings the stack back in line.
 *
 * Two guards keep that recovery from fighting the diagnostic banners (PR
 * #96 made the mining containers RestartPolicy=no so a failed container
 * stays stopped and its logs stay readable):
 *
 * - Diagnosed failures pause recovery. Before restarting a stopped stack
 *   the reconciler reads the stopped containers' logs and consults each
 *   diagnostic's autoRetry policy. A fatal, user-actionable scenario
 *   (unknown-user) or an unrecognized one must not trigger blind
 *   restarts: stopStack removes the containers, Docker deletes their
 *   logs with them, and the banner would blink every tick while the
 *   evidence the user needs disappears. Retryable scenarios fall through
 *   to the start path; its own precondition checks (the Bitcoin Core
 *   socket probe) still gate JD restarts.
 *
 * - Crash loops back off. A stack that stops again shortly after
 *   auto-start started it counts as a start failure, so the existing
 *   exponential backoff applies instead of a restart every tick. Success
 *   is only declared when a later tick observes the stack running, not
 *   when startStack returns.
 *
 * The node's Bitcoin Core version is also confirmed before any JDC start (see
 * bitcoin-core-version.ts). It comes before the two guards above, because a
 * corrected version is exactly what a diagnosed version mismatch is waiting
 * for, and a paused stack would otherwise never get the chance to recover.
 *
 * It is deliberately extracted from index.ts with injected dependencies so
 * the decision logic is unit-testable. The stack-operation lock (which is
 * shared with the manual start/stop endpoints and surfaced as
 * `autoStarting` in /api/status) stays with the caller via the injected
 * `tryAcquire`/`release` pair.
 */

import type { SetupData, StatusResponse } from './types.js';
import type { SavedState } from './state.js';
import type { PreparedServiceConfig, ServiceConfigFile } from './service-config.js';
import type { ContainerLogLine } from './logs/types.js';
import { evaluateDiagnosisPolicy } from './logs/parsers.js';
import type { DiagnosisRetryDecision } from './logs/parsers.js';
import { isOnlyTranslatorStopped, isStackRunning } from './stack-health.js';
import type { BitcoinCoreVersionCheck, BitcoinCoreVersionIssue } from './bitcoin-core-version.js';

const VERSION_MISMATCH_DIAGNOSIS = 'jdc-bitcoin-core-unsupported-mining-interface';

export const AUTO_START_MIN_BACKOFF_MS = 60_000;
export const AUTO_START_MAX_BACKOFF_MS = 5 * 60_000;

/**
 * A stack that stops again within this window of an auto-start start is
 * crash-looping rather than recovering, so it counts as a failed start.
 * Two 30s ticks plus slack.
 */
export const QUICK_EXIT_WINDOW_MS = 90_000;

type StackContainers = StatusResponse['containers'];

type ReadyServiceConfig = Extract<PreparedServiceConfig, { kind: 'ready' }>;

type VersionReconciliation = {
  prepared: ReadyServiceConfig;
  /** The saved version was wrong, so the stack has to restart on the new one. */
  corrected: boolean;
  /** The node's version was read on this tick. */
  confirmed: boolean;
};

export type AutoStartDeps = {
  loadState: () => Promise<SavedState>;
  getStackStatus: (mode: SavedState['mode']) => Promise<StackContainers>;
  prepareServiceConfig: (
    data: SetupData,
    options?: { logFailure?: boolean },
  ) => PreparedServiceConfig;
  getServiceConfigDrift: (files: ServiceConfigFile[], configDir: string) => Promise<string[]>;
  reconcileServiceConfigFiles: (files: ServiceConfigFile[], configDir: string) => Promise<string[]>;
  stopStack: () => Promise<void>;
  startStack: (data: SetupData, configDir: string) => Promise<void>;
  saveState: (data: SetupData, shouldBeRunning: boolean) => Promise<void>;
  getBitcoinSocketStartupError: (data: SetupData) => Promise<string | null>;
  checkBitcoinCoreVersion: (data: SetupData) => Promise<BitcoinCoreVersionCheck>;
  /** Recent log lines of the mining containers for the current mode. */
  readStackLogs: (mode: SavedState['mode']) => Promise<ContainerLogLine[]>;
  /** Take the shared stack-operation lock, or return false when busy. */
  tryAcquire: () => boolean;
  /** Release the shared lock; only meaningful after a successful tryAcquire. */
  release: () => void;
  configDir: string;
  now?: () => number;
  log?: Pick<Console, 'log' | 'error'>;
};

export class AutoStartReconciler {
  private failureCount = 0;
  private nextAttemptAt = 0;
  private setupReviewLogged = false;
  /** When the last auto-start-initiated start completed; null when none. */
  private autoStartedAt: number | null = null;
  /** The paused-diagnosis code already logged, to log the pause only once. */
  private pauseLoggedFor: string | null = null;
  /** Whether the node's version has been read since this server booted. */
  private versionConfirmed = false;
  /** Why the node's version is keeping mining stopped; null when it isn't. */
  private versionIssue: BitcoinCoreVersionIssue | null = null;
  private nodeStartingLogged = false;

  constructor(private readonly deps: AutoStartDeps) {}

  bitcoinCoreVersionIssue(): BitcoinCoreVersionIssue | null {
    return this.versionIssue;
  }

  /**
   * Clear the failure backoff and one-shot logs so the next failure is
   * reported from scratch. Manual start paths call this because they hold
   * the lock themselves and do not go through reconcile.
   */
  resetRecoveryState(): void {
    this.resetBackoff();
    this.setupReviewLogged = false;
    this.autoStartedAt = null;
    this.pauseLoggedFor = null;
    this.versionIssue = null;
  }

  async reconcile(): Promise<void> {
    if (this.nextAttemptAt > this.now()) return;
    if (!this.deps.tryAcquire()) return;

    try {
      const state = await this.deps.loadState();
      if (!state.configured || !state.data || !state.shouldBeRunning) {
        this.resetRecoveryState();
        return;
      }

      const containers = await this.deps.getStackStatus(state.mode);
      const savedConfig = this.deps.prepareServiceConfig(state.data, {
        logFailure: !this.setupReviewLogged,
      });
      const running = isStackRunning(state.mode, containers);

      if (savedConfig.kind !== 'ready') {
        this.setupReviewLogged = true;
        // A required setup choice is missing. Stop stale services and let the
        // wizard reopen with saved fields prefilled.
        if (running) {
          this.log().log('Auto-start: setup review is required. Stopping the existing stack.');
          await this.deps.stopStack();
        }
        this.resetBackoff();
        return;
      }
      this.setupReviewLogged = false;

      const version = await this.reconcileBitcoinCoreVersion(
        savedConfig,
        running || isOnlyTranslatorStopped(state.mode, containers),
      );
      if (version === null) return;
      const { prepared, corrected, confirmed } = version;

      // Check drift before considering a running stack healthy. This repairs an
      // interrupted update and applies new generated configuration on boot.
      const drift = await this.deps.getServiceConfigDrift(prepared.files, this.deps.configDir);
      if (running && drift.length === 0 && !corrected) {
        // The stack is up and matches the desired config: this is the only
        // place success is declared. A start that returns but stops again
        // must reach the quick-exit check below instead of clearing the
        // backoff it just earned.
        this.resetRecoveryState();
        return;
      }

      // recoverTranslator restarts the Translator on its own schedule. A full
      // restart here would recreate JDC and send it back to the primary pool.
      if (drift.length === 0 && !corrected && isOnlyTranslatorStopped(state.mode, containers)) {
        this.resetRecoveryState();
        return;
      }

      if (!running) {
        // Restarting removes the stopped containers, and Docker deletes a
        // container's logs when it is removed. Decide from the failure's
        // retry policy first so a user-actionable diagnosis keeps its
        // evidence (and its steady banner) on screen.
        const pause = await this.evaluateStoppedStackDiagnostics(state, confirmed);
        if (pause !== null) return;

        // A stack that stopped again right after we started it is
        // crash-looping: count it as a failed start so the backoff
        // applies, instead of recreating (and log-wiping) every tick. A
        // corrected version is a new attempt, not the same one crashing.
        if (!corrected && this.autoStartedAt !== null &&
          this.now() - this.autoStartedAt < QUICK_EXIT_WINDOW_MS) {
          this.autoStartedAt = null;
          this.recordFailure(
            new Error(`Mining services stopped within ${Math.round(QUICK_EXIT_WINDOW_MS / 1000)}s of an auto-start`),
          );
          return;
        }
      }

      if (prepared.data.mode === 'jd') {
        const socketError = await this.deps.getBitcoinSocketStartupError(prepared.data);
        if (socketError) {
          this.recordFailure(socketError);
          return;
        }
      }

      if (running) {
        this.log().log(`Auto-start: generated configuration changed (${drift.join(', ')}). Restarting containers...`);
      } else {
        this.log().log('Auto-start: shouldBeRunning=true and stack is stopped. Starting containers...');
      }

      await this.deps.stopStack();
      const changedFiles = await this.deps.reconcileServiceConfigFiles(prepared.files, this.deps.configDir);
      if (changedFiles.length > 0) {
        this.log().log(`Auto-start reconciled generated configuration: ${changedFiles.join(', ')}`);
      }

      await this.deps.saveState(prepared.data, true);
      await this.deps.startStack(prepared.data, this.deps.configDir);
      // Only now is JDC on this version. Remembering a correction any earlier
      // would skip the next check if anything above failed, and an old JDC
      // that is still up would count as healthy on the wrong version.
      if (confirmed) this.versionConfirmed = true;
      this.autoStartedAt = this.now();
      this.log().log('Auto-start: containers started successfully');
    } catch (error) {
      this.recordFailure(error);
    } finally {
      this.deps.release();
    }
  }

  /**
   * Read the node's version and apply it to the generated configuration, or
   * return null when mining must not start on this tick.
   *
   * Changing a node's version restarts it, and that stops JDC. So a JDC that
   * is still up runs the version last confirmed, and only the first tick after
   * this server boots needs to ask, in case the stack outlived a crash of it.
   */
  private async reconcileBitcoinCoreVersion(
    prepared: ReadyServiceConfig,
    jdcUp: boolean,
  ): Promise<VersionReconciliation | null> {
    const unchecked = { prepared, corrected: false, confirmed: false };
    if (prepared.data.mode !== 'jd' || (jdcUp && this.versionConfirmed)) return unchecked;

    const check = await this.deps.checkBitcoinCoreVersion(prepared.data);
    const wasStarting = this.nodeStartingLogged;
    this.nodeStartingLogged = check.kind === 'node-starting';

    switch (check.kind) {
      case 'confirmed':
        this.versionConfirmed = true;
        this.versionIssue = null;
        return { prepared, corrected: false, confirmed: true };

      case 'corrected': {
        const correctedConfig = this.deps.prepareServiceConfig(check.data, { logFailure: true });
        if (correctedConfig.kind !== 'ready') {
          throw new Error(`Could not prepare the configuration for Bitcoin Core ${check.to}.`);
        }
        this.log().log(`Auto-start: Bitcoin Core version changed from ${check.from ?? 'unset'} to ${check.to}.`);
        this.versionIssue = null;
        return { prepared: correctedConfig, corrected: true, confirmed: true };
      }

      case 'node-starting':
        // Not a failure: this resolves by itself in seconds or minutes, so no
        // backoff, which could leave a ready node idle for several minutes.
        if (!wasStarting) {
          this.log().log('Auto-start: Bitcoin Core is still starting. Waiting for it.');
        }
        return null;

      case 'node-unavailable':
        // The socket check below reports this, and more precisely.
        this.versionIssue = null;
        return unchecked;

      case 'refused':
        this.versionIssue = check.issue;
        // JDC may be on the wrong version, where it would lose any block it
        // finds, so it must not keep mining on an unconfirmed version.
        if (jdcUp) {
          this.log().log('Auto-start: could not confirm the Bitcoin Core version. Stopping the existing stack.');
          await this.deps.stopStack();
        }
        this.recordFailure(check.detail);
        return null;
    }
  }

  /**
   * Consult the diagnostics in the stopped containers' logs and return a
   * pause reason when auto-start must not restart, or null when it may.
   *
   * The decision itself comes from the shared evaluateDiagnosisPolicy so
   * this loop and translator recovery cannot drift apart; the log-once
   * state stays here.
   *
   * A version mismatch in those logs is out of date once the node's version
   * has been read, because the next start uses that version.
   */
  private async evaluateStoppedStackDiagnostics(
    state: SavedState,
    versionConfirmed: boolean,
  ): Promise<string | null> {
    let decision: DiagnosisRetryDecision;
    try {
      decision = evaluateDiagnosisPolicy(await this.deps.readStackLogs(state.mode), state.mode);
    } catch {
      // Log read failures are not a diagnosis. Proceeding is safe: the
      // start path already tolerates Docker hiccups via backoff.
      return null;
    }

    const pausingCodes = decision.action !== 'pause'
      ? []
      : decision.codes.filter((code) => !versionConfirmed || code !== VERSION_MISMATCH_DIAGNOSIS);

    if (pausingCodes.length > 0) {
      const key = pausingCodes.join(', ');
      if (this.pauseLoggedFor !== key) {
        this.pauseLoggedFor = key;
        this.log().log(
          `Auto-start: mining services are stopped with a diagnosed failure (${key}). ` +
          'Not restarting: the fix requires user action, and the diagnostic banner ' +
          'needs the container logs to stay on screen.',
        );
      }
      return `diagnosed:${key}`;
    }

    // No diagnosis or only 'retry' policies: proceed and let the start
    // path's precondition checks (Bitcoin Core socket) gate the restart.
    // If the restart fails quickly, the quick-exit backoff in reconcile()
    // paces the next attempt and leaves the stopped containers in place.
    this.pauseLoggedFor = null;
    return null;
  }

  private now(): number {
    return this.deps.now ? this.deps.now() : Date.now();
  }

  private log(): Pick<Console, 'log' | 'error'> {
    return this.deps.log ?? console;
  }

  private resetBackoff(): void {
    this.failureCount = 0;
    this.nextAttemptAt = 0;
  }

  private recordFailure(error: unknown): void {
    this.failureCount += 1;
    const delayMs = Math.min(
      AUTO_START_MIN_BACKOFF_MS * 2 ** (this.failureCount - 1),
      AUTO_START_MAX_BACKOFF_MS,
    );
    this.nextAttemptAt = this.now() + delayMs;

    this.log().error('Auto-start failed:', error);
    this.log().log(`Auto-start: retrying in ${Math.round(delayMs / 1000)}s.`);
  }
}
