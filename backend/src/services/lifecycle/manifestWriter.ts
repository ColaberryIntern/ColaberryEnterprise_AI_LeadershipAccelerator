/**
 * THE FIRST THING IN PRODUCTION THAT CREATES AN OPERATING BLUEPRINT MANIFEST.
 *
 * Phase 4 closed with this named as a dependency: "Production never CREATES an
 * `operating_blueprint_manifests` row — it only reads and updates one." Until something wrote
 * it, `refs_json` was empty, the content hash had nothing to hash, and the §4.1 approval-
 * invalidation rule could not be implemented even though it was written down. The only two
 * INSERTs in the repository were in tests.
 *
 * ## Idempotency, and why the key is the refs rather than the revision
 *
 * Writing a manifest is side-effecting, so it needs a key. The obvious one — (tenant, project,
 * revision) — cannot work, because THIS function is what chooses the revision: keying on it
 * cannot distinguish a replay from a legitimate new revision, since every replay looks new and
 * every new revision looks like a replay depending on who incremented first.
 *
 * So the key is `(tenant, project, sha256(refs))`, stored in `refs_sha256` with a pair of
 * partial unique indexes behind it. A second call with identical refs returns the existing row.
 *
 * That also refuses a later revision whose refs are byte-identical to an earlier one. This is a
 * DESIGN CHOICE with a cost, and an earlier version of this comment overstated it as a logical
 * identity — "a revert and a replay are indistinguishable BY CONSTRUCTION". They are
 * distinguishable: a later revision exists for the project, and the row carries `revision`,
 * `status` and `prior_revision_id` to say so.
 *
 * What the choice actually costs: REVERT-AND-SUPERSEDE does not work. A project that reverts to
 * an earlier blueprint gets the OLD row back — possibly `status = ’superseded’`, at a revision
 * below head — which `approveBlueprint`’s CAS then refuses. It fails loudly rather than
 * corrupting anything, and `WriteManifestResult` deliberately exposes `revision` so a caller can
 * notice. The plan mandates this key, so the behaviour stands; the justification is "identical
 * refs record nothing new", not "the two cases cannot be told apart".
 *
 * ## Two different conflicts, two different answers
 *
 * The table carries two unique constraints, so a failed insert means one of two things:
 *
 *   - the REFS index fired — someone already wrote exactly this. A replay. Re-read and return it.
 *   - the REVISION index fired — a concurrent writer took the revision we picked, with DIFFERENT
 *     refs. Not a replay: our write still needs to happen, at the next free revision.
 *
 * Collapsing them would be a silent data-loss bug in the second case: we would re-read, find
 * nothing matching our refs, and return something that is not what we wrote. So the two are
 * distinguished by re-reading on the refs key, and the revision case retries on a recomputed
 * revision — BOUNDED, because CLAUDE.md forbids unbounded retry and an unbounded loop here would
 * spin forever against a writer that keeps winning.
 *
 * ## What this does NOT do
 *
 * It does not approve, supersede, or validate the refs it is handed. `checkRefIntegrity` is the
 * caller's to run, and P5-T1.4's orchestrator is what will run it — this module would otherwise
 * be a second place where "is this blueprint any good" is decided.
 */
import { createHash } from 'crypto';
import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';
import type { ManifestRefs, RefOrigin } from './adapters/manifestRefs';
import { manifestContentHash } from './blueprintApproval';

/**
 * Structured JSON to stdout, per CLAUDE.md’s observability contract.
 *
 * `created` and the landed `revision` are exactly what an operator needs from this module and
 * nothing else records them. No sibling in `services/lifecycle/` logs today, which is why an
 * earlier version of this file shipped with none — but "the neighbours do not either" is not a
 * reason, and the plan lists structured logging as a per-backend-task requirement.
 *
 * No `correlation_id` here: this module has no request context, and the route layer that will
 * call it (P5-T1.4) mints one. Recorded as a deviation rather than left to be noticed.
 */
function log(fields: Record<string, unknown>): void {
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(), level: fields.outcome === 'failure' ? 'error' : 'info',
    service: 'backend', ...fields,
  }));
}

/** How many times to retry a revision collision before giving up. */
const MAX_REVISION_ATTEMPTS = 3;

export interface WriteManifestInput {
  tenantId: string;
  /** Which identity space the project id lives in; decides which FK column is set. */
  origin: RefOrigin;
  projectId: string;
  refs: ManifestRefs;
  /**
   * REQUIRED, not optional. Separation of duty cannot be enforced without a proposer to compare
   * the approver against, and `proposer_unrecorded` blocks the approval stage precisely so that
   * a manifest cannot reach approval without one. Accepting a null here would push that failure
   * to the gate instead of the write.
   */
  proposedBy: string;
  /**
   * TEST SEAM, so the revision-conflict branch can be reached DETERMINISTICALLY.
   *
   * ## A correction. An earlier version of this comment was measurably false
   *
   * It said: "`Promise.all` over this function does NOT produce a revision collision: the
   * pool serialises the `MAX(revision)` read, so no caller ever picks a revision another
   * caller already took." That is wrong, and it was wrong in the direction that matters.
   *
   * Measured, 30 trials, warm pool, two concurrent reads per trial:
   *
   *     trials=30  pairs that read the SAME next revision = 30
   *     pairs: [[2,2],[2,2],[2,2],[2,2],[2,2],[2,2],[2,2],[2,2]]
   *
   * An independent verifier got 40 of 40 on the same question. The reads are NOT serialised:
   * both callers pick the same revision every time, so the conflict branch below is reachable
   * in production and the retry loop is MORE load-bearing than the old comment implied, not
   * less.
   *
   * ## So why does the seam still exist
   *
   * Because `Promise.all` is a NONDETERMINISTIC detector of that branch, not an unreachable
   * one. Whether the loser reaches the retry depends on how the two inserts interleave, and
   * mutation runs bore that out WHILE THE CHEAP PRE-READ STILL EXISTED: deleting
   * `ON CONFLICT DO NOTHING` produced 4, 5 and 4 failures across three identical runs, the
   * revision test appearing in some and not others. A detector that fires two times in three
   * is not a control.
   *
   * On THIS tree it is 5, 5, 5 with the same five names, because removing that pre-read makes
   * every replay attempt an insert — so the conflict path is reached unconditionally rather
   * than by lucky interleaving. The 4/5/4 figure is kept as the measurement that justified
   * adding the seam, explicitly NOT as a description of this tree; the seam still earns its
   * place by making the REVISION branch deterministic, which no amount of racing does.
   *
   * Overriding this hands back a revision that is already in use — exactly the state a real
   * concurrent writer creates — every time. Same dependency-injection reason
   * `verifyProjectLifecycleSchema` takes its `query` as a parameter.
   */
  nextRevisionFor?: (tenantId: string, origin: RefOrigin, projectId: string) => Promise<number>;
}

export interface WriteManifestResult {
  manifestId: string;
  revision: number;
  /** Binds tenant + project + revision + refs. This is LC-10's "exact version/hash". */
  contentSha256: string;
  /** Revision-INDEPENDENT. The idempotency key, not an approval binding. */
  refsSha256: string;
  /** False when this call found an existing row rather than inserting one. */
  created: boolean;
}

export class ManifestWriteError extends Error {
  readonly error_class = 'ManifestWriteConflict';
  constructor(message: string) {
    super(message);
    this.name = 'ManifestWriteError';
  }
}

/**
 * The idempotency hash: refs only, deliberately excluding the revision.
 *
 * Separate from `manifestContentHash`, which includes the revision and is what an approval binds
 * to. Two hashes answer two questions — one identifies the write, one binds the approval — and
 * parking a revision-independent hash in `content_sha256` would silently weaken LC-10.
 *
 * NUL-joined for the same domain-separation reason `manifestContentHash` gives: NUL cannot occur
 * in a UUID or in JSON text, so ("t","p") and ("t\0p","") cannot collide.
 */
export function refsContentHash(parts: {
  tenantId: string;
  projectId: string;
  refs: unknown;
}): string {
  const canonical = [
    parts.tenantId,
    parts.projectId,
    JSON.stringify(parts.refs ?? null),
  ].join('\0');
  return createHash('sha256').update(canonical).digest('hex');
}

/** Which FK column an origin writes to. The CHECK constraint enforces exactly one being set. */
function projectColumn(origin: RefOrigin): 'student_project_id' | 'delivery_project_id' {
  return origin === 'sbp' ? 'student_project_id' : 'delivery_project_id';
}

interface ExistingRow {
  id: string;
  revision: number;
  content_sha256: string | null;
}

/**
 * The replay result: the row another writer already committed for these exact refs.
 *
 * `content_sha256` is NULLABLE in the schema (`content_sha256 VARCHAR(64)`, verified against
 * the DDL and a live database rather than assumed), so a replayed row can legitimately have
 * none. When it does, this returns the hash computed for the CALLER's attempt, which keeps the
 * result usable; the null itself is informative, because a row without a hash is a row this
 * module did not write.
 *
 * Pure, and separate from the writer, for a reason worth stating: inline in the async path the
 * fallback was reachable only through a DB race, so the only suite that could exercise it was
 * the one that skips without `DATABASE_URL` — and a verifier deleted the whole operand with 17
 * of 17 tests still green. An operand no test can reach is not covered by the suite that passes.
 */
export function replayedManifest(
  row: ExistingRow,
  fallbackContentSha256: string,
  refsSha256: string,
): WriteManifestResult {
  return {
    manifestId: row.id,
    revision: row.revision,
    contentSha256: row.content_sha256 ?? fallbackContentSha256,
    refsSha256,
    created: false,
  };
}

/** Find a manifest already written with these exact refs. The replay path. */
async function findByRefs(
  tenantId: string,
  origin: RefOrigin,
  projectId: string,
  refsSha: string,
): Promise<ExistingRow | null> {
  const col = projectColumn(origin);
  const rows = await sequelize.query<ExistingRow>(
    `SELECT id, revision, content_sha256
       FROM operating_blueprint_manifests
      WHERE tenant_id = $1 AND ${col} = $2 AND refs_sha256 = $3
      LIMIT 1`,
    { bind: [tenantId, projectId, refsSha], type: QueryTypes.SELECT },
  );
  return rows[0] ?? null;
}

async function nextRevision(
  tenantId: string,
  origin: RefOrigin,
  projectId: string,
): Promise<number> {
  const col = projectColumn(origin);
  const rows = await sequelize.query<{ next: number | null }>(
    `SELECT MAX(revision) + 1 AS next
       FROM operating_blueprint_manifests
      WHERE tenant_id = $1 AND ${col} = $2`,
    { bind: [tenantId, projectId], type: QueryTypes.SELECT },
  );
  // `?? 1` already covers the NULL an empty table returns. A `|| 1` after it was dead — it
  // survived mutation, and Amendment 4 allows two categories, so it is removed rather than
  // kept as an operand no test can see.
  return Number(rows[0]?.next ?? 1);
}

/**
 * Create the manifest, or return the one that already records these refs.
 *
 * Idempotent on `(tenant, project, refs)`. Safe to call twice; safe to call concurrently.
 */
export async function writeBlueprintManifest(
  input: WriteManifestInput,
): Promise<WriteManifestResult> {
  const { tenantId, origin, projectId, refs, proposedBy } = input;
  const refsSha = refsContentHash({ tenantId, projectId, refs });
  const col = projectColumn(origin);
  const pickRevision = input.nextRevisionFor ?? nextRevision;

  // NO CHEAP PRE-READ. An earlier version checked for an existing row before attempting the
  // insert, to spare a write on the common replay. Removing it cost ZERO tests, which makes it
  // an untested branch by Amendment 4’s reckoning — and the rule allows two categories, tested
  // or removed. The conflict path below reaches the identical answer, so this is the second.

  for (let attempt = 1; attempt <= MAX_REVISION_ATTEMPTS; attempt += 1) {
    const revision = await pickRevision(tenantId, origin, projectId);
    const contentSha = manifestContentHash({ tenantId, projectId, revision, refs });

    // ON CONFLICT DO NOTHING rather than a caught exception: a unique violation inside a
    // transaction poisons it, and Sequelize reports every integrity violation as the same
    // "Validation error" regardless of which constraint fired.
    const inserted = await sequelize.query<{ id: string }>(
      `INSERT INTO operating_blueprint_manifests
         (tenant_id, ${col}, revision, status, refs_json, refs_sha256, content_sha256, proposed_by)
       VALUES ($1, $2, $3, 'draft', $4::jsonb, $5, $6, $7)
       ON CONFLICT DO NOTHING
       RETURNING id`,
      {
        bind: [tenantId, projectId, revision, JSON.stringify(refs), refsSha, contentSha, proposedBy],
        type: QueryTypes.SELECT,
      },
    );

    if (inserted[0]?.id) {
      log({
        event: 'blueprint_manifest_written', outcome: 'success',
        manifest_id: inserted[0].id, revision, attempt, created: true,
      });
      return {
        manifestId: inserted[0].id,
        revision,
        contentSha256: contentSha,
        refsSha256: refsSha,
        created: true,
      };
    }

    // Nothing inserted, so one of the two unique indexes fired. WHICH ONE decides what happens
    // next, and conflating them would return a row we did not write.
    const raced = await findByRefs(tenantId, origin, projectId, refsSha);
    if (raced) {
      log({
        event: 'blueprint_manifest_written', outcome: 'success',
        manifest_id: raced.id, revision: raced.revision, attempt, created: false,
      });
      // The refs index. Someone wrote exactly this between our read and our insert: a replay.
      // The nullable-hash fallback, and why it is KEPT rather than removed, are stated on
      // `replayedManifest` beside the tests that reach it — the comment that stood here cited
      // a test by name that did not exist.
      return replayedManifest(raced, contentSha, refsSha);
    }
    // The revision index: a concurrent writer took our revision with different refs. Our write
    // still has to happen. Loop and recompute — bounded, never a bare `while (true)`.
  }

  log({
    event: 'blueprint_manifest_written', outcome: 'failure',
    error_class: 'ManifestWriteConflict', attempts: MAX_REVISION_ATTEMPTS,
  });
  throw new ManifestWriteError(
    `Could not allocate a manifest revision for project ${projectId} after `
    + `${MAX_REVISION_ATTEMPTS} attempts; a concurrent writer is winning every race.`,
  );
}
