/**
 * projectMeasurement - what counts as an outcome measured in real use. PURE.
 *
 * `caseStudyFoundation` is pure so the rung a project sits on can be tested without
 * a database. The rule that decides whether an outcome EXISTS belongs in the same
 * place, for the same reason, and not inside the loader that happens to read the
 * rows.
 *
 * ## The whole rule, in one sentence
 *
 * An outcome counts when a reading was CONFIRMED against a definition that was
 * APPROVED before the reading was attached to it, and neither signature is the
 * author's own.
 *
 * Each clause is load-bearing:
 *
 *   approved definition   the question and the method were agreed in advance, so a
 *                         number cannot be chosen after the fact to flatter the work
 *   confirmed reading     somebody stood behind the value, not just typed it
 *   not self-signed       the party making a claim does not establish it. This is the
 *                         same rule `promoteMetric` enforces when it refuses
 *                         `verification_method: 'self'`
 *
 * The database holds the last clause as a CHECK constraint as well. It is repeated
 * here because this module is what the maturity ladder actually reads, and a rule
 * that lives only in a constraint is invisible to the test that matters.
 *
 * ## What this module deliberately does not do
 *
 * It does not decide whether an outcome is GOOD. A measurement that went the wrong
 * way is still an outcome measured in use, and a ladder that only climbed on good
 * news would be a marketing ladder. `direction` is carried for presentation, never
 * consulted here.
 */

/** Which way is better. Carried for presentation; never used to filter. */
export type MeasurementDirection = 'lower_is_better' | 'higher_is_better' | 'target';

export type MeasurementDefinitionStatus = 'proposed' | 'approved' | 'retired';
export type MeasurementOutcomeStatus = 'recorded' | 'confirmed' | 'withdrawn';

export interface MeasurementDefinition {
  readonly id: string;
  readonly measurementKey: string;
  readonly name: string;
  /** What question a reading of this answers, in a sentence. */
  readonly question: string;
  /** How it is measured, specifically enough that somebody else could repeat it. */
  readonly method: string;
  readonly unit: string | null;
  readonly direction: MeasurementDirection;
  readonly baselineDisplay: string | null;
  readonly status: MeasurementDefinitionStatus;
  readonly createdBy: string;
  readonly approvedBy: string | null;
  readonly approvedAt: string | null;
}

export interface MeasurementOutcome {
  readonly id: string;
  readonly definitionId: string;
  readonly valueDisplay: string;
  readonly numericValue: number | null;
  readonly unit: string | null;
  readonly baselineDisplay: string | null;
  readonly sample: string | null;
  readonly observedFrom: string | null;
  readonly observedTo: string | null;
  readonly evidence: string;
  readonly evidenceUrl: string | null;
  readonly status: MeasurementOutcomeStatus;
  readonly recordedBy: string;
  readonly confirmedBy: string | null;
  readonly confirmedAt: string | null;
}

/**
 * One outcome, as the case-study foundation exposes it.
 *
 * No identities. Who recorded and who confirmed is an access-controlled fact about
 * people, and the only thing a reader of the foundation needs is that the two were
 * different — which is true by construction of everything that produces this type.
 */
export interface OutcomeEvidenceItem {
  readonly definitionKey: string;
  readonly name: string;
  readonly question: string;
  readonly method: string;
  readonly direction: MeasurementDirection;
  readonly valueDisplay: string;
  readonly numericValue: number | null;
  readonly unit: string | null;
  readonly baselineDisplay: string | null;
  readonly sample: string | null;
  readonly observedFrom: string | null;
  readonly observedTo: string | null;
  readonly evidence: string;
  readonly confirmedAt: string;
}

const norm = (s: string | null | undefined): string => String(s ?? '').trim().toLowerCase();

/** An approved definition, signed by somebody other than whoever wrote it. */
export function definitionIsApproved(def: MeasurementDefinition): boolean {
  if (def.status !== 'approved') return false;
  if (!def.approvedBy || !def.approvedAt) return false;
  return norm(def.approvedBy) !== norm(def.createdBy);
}

/** A confirmed reading, signed by somebody other than whoever recorded it. */
export function outcomeIsConfirmed(out: MeasurementOutcome): boolean {
  if (out.status !== 'confirmed') return false;
  if (!out.confirmedBy || !out.confirmedAt) return false;
  return norm(out.confirmedBy) !== norm(out.recordedBy);
}

/**
 * The outcomes that count, in the order they were confirmed.
 *
 * An outcome whose definition is missing from `definitions` is dropped rather than
 * trusted: it means the reading cites a definition this project does not have, and a
 * reading nobody can trace to an agreed question is exactly what this refuses.
 */
export function outcomeEvidenceItems(
  definitions: readonly MeasurementDefinition[],
  outcomes: readonly MeasurementOutcome[],
): OutcomeEvidenceItem[] {
  const approved = new Map<string, MeasurementDefinition>();
  for (const d of definitions) if (definitionIsApproved(d)) approved.set(d.id, d);

  const items: OutcomeEvidenceItem[] = [];
  for (const out of outcomes) {
    if (!outcomeIsConfirmed(out)) continue;
    const def = approved.get(out.definitionId);
    if (!def) continue;

    items.push({
      definitionKey: def.measurementKey,
      name: def.name,
      question: def.question,
      method: def.method,
      direction: def.direction,
      valueDisplay: out.valueDisplay,
      numericValue: out.numericValue,
      // The reading's own unit wins: a definition can be given a unit late, and the
      // number on the page must be the one that was actually read.
      unit: out.unit ?? def.unit,
      baselineDisplay: out.baselineDisplay ?? def.baselineDisplay,
      sample: out.sample,
      observedFrom: out.observedFrom,
      observedTo: out.observedTo,
      evidence: out.evidence,
      confirmedAt: out.confirmedAt as string,
    });
  }

  items.sort((a, b) => a.confirmedAt.localeCompare(b.confirmedAt));
  return items;
}

/**
 * Why there is no outcome yet, said precisely rather than generically.
 *
 * The old sentence ("No approved measurement definitions exist...") was true of the
 * whole platform and told an individual project nothing about its own position. A
 * project with an approved definition and no reading is in a different place from one
 * with no definition at all, and a project whose reading is waiting on a second
 * signature is a message to a specific person.
 */
export function outcomeGapReason(
  definitions: readonly MeasurementDefinition[],
  outcomes: readonly MeasurementOutcome[],
): string {
  const approved = definitions.filter(definitionIsApproved);
  if (approved.length === 0) {
    return definitions.length === 0
      ? 'No measurement has been defined for this project, so nothing measured in use can be recorded as an outcome yet.'
      : 'A measurement has been proposed but not approved, so a reading against it would not count as an outcome yet.';
  }

  const approvedIds = new Set(approved.map((d) => d.id));
  const against = outcomes.filter((o) => approvedIds.has(o.definitionId));
  if (against.length === 0) {
    return 'A measurement is approved for this project, but no reading has been recorded against it yet.';
  }

  const awaiting = against.filter((o) => o.status === 'recorded');
  if (awaiting.length > 0) {
    return `${awaiting.length} ${awaiting.length === 1 ? 'reading is' : 'readings are'} recorded and waiting to be confirmed by somebody other than whoever recorded ${awaiting.length === 1 ? 'it' : 'them'}.`;
  }

  return 'Readings exist against an approved measurement, but none of them is confirmed.';
}
