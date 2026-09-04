import { Op } from 'sequelize';
import CertSession, { CertSessionMode, CertServedItem } from '../../models/CertSession';
import CertResponse from '../../models/CertResponse';
import CertQuestionRevision from '../../models/CertQuestionRevision';
import { getCertAvailability } from './certAvailabilityService';
import { getCurrentBlueprint, weightsAreUsable } from './certBlueprintService';
import {
  listApprovedKeysByDomain,
  loadServedItems,
  toRevealedItem,
  scoreSelection,
  SafeQuestionItem,
  RevealedQuestionItem,
} from './certQuestionBankService';
import {
  buildFormPlan,
  scoreSession,
  isExpired,
  SCORING_POLICY_VERSION,
} from './certScoring';

/**
 * certSessionService — the write path for a diagnostic, practice or mock sitting.
 *
 * Every operation here is guarded by three things, in this order: the student owns
 * the session, the Week 7 fence is open, and the session has not expired. None of
 * them is optional and none is inferable from a client payload.
 *
 * IDEMPOTENCY IS STRUCTURAL, NOT DEFENSIVE. Starting a session with the same
 * idempotency key returns the existing session. Submitting the same question twice
 * updates one row rather than recording two answers. Completing twice returns the
 * first result rather than rescoring. Each of those is enforced by a unique index
 * in ensureCertPrepSchema, so a race between two tabs loses at the database, not in
 * a check-then-write window that a retry can slip through.
 *
 * NOTHING HERE TRUSTS THE CLIENT for correctness, score, timing, week eligibility,
 * question revision, or which session it may touch. The client sends only which
 * options it selected.
 */

// ── session shapes ───────────────────────────────────────────────────────────

/** Per-mode defaults. Configuration, not magic numbers scattered through the code. */
export const MODE_DEFAULTS: Record<CertSessionMode, { itemCount: number; minutes: number | null }> = {
  // A baseline that samples every domain without costing an evening.
  diagnostic: { itemCount: 15, minutes: 25 },
  // Short, repeatable, untimed — practice should not feel like an exam.
  practice: { itemCount: 10, minutes: null },
  // The real shape: 60 items in 120 minutes.
  mock: { itemCount: 60, minutes: 120 },
};

/**
 * How many recent sessions to look back over when avoiding immediate repeats.
 * Repetition is useful for review and useless for measurement — a readiness score
 * built from questions the student saw yesterday measures recall of those items,
 * not command of the domain.
 */
export const REPEAT_LOOKBACK_SESSIONS = 3;

export interface StartSessionInput {
  enrollmentId: string;
  mode: CertSessionMode;
  trackId?: string;
  /** Restrict a practice drill to specific domains (a weak-domain drill). */
  domainIds?: string[];
  itemCount?: number;
  idempotencyKey?: string;
}

export interface SessionView {
  session: CertSession;
  items: SafeQuestionItem[];
  /** Answers already submitted in this session, keyed by question. */
  answered: Record<string, { selected_keys: string[]; is_correct: boolean | null }>;
  expired: boolean;
}

export class CertSessionError extends Error {
  status: number;
  code: string;
  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = 'CertSessionError';
    this.status = status;
    this.code = code;
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────

/** Deterministic-by-default shuffle; tests inject an rng to pin the order. */
export function shuffle<T>(items: T[], rng: () => number = Math.random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Choose the question keys for a form.
 *
 * Recently-seen keys are deprioritised rather than banned: with a small bank,
 * banning them would silently produce a short form, and a 40-item "mock" that
 * claims to be 60 is worse than a repeat. So fresh keys are taken first and seen
 * ones backfill only if the domain would otherwise come up short.
 */
export function selectKeysForPlan(
  plan: { domain_id: string; count: number }[],
  available: Map<string, string[]>,
  recentlySeen: Set<string>,
  rng: () => number = Math.random,
): string[] {
  const picked: string[] = [];
  for (const slot of plan) {
    const pool = available.get(slot.domain_id) ?? [];
    const fresh = shuffle(pool.filter((k) => !recentlySeen.has(k)), rng);
    const seen = shuffle(pool.filter((k) => recentlySeen.has(k)), rng);
    picked.push(...[...fresh, ...seen].slice(0, slot.count));
  }
  return picked;
}

/** Load the question keys this student has seen in their last few sessions. */
async function loadRecentlySeen(enrollmentId: string): Promise<Set<string>> {
  const recent = await CertSession.findAll({
    where: { enrollment_id: enrollmentId },
    order: [['started_at', 'DESC']],
    limit: REPEAT_LOOKBACK_SESSIONS,
    attributes: ['id'],
  });
  if (recent.length === 0) return new Set();
  const responses = await CertResponse.findAll({
    where: { session_id: { [Op.in]: recent.map((s) => s.id) } },
    attributes: ['question_key'],
  });
  return new Set(responses.map((r) => r.question_key));
}

/** Ownership + existence, as one check every entry point shares. */
async function loadOwnedSession(sessionId: string, enrollmentId: string): Promise<CertSession> {
  const session = await CertSession.findByPk(sessionId);
  if (!session || session.enrollment_id !== enrollmentId) {
    // Deliberately indistinguishable: a student probing ids must not be able to
    // tell "someone else's session" from "no such session".
    throw new CertSessionError('Session not found', 404, 'CERT_SESSION_NOT_FOUND');
  }
  return session;
}

/** Mark a timed session expired once, so status is truthful on read. */
async function settleExpiry(session: CertSession, now: Date): Promise<boolean> {
  if (!isExpired(session, now)) return false;
  if (session.status === 'in_progress') {
    session.status = 'expired';
    await session.save();
  }
  return true;
}

// ── start ────────────────────────────────────────────────────────────────────

/**
 * Start a sitting. Refuses before the Week 7 fence, and refuses when the bank
 * cannot fill a form — a session with no questions is not a session.
 */
export async function startSession(
  input: StartSessionInput,
  opts: { now?: Date; rng?: () => number } = {},
): Promise<SessionView> {
  const now = opts.now ?? new Date();
  const rng = opts.rng ?? Math.random;

  const availability = await getCertAvailability(input.enrollmentId, now, input.trackId);
  if (!availability.available) {
    throw new CertSessionError(
      'Cert Prep is not available for this enrollment yet',
      403,
      'CERT_PREP_NOT_AVAILABLE',
    );
  }

  // A retried start must return the first session, not mint a second.
  if (input.idempotencyKey) {
    const existing = await CertSession.findOne({ where: { idempotency_key: input.idempotencyKey } });
    if (existing) {
      if (existing.enrollment_id !== input.enrollmentId) {
        throw new CertSessionError('Session not found', 404, 'CERT_SESSION_NOT_FOUND');
      }
      return viewSession(existing, now);
    }
  }

  const blueprint = await getCurrentBlueprint(input.trackId);
  if (!blueprint) {
    throw new CertSessionError('No certification blueprint is configured', 409, 'CERT_NO_BLUEPRINT');
  }

  const defaults = MODE_DEFAULTS[input.mode];
  const itemCount = input.itemCount ?? defaults.itemCount;

  const scoped = input.domainIds?.length
    ? blueprint.domains.filter((d) => input.domainIds!.includes(d.domain_id))
    : blueprint.domains;

  // A weighted form needs weights. Without them, spread evenly across the scoped
  // domains and let the caller label the result as unweighted practice rather than
  // presenting an exam-shaped score built on invented weighting.
  const plan = weightsAreUsable(scoped)
    ? buildFormPlan(scoped.map((d) => ({ domain_id: d.domain_id, weight_pct: Number(d.weight_pct) })), itemCount)
    : buildFormPlan(scoped.map((d) => ({ domain_id: d.domain_id, weight_pct: 1 })), itemCount);

  const available = await listApprovedKeysByDomain(
    blueprint.track.blueprint_version,
    plan.map((p) => p.domain_id),
    now,
  );
  const recentlySeen = await loadRecentlySeen(input.enrollmentId);
  const keys = selectKeysForPlan(plan, available, recentlySeen, rng);

  if (keys.length === 0) {
    throw new CertSessionError(
      'No approved questions are available for this form yet',
      409,
      'CERT_NO_APPROVED_QUESTIONS',
    );
  }

  const revisions = await CertQuestionRevision.findAll({
    where: { question_key: { [Op.in]: keys }, review_status: 'approved' },
  });
  const latestByKey = new Map<string, number>();
  for (const rev of revisions) {
    const current = latestByKey.get(rev.question_key);
    if (current === undefined || rev.revision > current) latestByKey.set(rev.question_key, rev.revision);
  }
  const served: CertServedItem[] = keys
    .filter((k) => latestByKey.has(k))
    .map((k) => ({ question_key: k, revision: latestByKey.get(k)! }));

  const minutes = defaults.minutes;
  const session = await CertSession.create({
    enrollment_id: input.enrollmentId,
    track_id: blueprint.track.track_id,
    mode: input.mode,
    form_version: `${blueprint.track.blueprint_version}:${input.mode}:${served.length}`,
    blueprint_version: blueprint.track.blueprint_version,
    scoring_policy_version: SCORING_POLICY_VERSION,
    question_keys: served,
    status: 'in_progress',
    time_limit_seconds: minutes ? minutes * 60 : null,
    started_at: now,
    expires_at: minutes ? new Date(now.getTime() + minutes * 60_000) : null,
    idempotency_key: input.idempotencyKey ?? null,
  });

  return viewSession(session, now);
}

// ── read / resume ────────────────────────────────────────────────────────────

/** Shape a session for the client: safe items plus what has been answered. */
export async function viewSession(session: CertSession, now: Date = new Date()): Promise<SessionView> {
  const expired = await settleExpiry(session, now);
  const items = await loadServedItems(session.question_keys ?? []);
  const responses = await CertResponse.findAll({ where: { session_id: session.id } });

  const answered: SessionView['answered'] = {};
  for (const r of responses) {
    answered[r.question_key] = { selected_keys: r.selected_keys ?? [], is_correct: r.is_correct };
  }
  return { session, items, answered, expired };
}

export async function resumeSession(
  sessionId: string,
  enrollmentId: string,
  now: Date = new Date(),
): Promise<SessionView> {
  const session = await loadOwnedSession(sessionId, enrollmentId);
  return viewSession(session, now);
}

// ── submit ───────────────────────────────────────────────────────────────────

/**
 * Record one answer and reveal the rationale.
 *
 * Correctness is computed here from the revision the session recorded as served —
 * never from the client, and never from the question's *current* revision, so a
 * mid-session edit cannot change whether an already-given answer was right.
 */
export async function submitResponse(
  sessionId: string,
  enrollmentId: string,
  questionKey: string,
  selectedKeys: string[],
  opts: { now?: Date; timeMs?: number } = {},
): Promise<RevealedQuestionItem> {
  const now = opts.now ?? new Date();
  const session = await loadOwnedSession(sessionId, enrollmentId);

  if (session.status === 'completed') {
    throw new CertSessionError('This session is already complete', 409, 'CERT_SESSION_COMPLETE');
  }
  if (await settleExpiry(session, now)) {
    throw new CertSessionError('This session has expired', 409, 'CERT_SESSION_EXPIRED');
  }

  const served = (session.question_keys ?? []).find((s) => s.question_key === questionKey);
  if (!served) {
    throw new CertSessionError('That question is not part of this session', 400, 'CERT_QUESTION_NOT_SERVED');
  }

  const revision = await CertQuestionRevision.findOne({
    where: { question_key: questionKey, revision: served.revision },
  });
  if (!revision) {
    throw new CertSessionError('The served question revision is missing', 409, 'CERT_REVISION_MISSING');
  }

  const isCorrect = scoreSelection(revision.correct_keys, selectedKeys);

  // Idempotent: the unique (session_id, question_key) index means a retry updates
  // the single row rather than recording a second answer.
  const [row, created] = await CertResponse.findOrCreate({
    where: { session_id: session.id, question_key: questionKey },
    defaults: {
      session_id: session.id,
      enrollment_id: enrollmentId,
      question_key: questionKey,
      question_revision: served.revision,
      domain_id: revision.domain_id,
      selected_keys: selectedKeys,
      is_correct: isCorrect,
      time_ms: opts.timeMs ?? null,
      rationale_viewed: true,
      answered_at: now,
    },
  });

  if (!created) {
    row.selected_keys = selectedKeys;
    row.is_correct = isCorrect;
    if (opts.timeMs != null) row.time_ms = opts.timeMs;
    row.answered_at = now;
    await row.save();
  }

  return toRevealedItem(revision, selectedKeys);
}

// ── complete ─────────────────────────────────────────────────────────────────

/**
 * Finish a sitting and write its score.
 *
 * Completing an already-complete session returns the stored result rather than
 * rescoring: a double-tapped Finish button must not produce two different numbers,
 * and rescoring later would silently restate a score the student has already seen.
 */
export async function completeSession(
  sessionId: string,
  enrollmentId: string,
  now: Date = new Date(),
): Promise<CertSession> {
  const session = await loadOwnedSession(sessionId, enrollmentId);
  if (session.status === 'completed') return session;

  const responses = await CertResponse.findAll({ where: { session_id: session.id } });
  const servedCount = (session.question_keys ?? []).length;
  const score = scoreSession(
    responses.map((r) => ({ domain_id: r.domain_id, is_correct: r.is_correct })),
    servedCount,
  );

  session.status = 'completed';
  session.completed_at = now;
  session.correct_count = score.correct_count;
  session.total_count = score.total_count;
  session.scaled_score = score.scaled_score;
  session.domain_results = score.domain_results;
  await session.save();
  return session;
}

/** A student's sittings, newest first — for the history tab. */
export async function listSessions(
  enrollmentId: string,
  limit = 20,
): Promise<CertSession[]> {
  return CertSession.findAll({
    where: { enrollment_id: enrollmentId },
    order: [['started_at', 'DESC']],
    limit,
  });
}
