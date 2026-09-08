/**
 * Explorer Growth OS — health checks. Plan §8.3, §28 (EPIC 13).
 *
 * Answers one question: is this system telling the truth about the learners it
 * is responsible for?
 *
 * THE CHECK THAT EXISTS BECAUSE OF A REAL INCIDENT. On 2026-09-07 the nightly
 * recompute was found to iterate `explorer_journey_profiles` — so it could only
 * ever refresh learners who ALREADY had a profile row, and profile creation ran
 * only when someone triggered it by hand. The scored population had frozen on
 * 13 August: 212 active Explorers, 152 with a profile, **60 invisible**. The
 * batch reported `succeeded: 152, failed: 0`.
 *
 * Nothing was stale. Nothing errored. Every metric was green, because a
 * staleness check reads the profiles table and a learner with no row is not in
 * it. **A check that counts the population it is checking will never find the
 * population it is missing.** So `evaluateCoverage` counts against ENROLLMENTS
 * and asks a different question: who should have a profile and does not?
 *
 * Every evaluator here is pure. The I/O wrapper at the bottom gathers counts
 * and hands them over, so the judgment — the part that is easy to get subtly
 * wrong — is exhaustively testable without a database.
 */

export type Severity = 'ok' | 'warn' | 'critical';

export interface HealthFinding {
  check: string;
  severity: Severity;
  /** One sentence a human can act on, with the numbers in it. */
  detail: string;
  /** Stable classification for structured logs (CLAUDE.md observability). */
  error_class?: string;
}

/** §8.3 — the Governor refuses to decide on a profile older than this. */
export const STALE_AFTER_HOURS = 26;

/**
 * Learners who should have a profile but do not.
 *
 * CRITICAL rather than warn at any non-zero count, and deliberately so. A
 * missing profile is not a degraded signal, it is a learner the system cannot
 * see at all: they are absent from every roster, every forecast stage and every
 * decision. One is a bug; sixty is what we actually had.
 */
export function evaluateCoverage(activeExplorers: number, withProfile: number): HealthFinding {
  const missing = activeExplorers - withProfile;

  if (activeExplorers === 0) {
    return {
      check: 'coverage',
      severity: 'warn',
      detail: 'No active Explorers found at all — expected a non-zero population',
      error_class: 'NoPopulation',
    };
  }
  if (missing < 0) {
    // More profiles than active Explorers: rows for learners who churned, or
    // two populations counted over different windows. Either way the
    // denominator is wrong and every derived rate is wrong with it.
    return {
      check: 'coverage',
      severity: 'warn',
      detail: `${withProfile} profiles for ${activeExplorers} active Explorers — more profiles than learners`,
      error_class: 'CoverageInverted',
    };
  }
  if (missing > 0) {
    const pct = Math.round((missing / activeExplorers) * 100);
    return {
      check: 'coverage',
      severity: 'critical',
      detail: `${missing} of ${activeExplorers} active Explorers (${pct}%) have no journey profile and are invisible to every decision`,
      error_class: 'ProfileCoverageGap',
    };
  }
  return {
    check: 'coverage',
    severity: 'ok',
    detail: `All ${activeExplorers} active Explorers have a journey profile`,
  };
}

/**
 * Profiles not recomputed within the §8.3 window.
 *
 * Some staleness is normal — a recompute takes time and a learner created
 * minutes ago has not been scored yet. Wholesale staleness means the cron is
 * not running, which is the difference between a warn and a critical.
 */
export function evaluateStaleness(totalProfiles: number, staleProfiles: number): HealthFinding {
  if (totalProfiles === 0) {
    return {
      check: 'staleness',
      severity: 'warn',
      detail: 'No profiles exist to check for staleness',
      error_class: 'NoProfiles',
    };
  }
  const share = staleProfiles / totalProfiles;
  if (share >= 0.5) {
    return {
      check: 'staleness',
      severity: 'critical',
      detail: `${staleProfiles} of ${totalProfiles} profiles older than ${STALE_AFTER_HOURS}h — the recompute is not running`,
      error_class: 'RecomputeNotRunning',
    };
  }
  if (staleProfiles > 0) {
    return {
      check: 'staleness',
      severity: 'warn',
      detail: `${staleProfiles} of ${totalProfiles} profiles older than ${STALE_AFTER_HOURS}h`,
      error_class: 'ProfilesStale',
    };
  }
  return {
    check: 'staleness',
    severity: 'ok',
    detail: `All ${totalProfiles} profiles recomputed within ${STALE_AFTER_HOURS}h`,
  };
}

/**
 * Decision volume against its recent baseline.
 *
 * BOTH DIRECTIONS ARE FAULTS. A collapse means the Governor stopped deciding;
 * a spike means it is deciding far more than usual, which on a send-enabled
 * path is the shape of an incident rather than a good day. Zero is called out
 * separately because "no decisions at all" reads as calm on a chart while
 * being the loudest possible signal.
 */
export function evaluateDecisionVolume(today: number, baselineMean: number): HealthFinding {
  if (baselineMean <= 0) {
    return {
      check: 'decision_volume',
      severity: 'ok',
      detail: `No baseline yet (${today} decisions today)`,
    };
  }
  if (today === 0) {
    return {
      check: 'decision_volume',
      severity: 'critical',
      detail: `No decisions today against a baseline of ${baselineMean.toFixed(1)}`,
      error_class: 'DecisionVolumeZero',
    };
  }
  const ratio = today / baselineMean;
  if (ratio >= 3) {
    return {
      check: 'decision_volume',
      severity: 'critical',
      detail: `${today} decisions today, ${ratio.toFixed(1)}x the baseline of ${baselineMean.toFixed(1)}`,
      error_class: 'DecisionVolumeSpike',
    };
  }
  if (ratio <= 0.33) {
    return {
      check: 'decision_volume',
      severity: 'warn',
      detail: `${today} decisions today, ${Math.round(ratio * 100)}% of the baseline of ${baselineMean.toFixed(1)}`,
      error_class: 'DecisionVolumeDrop',
    };
  }
  return {
    check: 'decision_volume',
    severity: 'ok',
    detail: `${today} decisions today, in line with a baseline of ${baselineMean.toFixed(1)}`,
  };
}

/**
 * Share of candidates dropped by suppression.
 *
 * A HIGH rate is expected and healthy — WAIT is by design the most common
 * outcome (§8), and contact policy exists to say no. What is not healthy is
 * 100%, which means nothing can ever be selected and the system is dark while
 * appearing to run, or a sudden fall to zero, which means a gate stopped
 * applying.
 */
export function evaluateSuppressionRate(suppressed: number, candidates: number): HealthFinding {
  if (candidates === 0) {
    return {
      check: 'suppression_rate',
      severity: 'ok',
      detail: 'No candidates evaluated',
    };
  }
  const rate = suppressed / candidates;
  if (rate >= 1) {
    return {
      check: 'suppression_rate',
      severity: 'critical',
      detail: `All ${candidates} candidates suppressed — nothing can ever be selected`,
      error_class: 'SuppressionTotal',
    };
  }
  if (rate === 0) {
    return {
      check: 'suppression_rate',
      severity: 'warn',
      detail: `None of ${candidates} candidates suppressed — a contact gate may have stopped applying`,
      error_class: 'SuppressionAbsent',
    };
  }
  return {
    check: 'suppression_rate',
    severity: 'ok',
    detail: `${Math.round(rate * 100)}% of ${candidates} candidates suppressed`,
  };
}

export interface HealthInputs {
  activeExplorers: number;
  profilesTotal: number;
  profilesStale: number;
  decisionsToday: number;
  decisionBaselineMean: number;
  candidatesEvaluated: number;
  candidatesSuppressed: number;
}

export interface HealthReport {
  severity: Severity;
  findings: HealthFinding[];
}

/** The worst severity present — a report is only as healthy as its worst check. */
export function worstSeverity(findings: HealthFinding[]): Severity {
  if (findings.some((f) => f.severity === 'critical')) return 'critical';
  if (findings.some((f) => f.severity === 'warn')) return 'warn';
  return 'ok';
}

/** Evaluate every check. Pure: the caller supplies the counts. */
export function evaluateHealth(inputs: HealthInputs): HealthReport {
  const findings = [
    evaluateCoverage(inputs.activeExplorers, inputs.profilesTotal),
    evaluateStaleness(inputs.profilesTotal, inputs.profilesStale),
    evaluateDecisionVolume(inputs.decisionsToday, inputs.decisionBaselineMean),
    evaluateSuppressionRate(inputs.candidatesSuppressed, inputs.candidatesEvaluated),
  ];
  return { severity: worstSeverity(findings), findings };
}
