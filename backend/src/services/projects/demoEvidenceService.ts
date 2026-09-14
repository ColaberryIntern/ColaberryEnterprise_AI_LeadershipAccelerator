/**
 * demoEvidenceService — how a demo-prep task gets verified, and paid.
 *
 * Ali, 2026-09-14: "Demos should provide points as well." Before this, no
 * demo-prep task on the platform had ever been completed: 186 existed, all
 * `not_started`. The client is refused `complete` (completion is granted on
 * evidence, never claimed) and the repo verifier only judges stories — so
 * there was simply no path. Two paths now exist, both evidence-first:
 *
 *   PREP-1…5  The STUDENT submits the evidence the task asks for and the
 *             submission verifies it: a run-through or final video needs a
 *             link; a narrative, slides, or rehearsal notes take a link or
 *             the text itself. The submission is stored on the row
 *             (verified_ref / verification_json), so "why is this complete"
 *             has an answer a reviewer can open.
 *   PREP-6    "Present at Demo Day" is marked by STAFF, because only a person
 *             in the room can verify it. Never by the student.
 *
 * Both go through markTaskVerifiedComplete — the one writer that may set
 * `complete` — with a source that names which path it was. This module does
 * not add a second way to complete a story: it refuses anything that is not a
 * prep task, and the student path refuses PREP-6.
 *
 * Points are paid through the same award() the story verifier uses, under the
 * same `project:<task id>` key the Today feed refs by, so an award is
 * idempotent and lands on the tile that advertised it. Fail-soft: the
 * completion is the truth; a missed points mirror is logged with its class,
 * never allowed to fail the submission.
 */
import { env } from '../../config/env';
import Project from '../../models/Project';
import StudentTask from '../../models/StudentTask';
import { award } from '../pointsService';
import { getTypeXp } from '../progression/pointsConfigService';
import { DEMO_DAY_STORY_ID, isPrepStory, prepXpKey, type PrepStoryId } from '../sbp/verification/prepPoints';
import { markTaskVerifiedComplete } from './projectWriteService';

export type DemoEvidenceKind = 'link' | 'text';

export interface DemoEvidenceInput {
  kind: DemoEvidenceKind;
  value: string;
}

export interface DemoCompletion {
  id: string;
  story_id: string;
  status: 'complete';
  verified_at: Date | string;
  /** What the HUD was paid, 0 when already paid or when the rate is unset. */
  points_awarded: number;
  /** True when this call did nothing new — the task was already verified. */
  already_verified: boolean;
}

/** The tasks whose evidence must be a recording, so a link is the only acceptable form. */
const LINK_ONLY: ReadonlySet<PrepStoryId> = new Set<PrepStoryId>(['PREP-2', 'PREP-5']);
const MIN_TEXT_CHARS = 40;
const MAX_VALUE_CHARS = 5000;

function httpError(status: number, message: string, error_class: string): Error & { status: number; error_class: string } {
  const e = new Error(message) as Error & { status: number; error_class: string };
  e.status = status;
  e.error_class = error_class;
  return e;
}

/** A real http(s) URL, as the WHATWG parser sees it — not a regex guess. */
export function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value.trim());
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

/**
 * Whether this evidence satisfies this task. Pure, so the rule is testable
 * without a database and readable in one place.
 */
export function validateDemoEvidence(storyId: PrepStoryId, input: DemoEvidenceInput): { ok: true } | { ok: false; reason: string } {
  const value = (input.value ?? '').trim();
  if (!value) return { ok: false, reason: 'Evidence is required.' };
  if (value.length > MAX_VALUE_CHARS) return { ok: false, reason: `Evidence is limited to ${MAX_VALUE_CHARS} characters.` };
  if (input.kind === 'link') {
    return isHttpUrl(value) ? { ok: true } : { ok: false, reason: 'A link must be a full http(s) URL.' };
  }
  if (input.kind === 'text') {
    if (LINK_ONLY.has(storyId)) return { ok: false, reason: 'This task needs a link to your recording.' };
    return value.length >= MIN_TEXT_CHARS
      ? { ok: true }
      : { ok: false, reason: `Write at least ${MIN_TEXT_CHARS} characters, or paste a link instead.` };
  }
  return { ok: false, reason: 'Evidence must be a link or text.' };
}

function log(event: string, ctx: Record<string, unknown>, outcome: 'success' | 'failure' | 'partial' = 'success'): void {
  console.log(JSON.stringify({ timestamp: new Date().toISOString(), level: outcome === 'failure' ? 'warn' : 'info', service: 'demo-evidence', event, outcome, context: ctx }));
}

function classifyError(err: unknown): string {
  const e = err as { name?: string; error_class?: string };
  return e?.error_class || e?.name || 'Error';
}

/**
 * Pay the HUD for a verified prep task. Idempotent on `project:<task id>`;
 * the rate is read at award time from the row the task is priced from, so
 * what was advertised is what is paid.
 */
async function payPrepTask(enrollmentId: string, projectId: string, taskId: string, storyId: PrepStoryId, source: string): Promise<number> {
  const key = prepXpKey(storyId);
  const rate = (await getTypeXp(key)).builder;
  if (!env.portalPointsAwardEnabled || rate <= 0) return 0;
  try {
    const r = await award(enrollmentId, {
      eventType: key,
      eventKey: `project:${taskId}`,
      points: rate,
      metadata: { project_id: projectId, story_id: storyId, source },
    });
    return r.awarded ? r.points : 0;
  } catch (err) {
    log('demo_points_award_failed', { projectId, taskId, storyId, points: rate, error_class: classifyError(err), note: 'task is verified; the HUD points row is missing' }, 'failure');
    return 0;
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The task the portal means, inside a project the student owns. `taskKey` is
 * the story id first (the portal links by it — it is what a student sees and
 * what survives a republish) and a row id second, guarded on looking like a
 * uuid so an unknown story id never reaches the uuid column and turns a 404
 * into a 500. Same rule as projectMentorService.loadOwnedTask.
 */
async function loadOwnedPrepTask(enrollmentId: string, projectId: string, taskKey: string): Promise<StudentTask | null> {
  const project = await Project.findByPk(projectId);
  if (!project || String((project as { enrollment_id?: unknown }).enrollment_id) !== String(enrollmentId)) return null;
  let task = await StudentTask.findOne({ where: { project_id: projectId, story_id: taskKey } });
  if (!task && UUID_RE.test(taskKey)) task = await StudentTask.findOne({ where: { project_id: projectId, id: taskKey } });
  return task;
}

/**
 * The student's path: submit evidence for PREP-1…5 on a task they own.
 * 404 when the task is not theirs (indistinguishable from not existing);
 * 409 for a story or for Demo Day, which have their own verifiers;
 * 422 when the evidence does not satisfy the task.
 */
export async function submitDemoEvidence(enrollmentId: string, projectId: string, taskKey: string, input: DemoEvidenceInput): Promise<DemoCompletion | null> {
  const task = await loadOwnedPrepTask(enrollmentId, projectId, taskKey);
  if (!task) return null;

  const storyId = task.story_id;
  if (!isPrepStory(storyId)) {
    throw httpError(409, 'Only demo-prep tasks take submitted evidence. Stories are verified from your repo.', 'NotAPrepTask');
  }
  if (storyId === DEMO_DAY_STORY_ID) {
    throw httpError(409, 'Presenting at Demo Day is marked by staff on the day, not submitted.', 'StaffVerifiedTask');
  }

  if (task.verified_at) {
    return { id: String(task.id), story_id: storyId, status: 'complete', verified_at: task.verified_at, points_awarded: 0, already_verified: true };
  }

  const verdict = validateDemoEvidence(storyId, input);
  if (!verdict.ok) throw httpError(422, verdict.reason, 'InvalidEvidence');

  const value = input.value.trim();
  const done = await markTaskVerifiedComplete(String(task.project_id), storyId, {
    source: 'demo_evidence',
    ref: input.kind === 'link' ? value : null,
    detail: { kind: input.kind, value, submitted_at: new Date().toISOString() },
  });
  if (!done) return null;

  const points = await payPrepTask(enrollmentId, String(task.project_id), String(task.id), storyId, 'demo_evidence');
  log('demo_evidence_verified', { projectId: String(task.project_id), taskId: String(task.id), storyId, kind: input.kind, points });
  return { ...done, points_awarded: points, already_verified: false };
}

/**
 * The staff path: mark PREP-6 presented. Takes the admin's identity for the
 * trail, never an enrollment — staff are not the owner, and the ref is who
 * vouched. 409 for anything but Demo Day.
 */
export async function markDemoDayPresented(adminIdentity: string, taskId: string, note?: string | null): Promise<DemoCompletion | null> {
  const task = await StudentTask.findByPk(taskId);
  if (!task) return null;
  const project = await Project.findByPk(task.project_id);
  if (!project) return null;
  const enrollmentId = String((project as { enrollment_id?: unknown }).enrollment_id ?? '');

  if (task.story_id !== DEMO_DAY_STORY_ID) {
    throw httpError(409, 'Only "Present at Demo Day" is marked by staff.', 'NotDemoDayTask');
  }
  if (task.verified_at) {
    return { id: String(task.id), story_id: DEMO_DAY_STORY_ID, status: 'complete', verified_at: task.verified_at, points_awarded: 0, already_verified: true };
  }

  const done = await markTaskVerifiedComplete(String(task.project_id), DEMO_DAY_STORY_ID, {
    source: 'staff',
    ref: adminIdentity,
    detail: { marked_by: adminIdentity, note: (note ?? '').trim().slice(0, 500) || null, marked_at: new Date().toISOString() },
  });
  if (!done) return null;

  const points = enrollmentId ? await payPrepTask(enrollmentId, String(task.project_id), String(task.id), DEMO_DAY_STORY_ID, 'staff') : 0;
  log('demo_day_presented', { projectId: String(task.project_id), taskId: String(task.id), by: adminIdentity, points });
  return { ...done, points_awarded: points, already_verified: false };
}
