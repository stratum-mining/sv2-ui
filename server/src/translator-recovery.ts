import { SLOW_RETRY_MS } from './logs/parsers.js';
import type { DiagnosisRetryDecision } from './logs/parsers.js';

/**
 * Checks to wait before each further Translator restart: the first restart
 * happens on the check that finds it down, later ones after 1, 2, then 3
 * checks. JDC only listens for downstreams once it is connected upstream, so
 * a Translator restarted while JDC is still switching pools exits again.
 */
const RESTART_BACKOFF_CHECKS = [1, 2, 3];

/**
 * Consecutive checks a restarted Translator must be seen up before recovery
 * ends. When JDC is not listening, the Translator exits a few seconds after
 * starting, which a single check can miss.
 */
const CONFIRM_UP_CHECKS = 2;

/** How long the Translator may stay down while JDC is connected upstream. */
export const TRANSLATOR_FAILING_AFTER_MS = 60_000;

export type TranslatorObservation =
  | { kind: 'up' }
  | { kind: 'down'; jdcHasUpstream: boolean }
  // Not JD mode, not meant to be running, or JDC is down: the full stack
  // restart owns recovery then.
  | { kind: 'not-applicable' };

export type TranslatorRecoveryStatus = {
  recovering: boolean;
  downForSecs: number | null;
  failing: boolean;
};

/** What the diagnosis gate decided for a due Translator restart. */
export type TranslatorGateDecision = {
  /** Whether the restart may proceed. */
  allowed: boolean;
  /** Caller-loggable explanation; null when nothing needs saying. */
  message: string | null;
};

/**
 * Tracks a Translator that stopped while JDC keeps running, across restart
 * attempts, so the dashboard can tell a short reconnect from a Translator
 * that keeps failing.
 */
export class TranslatorRecovery {
  private downSince: number | null = null;
  private failingSince: number | null = null;
  private restarts = 0;
  private checksUntilRestart = 0;
  private upChecks = 0;
  /** The paused-diagnosis code already logged, to log the pause only once. */
  private pauseLoggedFor: string | null = null;
  /** Earliest time a 'slow'-policy diagnosis may be retried. */
  private nextSlowRetryAt = 0;

  /** Record one recovery check. */
  observe(observation: TranslatorObservation, now: number): void {
    if (observation.kind === 'not-applicable') {
      this.reset();
      return;
    }

    if (observation.kind === 'up') {
      if (this.downSince === null) return;
      this.upChecks += 1;
      if (this.upChecks >= CONFIRM_UP_CHECKS) this.reset();
      return;
    }

    this.upChecks = 0;
    this.downSince ??= now;
    // A Translator failing to reach JDC is expected while JDC has no
    // upstream; only time spent down after JDC connected counts as failing.
    this.failingSince = observation.jdcHasUpstream ? (this.failingSince ?? now) : null;
    if (this.checksUntilRestart > 0) this.checksUntilRestart -= 1;
  }

  restartDue(): boolean {
    return this.downSince !== null && this.upChecks === 0 && this.checksUntilRestart === 0;
  }

  recordRestart(): void {
    this.restarts += 1;
    this.checksUntilRestart =
      RESTART_BACKOFF_CHECKS[Math.min(this.restarts, RESTART_BACKOFF_CHECKS.length) - 1];
  }

  status(now: number): TranslatorRecoveryStatus {
    return {
      recovering: this.downSince !== null,
      downForSecs: this.downSince === null ? null : Math.floor((now - this.downSince) / 1000),
      failing: this.failingSince !== null && now - this.failingSince >= TRANSLATOR_FAILING_AFTER_MS,
    };
  }

  /**
   * Consult the diagnoses in the stopped containers' logs before a restart
   * that is otherwise due, and decide whether it may proceed.
   *
   * Same policy as the auto-start reconciler (shared evaluateDiagnosisPolicy)
   * but its own pacing state, because these are two independent loops:
   *
   * - 'pause': a fatal, user-actionable diagnosis (unknown-user) or an
   *   unrecognized one. The restart removes the Translator container, Docker
   *   deletes its logs, and the banner would blink while the evidence the
   *   user needs disappears. Logged once per occurrence; the observation
   *   keeps ticking so downForSecs/failing still count.
   * - 'slow-retry': possibly self-healing (e.g. invalid-certificate).
   *   One attempt per SLOW_RETRY_MS instead of the 1-2-3 check backoff.
   * - 'proceed': no diagnosis or only 'probe' codes; the caller's own
   *   precondition checks gate the restart as before.
   *
   * Returns whether to restart plus a message to log (once, or per slow
   * window) when there is something to say.
   */
  gateRestart(decision: DiagnosisRetryDecision, now: number): TranslatorGateDecision {
    if (decision.action === 'pause') {
      const key = decision.codes.join(', ');
      const message =
        this.pauseLoggedFor === key
          ? null
          : `Translator recovery: Translator stopped with a diagnosed failure (${key}). ` +
            'Not restarting: the fix requires user action, and the diagnostic banner ' +
            'needs the container logs to stay on screen.';
      this.pauseLoggedFor = key;
      return { allowed: false, message };
    }

    if (decision.action === 'slow-retry') {
      if (now < this.nextSlowRetryAt) return { allowed: false, message: null };
      this.nextSlowRetryAt = now + SLOW_RETRY_MS;
      return {
        allowed: true,
        message:
          `Translator recovery: diagnosed failure (${decision.codes.join(', ')}) ` +
          `may resolve on its own. Retrying at most once every ` +
          `${Math.round(SLOW_RETRY_MS / 60_000)} minutes.`,
      };
    }

    this.pauseLoggedFor = null;
    return { allowed: true, message: null };
  }

  private reset(): void {
    this.downSince = null;
    this.failingSince = null;
    this.restarts = 0;
    this.checksUntilRestart = 0;
    this.upChecks = 0;
    this.pauseLoggedFor = null;
    this.nextSlowRetryAt = 0;
  }
}
