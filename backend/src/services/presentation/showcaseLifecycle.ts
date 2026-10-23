import { contentHash } from './showcaseService';

/**
 * The three steps nothing could perform: ask, approve, announce.
 *
 * Phase 6 built `publishShowcase`, `withdrawShowcase` and the whole access model —
 * for rows that no code in the repository ever inserted. `canPublish` guarded a
 * state unreachable by any path. This is the half that makes the other half mean
 * something.
 *
 * WHY A SHOWCASE EXISTS AT ALL, now that a recording already becomes a portfolio
 * artifact on hand-in. The artifact is the learner's own record and needs nobody's
 * permission. Showing it to a cohort is a different act, and this one is gated:
 * the author asks, a staff member approves, and only then does anyone else see it.
 * Those are two different questions about the same video and they get two different
 * stores.
 *
 * THE POST IS THE PUBLICATION. A published showcase produces a `CommunityPost` —
 * the same object a text message in the cohort feed is, with the same likes and
 * comments — rather than a bespoke gallery nobody visits. The registry already
 * pointed here: the `demo` card type carries `home_surface: 'community'`.
 *
 * THE POST REFERENCES THE RECORDING, NEVER CARRIES IT. Community media is served by
 * `res.sendFile` with no auth and capped at 8 MB for "not so big images". Putting a
 * rehearsal there would publish bytes on an unauthenticated path and break on any
 * take over the cap. The post names the recording; the player resolves it through
 * the ticketed route, which still checks ownership on every request.
 */

async function db() {
  const { sequelize } = await import('../../config/database');
  return sequelize;
}

function log(event: string, ctx: Record<string, unknown>, outcome: 'success' | 'failure' = 'success'): void {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: outcome === 'failure' ? 'warn' : 'info',
    service: 'presentation-showcase', event, outcome, context: ctx,
  }));
}

export interface RequestShareInput {
  enrollmentId: string;
  attemptId: string;
  /**
   * THE TAKE being shared. A learner records several in order to choose one, so the
   * showcase is keyed here rather than on the attempt — see the DDL comment on
   * `presentation_showcases_one_live_per_recording`.
   */
  recordingId: string;
  cohortId: string | null;
  /** The blurb a stranger reads. Already grounding-checked by `showcaseDraft`. */
  draftSummary: string;
  recordingIds: string[];
  artifactId?: string | null;
}

export type RequestShareResult =
  | { ok: true; showcaseId: string; created: boolean }
  | { ok: false; reason: string };

/**
 * The author asks to share. Records THEIR approval and nobody else's.
 *
 * Idempotent on the attempt: asking twice is one request, not two pending reviews.
 * The content hash is frozen here, so a take swapped afterwards makes the approval
 * stale rather than silently carrying it onto different footage.
 */
export async function requestShare(input: RequestShareInput): Promise<RequestShareResult> {
  const summary = (input.draftSummary || '').trim();
  if (!summary) return { ok: false, reason: 'A showcase needs a summary somebody can read.' };

  const hash = contentHash({
    attemptId: input.attemptId,
    recordingIds: input.recordingIds,
    draftSummary: summary,
    artifactId: input.artifactId ?? null,
  });

  const sequelize = await db();
  const [rows] = await sequelize.query(
    `INSERT INTO presentation_showcases
       (attempt_id, recording_id, audience, draft_json, content_hash, artifact_id, author_approved_at)
     VALUES (:attemptId, :recordingId, 'private', CAST(:draft AS jsonb), :hash, :artifactId, NOW())
     -- The unique index is PARTIAL (\`WHERE withdrawn_at IS NULL\`), so the conflict
     -- target has to carry the same predicate or Postgres cannot infer it and the
     -- statement fails outright. The partial scope is deliberate: a withdrawn
     -- showcase may legitimately be replaced by a new request later.
     --
     -- KEYED ON THE RECORDING, not the attempt: a learner sharing their third take
     -- must not also publish the first two, which attempt-level keying did.
     ON CONFLICT (recording_id) WHERE withdrawn_at IS NULL DO NOTHING
     RETURNING id`,
    {
      replacements: {
        attemptId: input.attemptId,
        recordingId: input.recordingId,
        draft: JSON.stringify({ summary, current_content_hash: hash }),
        hash,
        artifactId: input.artifactId ?? null,
      },
    },
  ) as [Array<{ id: string }>, unknown];

  if (rows?.length) {
    log('showcase_share_requested', {
      showcaseId: rows[0].id, attemptId: input.attemptId, recordingId: input.recordingId,
    });
    return { ok: true, showcaseId: String(rows[0].id), created: true };
  }

  // Already asked. Hand back the existing request rather than minting a second.
  // Scoped to the LIVE one, matching the partial index: a withdrawn showcase is
  // history, and returning it here would hand the caller a dead row and then refuse
  // to publish it.
  const [found] = await sequelize.query(
    `SELECT id FROM presentation_showcases
      WHERE recording_id = :recordingId AND withdrawn_at IS NULL
      LIMIT 1`,
    { replacements: { recordingId: input.recordingId } },
  ) as [Array<{ id: string }>, unknown];

  return found?.length
    ? { ok: true, showcaseId: String(found[0].id), created: false }
    : { ok: false, reason: 'Could not record the request.' };
}

/**
 * Staff approve. Separate from the author's approval on purpose: `approvalState`
 * requires BOTH, and a single column would let one party publish alone.
 *
 * Guarded on `staff_approved_at IS NULL` so a second click is a no-op rather than a
 * re-approval that moves the timestamp and muddies who signed off when.
 */
export async function staffApprove(showcaseId: string, staffIdentity: string): Promise<boolean> {
  const sequelize = await db();
  const [rows] = await sequelize.query(
    `UPDATE presentation_showcases
        SET staff_approved_at = NOW(), staff_approved_by = :by, updated_at = NOW()
      WHERE id = :id AND staff_approved_at IS NULL AND withdrawn_at IS NULL
     RETURNING id`,
    { replacements: { id: showcaseId, by: staffIdentity } },
  ) as [Array<{ id: string }>, unknown];

  const changed = (rows?.length || 0) > 0;
  log('showcase_staff_approved', { showcaseId, by: staffIdentity, changed });
  return changed;
}

/**
 * Staff decline. The other half of a review, and the half that was missing.
 *
 * A queue with only an Approve button is not a review — it is a formality with a
 * delay, because the only way to refuse is to leave the request sitting there,
 * which the learner experiences as silence rather than as an answer.
 *
 * Declining WITHDRAWS rather than deletes: `withdrawn_at` plus `withdrawn_reason`
 * is already how a take stops being public, the partial unique index is scoped to
 * `withdrawn_at IS NULL` so the learner can fix the problem and ask again, and the
 * refused request stays on the record instead of vanishing.
 *
 * A REASON IS REQUIRED. "No" with no sentence attached tells a learner nothing
 * they can act on, and the staff member is the one who knows why.
 */
export async function staffDecline(
  showcaseId: string,
  staffIdentity: string,
  reason: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const note = (reason || '').trim();
  if (!note) return { ok: false, reason: 'A decline needs a reason the learner can act on.' };

  const sequelize = await db();
  const [rows] = await sequelize.query(
    `UPDATE presentation_showcases
        SET withdrawn_at      = NOW(),
            withdrawn_reason  = :note,
            staff_approved_by = :by,
            updated_at        = NOW()
      WHERE id = :id
        AND withdrawn_at IS NULL
        -- Already published is a DIFFERENT operation. Taking down something a
        -- cohort has already seen is a withdrawal, and it is not what this is.
        AND published_at IS NULL
     RETURNING id`,
    { replacements: { id: showcaseId, by: staffIdentity, note } },
  ) as [Array<{ id: string }>, unknown];

  const changed = (rows?.length || 0) > 0;
  log('showcase_staff_declined', { showcaseId, by: staffIdentity, changed });
  return changed
    ? { ok: true }
    : { ok: false, reason: 'That request is no longer pending — it may already be published or withdrawn.' };
}

export interface AnnounceInput {
  showcaseId: string;
  memberId: string;
  cohortId: string;
  /** `recording:<attemptId>` — resolved to a player by the feed, never a file path. */
  recordingRef: string;
  summary: string;
  week?: number | null;
  sourceCardId?: string | null;
}

/**
 * Announce a published showcase to the cohort feed.
 *
 * Idempotent on the showcase: the publication ref is carried in `ritual_meta`, and a
 * second announce finds the existing post instead of double-posting a demo into
 * everyone's feed — which is the kind of mistake that is visible to thirty people
 * before anyone can delete it.
 */
export async function announceToCommunity(input: AnnounceInput): Promise<{ postId: string; created: boolean } | null> {
  const sequelize = await db();
  const ref = `showcase:${input.showcaseId}`;

  const [existing] = await sequelize.query(
    `SELECT id FROM community_posts WHERE ritual_meta->>'showcase_ref' = :ref LIMIT 1`,
    { replacements: { ref } },
  ) as [Array<{ id: string }>, unknown];
  if (existing?.length) return { postId: String(existing[0].id), created: false };

  const [rows] = await sequelize.query(
    `INSERT INTO community_posts
       (member_id, cohort_id, body, category, week, source_card_id, shared_to_portfolio, ritual_meta)
     VALUES (:memberId, :cohortId, :body, 'demo_video', :week, :cardId, TRUE, CAST(:meta AS jsonb))
     RETURNING id`,
    {
      replacements: {
        memberId: input.memberId,
        cohortId: input.cohortId,
        body: input.summary,
        week: input.week ?? null,
        cardId: input.sourceCardId ?? null,
        // `media_urls` is deliberately left empty. The recording is NOT uploaded
        // here — community media is unauthenticated and capped at 8 MB. The ref is
        // what the feed resolves through the ticketed playback route.
        meta: JSON.stringify({ showcase_ref: ref, recording_ref: input.recordingRef, kind: 'demo_video' }),
      },
    },
  ) as [Array<{ id: string }>, unknown];

  if (!rows?.length) return null;
  log('showcase_announced', { showcaseId: input.showcaseId, postId: rows[0].id, cohortId: input.cohortId });
  return { postId: String(rows[0].id), created: true };
}

export type ApproveAndPublishResult =
  | { ok: true; showcaseId: string; postId: string | null; alreadyPublished: boolean }
  | { ok: false; reason: string };

/**
 * Staff approve, publish, and announce — the whole second half, in order.
 *
 * ONE CALL BECAUSE THEY ARE ONE DECISION. A staff member approving a demo means
 * "the cohort may see this". Leaving publish as a separate click would create a
 * state where something is approved and invisible, which nobody would ever go back
 * and finish, and which the student would experience as silence.
 *
 * THE POST IS LAST AND IS ALLOWED TO FAIL. Approval and publication are the record;
 * the feed entry is a consequence. If announcing throws, the showcase is still
 * published and `announceToCommunity` is idempotent, so a retry posts exactly once
 * rather than twice.
 */
export async function approveAndPublish(
  showcaseId: string,
  staffIdentity: string,
  audience: 'cohort' | 'community' = 'cohort',
): Promise<ApproveAndPublishResult> {
  const sequelize = await db();

  await staffApprove(showcaseId, staffIdentity);

  // Re-read AFTER approving: publishing decides on current state, never on what the
  // caller believed when they clicked. The same reason `commitOps` re-reads.
  const [rows] = await sequelize.query(
    `SELECT s.id, s.audience, s.content_hash,
            s.draft_json->>'current_content_hash' AS current_content_hash,
            s.draft_json->>'summary'              AS summary,
            s.author_approved_at, s.staff_approved_at, s.published_at, s.withdrawn_at,
            s.attempt_id,
            s.recording_id,
            asg.enrollment_id AS owner_enrollment_id,
            asg.cohort_id     AS cohort_id
       FROM presentation_showcases s
       JOIN presentation_attempts    a   ON a.id = s.attempt_id
       JOIN presentation_assignments asg ON asg.id = a.assignment_id
      WHERE s.id = :id
      LIMIT 1`,
    { replacements: { id: showcaseId } },
  ) as [Array<Record<string, any>>, unknown];

  const row = rows?.[0];
  if (!row) return { ok: false, reason: 'No such showcase.' };

  const { publishShowcase } = await import('./showcaseService');
  const published = await publishShowcase(
    {
      id: String(row.id),
      ownerEnrollmentId: String(row.owner_enrollment_id),
      cohortId: row.cohort_id ? String(row.cohort_id) : null,
      audience,
      contentHash: row.content_hash,
      currentContentHash: row.current_content_hash,
      authorApprovedAt: row.author_approved_at,
      staffApprovedAt: row.staff_approved_at,
      publishedAt: row.published_at,
      withdrawnAt: row.withdrawn_at,
    },
    audience,
  );
  if (!published.ok) return { ok: false, reason: published.reason };

  // The author's community identity. No member row means they were never onboarded
  // to the feed; the showcase stays published and simply has no post.
  const { default: CommunityMember } = await import('../../models/CommunityMember');
  const member = await CommunityMember.findOne({ where: { enrollment_id: String(row.owner_enrollment_id) } });
  if (!member || !row.cohort_id) {
    log('showcase_announce_skipped', { showcaseId, hasMember: Boolean(member), hasCohort: Boolean(row.cohort_id) }, 'failure');
    return { ok: true, showcaseId, postId: null, alreadyPublished: published.alreadyPublished };
  }

  let postId: string | null = null;
  try {
    const announced = await announceToCommunity({
      showcaseId,
      memberId: String(member.id),
      cohortId: String(row.cohort_id),
      // THE RECORDING, not the attempt. This ref is what the feed card resolves to
      // a player, and an attempt id points at a rehearsal that may hold several
      // takes — the feed would have to guess which one was published, and under
      // per-recording sharing it would guess wrong. Falls back to the attempt only
      // for showcases written before per-recording keying.
      recordingRef: row.recording_id
        ? `recording:${String(row.recording_id)}`
        : `attempt:${String(row.attempt_id)}`,
      summary: String(row.summary || 'Shared a demo video.'),
    });
    postId = announced?.postId ?? null;
  } catch (err: any) {
    // Published is published. A missing post is a retry, not a rollback.
    log('showcase_announce_failed', { showcaseId, message: String(err?.message || err) }, 'failure');
  }

  return { ok: true, showcaseId, postId, alreadyPublished: published.alreadyPublished };
}
