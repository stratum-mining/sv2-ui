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
 *   evidence the user needs disappears. Self-healing scenarios retry on
 *   a slow schedule; probe-gated ones fall through to the start path's
 *   precondition checks.
 *
 * - Crash loops back off. A stack that stops again shortly after
 *   auto-start started it counts as a start failure, so the existing
 *   exponential backoff applies instead of a restart every tick. Success
 *   is only declared when a later tick observes the stack running, not
 *   when startStack returns.
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
import { evaluateDiagnosisPolicy, SLOW_RETRY_MS } from './logs/parsers.js';
import type { DiagnosisRetryDecision } from './logs/parsers.js';
import { isOnlyTranslatorStopped, isStackRunning } from './stack-health.js';

export const AUTO_START_MIN_BACKOFF_MS = 60_000;
export const AUTO_START_MAX_BACKOFF_MS = 5 * 60_000;

/**
 * A stack that stops again within this window of an auto-start start is
 * crash-looping rather than recovering, so it counts as a failed start.
 * Two 30s ticks plus slack.
 */
export const QUICK_EXIT_WINDOW_MS = 90_000;

type StackContainers = StatusResponse['containers'];

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
  /** Earliest time a 'slow'-policy diagnosis may be retried. */
  private nextSlowRetryAt = 0;
  /** The paused-diagnosis code already logged, to log the pause only once. */
  private pauseLoggedFor: string | null = null;

  constructor(private readonly deps: AutoStartDeps) {}

  /**
   * Backoff after repeated failures. Called by manual start paths (which
   * hold the lock themselves and do not go through reconcile) so a
   * user-initiated restart clears the retry schedule.
   */
  resetRecoveryState(): void {
    this.resetBackoff();
    this.setupReviewLogged = false;
    this.autoStartedAt = null;
    this.nextSlowRetryAt = 0;
    this.pauseLoggedFor = null;
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
      const prepared = this.deps.prepareServiceConfig(state.data, {
        logFailure: !this.setupReviewLogged,
      });
      const running = isStackRunning(state.mode, containers);

      if (prepared.kind !== 'ready') {
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

      // Check drift before considering a running stack healthy. This repairs an
      // interrupted update and applies new generated configuration on boot.
      const drift = await this.deps.getServiceConfigDrift(prepared.files, this.deps.configDir);
      if (running && drift.length === 0) {
        // The stack is up and matches the desired config: this is the only
        // place success is declared. A start that returns but stops again
        // must reach the quick-exit check below instead of clearing the
        // backoff it just earned.
        this.resetRecoveryState();
        return;
      }

      // recoverTranslator restarts the Translator on its own schedule. A full
      // restart here would recreate JDC and send it back to the primary pool.
      if (drift.length === 0 && isOnlyTranslatorStopped(state.mode, containers)) {
        this.resetRecoveryState();
        return;
      }

      if (!running) {
        // A stack that stopped again right after we started it is
        // crash-looping: count it as a failed start so the backoff
        // applies, instead of recreating (and log-wiping) every tick.
        if (this.autoStartedAt !== null &&
          this.now() - this.autoStartedAt < QUICK_EXIT_WINDOW_MS) {
          this.autoStartedAt = null;
          this.recordFailure(
            new Error(`Mining services stopped within ${Math.round(QUICK_EXIT_WINDOW_MS / 1000)}s of an auto-start`),
          );
          return;
        }

        // Restarting removes the stopped containers, and Docker deletes a
        // container's logs when it is removed. Decide from the failure's
        // retry policy first so a user-actionable diagnosis keeps its
        // evidence (and its steady banner) on screen.
        const pause = await this.evaluateStoppedStackDiagnostics(state);
        if (pause !== null) return;
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
      this.autoStartedAt = this.now();
      this.log().log('Auto-start: containers started successfully');
    } catch (error) {
      this.recordFailure(error);
    } finally {
      this.deps.release();
    }
  }

  /**
   * Consult the diagnostics in the stopped containers' logs and return a
   * pause reason when auto-start must not restart, or null when it may.
   *
   * The decision itself comes from the shared evaluateDiagnosisPolicy so
   * this loop and translator recovery cannot drift apart; the pacing state
   * (log-once, slow-retry window) stays here.
   */
  private async evaluateStoppedStackDiagnostics(state: SavedState): Promise<string | null> {
    let decision: DiagnosisRetryDecision;
    try {
      decision = evaluateDiagnosisPolicy(await this.deps.readStackLogs(state.mode));
    } catch {
      // Log read failures are not a diagnosis. Proceeding is safe: the
      // start path already tolerates Docker hiccups via backoff.
      return null;
    }

    if (decision.action === 'pause') {
      const key = decision.codes.join(', ');
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

    if (decision.action === 'slow-retry') {
      if (this.now() < this.nextSlowRetryAt) return 'slow-retry-pending';
      this.nextSlowRetryAt = this.now() + SLOW_RETRY_MS;
      this.log().log(
        `Auto-start: diagnosed failure (${decision.codes.join(', ')}) may resolve on its own. ` +
        `Retrying at most once every ${Math.round(SLOW_RETRY_MS / 60_000)} minutes.`,
      );
      return null;
    }

    // No diagnosis or only 'probe' codes: proceed and let the start path's
    // precondition checks (Bitcoin Core socket) gate the restart.
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
