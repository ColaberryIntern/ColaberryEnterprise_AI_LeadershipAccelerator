/**
 * requirementTriagePlan — decide what a triage backfill WOULD change. PURE, no I/O, no writes.
 *
 * Separated from the runner so the decision is unit-testable without a database, and so a
 * reviewer can read the rules that govern a production write without reading Sequelize calls.
 *
 * ## The rule that matters most
 *
 * A row a human has already confirmed is NEVER touched. The classifier is a proposal; a person
 * who has looked at the row and said "yes, this is what it means" outranks it, and silently
 * overwriting that is the difference between a helpful backfill and a destructive one. This is
 * the same principle that keeps `deriveAllocation` from filling gaps in the blueprint path:
 * machine-derived content must not quietly displace a recorded human decision.
 *
 * ## Why `interpretation` and not a new column
 *
 * `ContractRequirement` already carries `interpretation` (free text, null until someone writes
 * it) and `human_confirmed`. The triage verdict belongs there, as a proposal awaiting
 * confirmation. Adding a column would be a migration, and a migration to store an opinion that
 * a person has not yet agreed with is the wrong shape.
 */

import { triageStatement, type TriageClass } from '../../services/factory/proposal/requirementTriage';

export interface TriagePlanRow {
  readonly id: string;
  readonly canonicalReqId: string;
  readonly statement: string;
  readonly kind: string | null;
  readonly priority: string | null;
  readonly interpretation: string | null;
  readonly humanConfirmed: boolean;
}

export interface TriageChange {
  readonly id: string;
  readonly canonicalReqId: string;
  readonly from: { kind: string | null; priority: string | null };
  readonly to: { kind: string; priority: string };
  readonly triageClass: TriageClass;
  /** What goes in `interpretation`: the verdict AND the evidence for it. */
  readonly interpretation: string;
}

export interface TriagePlan {
  readonly changes: TriageChange[];
  /** Rows a human already confirmed WITH content. Never touched, counted so the skip is visible. */
  readonly skippedConfirmed: string[];
  /**
   * Rows flagged `human_confirmed` whose interpretation is EMPTY — confirmed nothing.
   *
   * Measured 5 Nov 2026: all 56 Herriman rows, and 859 of 864 platform-wide, carry the flag,
   * while every Herriman interpretation is the empty string. A flag set on 99.4% of rows with
   * no content behind it is a default applied when requirements are established, not a record
   * of anybody's judgement. Keying the refusal on the flag alone protected the label and
   * blocked the entire backfill; keying it on the CONTENT protects the actual decision.
   *
   * Reported separately rather than folded into `changes`, because "a row claims human
   * confirmation it does not have" is a data-integrity finding someone should see, not a
   * detail to absorb silently.
   */
  readonly confirmedButEmpty: string[];
  /** Rows already carrying exactly what the triage would write. Idempotency in one number. */
  readonly alreadyCorrect: string[];
  readonly byClass: Record<TriageClass, number>;
}

/** The marker that makes a previously-written interpretation recognisable, so re-runs are no-ops. */
export const TRIAGE_PREFIX = 'TRIAGE:';

export function interpretationFor(cls: TriageClass, reason: string): string {
  return `${TRIAGE_PREFIX} ${cls} - ${reason}`;
}

/**
 * Work out what would change. Deterministic: same rows in, same plan out.
 *
 * Reports `alreadyCorrect` separately from `changes` so a second run is visibly a no-op rather
 * than appearing to have found nothing to do because something broke.
 */
export function planTriageBackfill(rows: readonly TriagePlanRow[]): TriagePlan {
  const changes: TriageChange[] = [];
  const skippedConfirmed: string[] = [];
  const confirmedButEmpty: string[] = [];
  const alreadyCorrect: string[] = [];
  const byClass: Record<TriageClass, number> = { obligation: 0, city_process: 0, question: 0, note: 0 };

  for (const row of rows) {
    const t = triageStatement(row.statement);
    byClass[t.triageClass] += 1;

    // A decision is protected by its CONTENT, not by a boolean. `interpretation` arrives as the
    // empty string rather than null on every Herriman row, so a null check would also have been
    // fooled - "not null" is not "has something in it".
    const hasRecordedDecision = (row.interpretation ?? '').trim() !== ''
      && !(row.interpretation ?? '').startsWith(TRIAGE_PREFIX);

    if (row.humanConfirmed && hasRecordedDecision) {
      skippedConfirmed.push(row.canonicalReqId);
      continue;
    }
    if (row.humanConfirmed) confirmedButEmpty.push(row.canonicalReqId);

    const interpretation = interpretationFor(t.triageClass, t.reason);
    const same = row.kind === t.kind
      && row.priority === t.priority
      && row.interpretation === interpretation;
    if (same) {
      alreadyCorrect.push(row.canonicalReqId);
      continue;
    }

    changes.push({
      id: row.id,
      canonicalReqId: row.canonicalReqId,
      from: { kind: row.kind, priority: row.priority },
      to: { kind: t.kind, priority: t.priority },
      triageClass: t.triageClass,
      interpretation,
    });
  }

  return { changes, skippedConfirmed, confirmedButEmpty, alreadyCorrect, byClass };
}

export function renderTriagePlan(projectId: string, plan: TriagePlan, execute: boolean): string {
  const total = plan.changes.length + plan.skippedConfirmed.length + plan.alreadyCorrect.length;
  const binding = plan.byClass.obligation;
  const lines: string[] = [
    '',
    `=== Requirement triage backfill: ${projectId} ===`,
    `  rows                  : ${total}`,
    `  would change          : ${plan.changes.length}`,
    `  already correct       : ${plan.alreadyCorrect.length}`,
    `  skipped (human-confirmed WITH content, never overwritten) : ${plan.skippedConfirmed.length}`,
    `  flagged human-confirmed but EMPTY (confirmed nothing)      : ${plan.confirmedButEmpty.length}`,
    '',
    `  binding on us         : ${binding}`,
    `  buyer's own process   : ${plan.byClass.city_process}`,
    `  questions             : ${plan.byClass.question}`,
    `  notes                 : ${plan.byClass.note}`,
    '',
  ];
  for (const c of plan.changes.slice(0, 60)) {
    const from = `${c.from.kind ?? 'null'}/${c.from.priority ?? 'null'}`;
    const to = `${c.to.kind}/${c.to.priority}`;
    lines.push(`  ${c.canonicalReqId.padEnd(9)} ${from.padEnd(22)} -> ${to.padEnd(22)} ${c.triageClass}`);
  }
  if (plan.changes.length > 60) lines.push(`  ... and ${plan.changes.length - 60} more`);
  lines.push('');
  lines.push(execute
    ? '  EXECUTE=1 -- applying now. human_confirmed stays FALSE: this is a proposal, not a ruling.'
    : '  PREFLIGHT ONLY. Nothing was written. Re-run with EXECUTE=1 to apply.');
  lines.push('');
  return lines.join('\n');
}
