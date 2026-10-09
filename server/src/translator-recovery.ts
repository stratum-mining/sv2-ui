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

  private reset(): void {
    this.downSince = null;
    this.failingSince = null;
    this.restarts = 0;
    this.checksUntilRestart = 0;
    this.upChecks = 0;
  }
}
