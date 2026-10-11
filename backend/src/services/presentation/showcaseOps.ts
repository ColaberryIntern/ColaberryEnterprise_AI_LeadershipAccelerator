/**
 * The operator's tools: rematch a recording, retry an ingest, reschedule a slot,
 * correct a publication.
 *
 * EVERY ONE OF THESE REASSIGNS SOMEBODY ELSE'S WORK, so all of them are shaped the
 * same way and none of them is a single button.
 *
 * PREVIEW, THEN COMMIT — two functions, never one with a `dryRun` flag. `previewOps`
 * contains no write statement of any kind, so it cannot write however it is called. A
 * flag threaded through a function that also writes is one forgotten `if` away from
 * silently reassigning forty students' recordings, and that is not a thing you can
 * undo by apologising.
 *
 * NO SILENT REASSIGNMENT. Every committed action writes an audit row naming WHO did
 * it, WHAT moved, and FROM WHERE. "The recording is on the wrong student" is a
 * question somebody will ask six weeks later, and the answer has to exist.
 *
 * THE PLAN IS UNTRUSTED ON THE WAY BACK IN. It is handed to the operator's browser
 * and returned, so commit re-verifies every row against the database rather than
 * acting on what came back. The plan decides what to CONSIDER, never what is allowed.
 */

/** Lazy so importing this module never constructs the ORM. */
async function db() {
  const { sequelize } = await import('../../config/database');
  return sequelize;
}

export type OpKind = 'rematch_recording' | 'retry_ingest' | 'reschedule_slot' | 'correct_publication';

export const OP_KINDS: readonly OpKind[] = [
  'rematch_recording', 'retry_ingest', 'reschedule_slot', 'correct_publication',
];

export interface OpTarget {
  /** The row the action would change. */
  id: string;
  kind: OpKind;
  /** Where it is now, in words an operator can check. */
  currentState: string;
  /** What committing would do to it. */
  wouldDo: string;
  /** Why it cannot be acted on, when it cannot. */
  blockedReason: string | null;
}

export interface OpsPlan {
  dry_run: true;
  generated_at: string;
  kind: OpKind;
  targets: OpTarget[];
  summary: { actionable: number; blocked: number };
}

export interface OpsReport {
  dry_run: false;
  committed_at: string;
  results: Array<{ id: string; outcome: 'done' | 'skipped' | 'failed'; detail: string }>;
  summary: { done: number; skipped: number; failed: number };
}

/**
 * THE DRY RUN. This function contains no write statement, which is a property you can
 * check by reading it rather than a promise made in a comment.
 */
export async function previewOps(kind: OpKind, ids: string[]): Promise<OpsPlan> {
  const generated_at = new Date().toISOString();
  const unique = [...new Set(ids.filter(Boolean))].slice(0, 500);
  if (unique.length === 0) {
    return { dry_run: true, generated_at, kind, targets: [], summary: { actionable: 0, blocked: 0 } };
  }

  const sequelize = await db();
  const targets: OpTarget[] = [];

  if (kind === 'rematch_recording' || kind === 'retry_ingest') {
    const [rows] = await sequelize.query(
      `SELECT id, attempt_id, ingest_status, ingest_provenance, occurrence_uuid
         FROM presentation_recordings
        WHERE id IN (:ids)`,
      { replacements: { ids: unique } },
    ) as [Array<Record<string, any>>, unknown];
    for (const r of rows || []) {
      const parked = String(r.attempt_id) === '00000000-0000-0000-0000-000000000000';
      targets.push({
        id: String(r.id),
        kind,
        currentState: `${r.ingest_status}${parked ? ', owned by nobody' : `, on attempt ${String(r.attempt_id).slice(0, 8)}`}`,
        wouldDo: kind === 'retry_ingest'
          ? 'Queue this part for another ingest attempt.'
          : 'Detach it from its current attempt and send it back for matching.',
        // A recording a student is relying on must not be moved without a human
        // reading the row first.
        blockedReason: r.ingest_status === 'ingested' && !parked
          ? 'Already ingested against a real attempt. Rematching would take a recording off a student.'
          : null,
      });
    }
  } else if (kind === 'correct_publication') {
    const [rows] = await sequelize.query(
      `SELECT id, audience, published_at, withdrawn_at FROM presentation_showcases WHERE id IN (:ids)`,
      { replacements: { ids: unique } },
    ) as [Array<Record<string, any>>, unknown];
    for (const r of rows || []) {
      targets.push({
        id: String(r.id),
        kind,
        currentState: r.withdrawn_at ? 'withdrawn' : (r.published_at ? `published to ${r.audience}` : 'not published'),
        wouldDo: 'Withdraw the publication and return it to the author for re-approval.',
        blockedReason: r.published_at ? null : 'Not published, so there is nothing to correct.',
      });
    }
  } else {
    const [rows] = await sequelize.query(
      `SELECT id, state, starts_at FROM presentation_slot_reservations WHERE id IN (:ids)`,
      { replacements: { ids: unique } },
    ) as [Array<Record<string, any>>, unknown];
    for (const r of rows || []) {
      targets.push({
        id: String(r.id),
        kind,
        currentState: String(r.state),
        wouldDo: 'Release the slot so it can be re-booked.',
        blockedReason: r.state === 'released' ? 'Already released.' : null,
      });
    }
  }

  return {
    dry_run: true,
    generated_at,
    kind,
    targets,
    summary: {
      actionable: targets.filter((t) => !t.blockedReason).length,
      blocked: targets.filter((t) => Boolean(t.blockedReason)).length,
    },
  };
}

function log(event: string, ctx: Record<string, unknown>): void {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(), level: 'info',
    service: 'presentation-ops', event, outcome: 'success', context: ctx,
  }));
}

/**
 * Write the audit row BEFORE the change, so a change that half-happens still has a
 * record of having been attempted. An audit written afterwards is an audit that is
 * missing for exactly the operations anyone will want to look up.
 */
async function audit(actor: string, kind: OpKind, targetId: string, from: string, to: string): Promise<void> {
  const sequelize = await db();
  await sequelize.query(
    `INSERT INTO presentation_ops_audit (actor, op_kind, target_id, from_state, to_state)
     VALUES (:actor, :kind, :target, :from, :to)`,
    { replacements: { actor, kind, target: targetId, from: from.slice(0, 300), to: to.slice(0, 300) } },
  );
}

/**
 * Commit a plan the operator has read.
 *
 * Every row is re-verified here: the plan came back from a browser and anything a
 * browser returns is something a browser could have invented.
 */
export async function commitOps(params: { plan: OpsPlan; actorId: string }): Promise<OpsReport> {
  const { plan, actorId } = params;
  const committed_at = new Date().toISOString();
  const results: OpsReport['results'] = [];

  // Re-derive from the database rather than trusting what came back.
  const fresh = await previewOps(plan.kind, plan.targets.map((t) => t.id));
  const byId = new Map(fresh.targets.map((t) => [t.id, t]));

  for (const claimed of plan.targets) {
    const actual = byId.get(claimed.id);
    if (!actual) {
      results.push({ id: claimed.id, outcome: 'skipped', detail: 'No longer exists, or is not of this kind.' });
      continue;
    }
    if (actual.blockedReason) {
      results.push({ id: claimed.id, outcome: 'skipped', detail: actual.blockedReason });
      continue;
    }
    try {
      await audit(actorId, plan.kind, claimed.id, actual.currentState, actual.wouldDo);
      await applyOne(plan.kind, claimed.id);
      results.push({ id: claimed.id, outcome: 'done', detail: actual.wouldDo });
    } catch (e) {
      results.push({ id: claimed.id, outcome: 'failed', detail: (e as Error)?.message || 'failed' });
    }
  }

  const summary = {
    done: results.filter((r) => r.outcome === 'done').length,
    skipped: results.filter((r) => r.outcome === 'skipped').length,
    failed: results.filter((r) => r.outcome === 'failed').length,
  };
  log('ops_committed', { kind: plan.kind, actor: actorId, ...summary });
  return { dry_run: false, committed_at, results, summary };
}

async function applyOne(kind: OpKind, id: string): Promise<void> {
  const sequelize = await db();
  if (kind === 'retry_ingest') {
    await sequelize.query(
      `UPDATE presentation_recordings SET ingest_status = 'expected', updated_at = NOW() WHERE id = :id`,
      { replacements: { id } },
    );
  } else if (kind === 'rematch_recording') {
    await sequelize.query(
      `UPDATE presentation_recordings
          SET attempt_id = '00000000-0000-0000-0000-000000000000',
              ingest_status = 'review',
              review_reason = 'Sent back for matching by an operator.',
              updated_at = NOW()
        WHERE id = :id`,
      { replacements: { id } },
    );
  } else if (kind === 'correct_publication') {
    await sequelize.query(
      `UPDATE presentation_showcases
          SET withdrawn_at = NOW(), withdrawn_reason = 'Corrected by an operator.', updated_at = NOW()
        WHERE id = :id`,
      { replacements: { id } },
    );
  } else {
    await sequelize.query(
      `UPDATE presentation_slot_reservations
          SET state = 'released', released_at = NOW(), released_reason = 'Released by an operator.', updated_at = NOW()
        WHERE id = :id`,
      { replacements: { id } },
    );
  }
}
