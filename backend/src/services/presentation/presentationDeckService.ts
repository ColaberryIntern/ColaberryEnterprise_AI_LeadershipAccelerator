import crypto from 'crypto';
import { classifyError, type ErrorClass } from '../../utils/errorClassifier';
import { checkGrounding, type MetricClaim } from './presentationGrounding';

/**
 * Turning a student's assembled prompt into a deck, through the AI client this repo
 * already instruments.
 *
 * NO NEW PAID SERVICE, AND NO NEW CLIENT. `getInstrumentedOpenAI` already redacts
 * high-sensitivity PII from outgoing content, emits an `ai_events` row with a computed
 * `cost_usd`, and carries a trace id. Constructing a bare `new OpenAI(...)` here would
 * silently opt this feature out of all three, which is exactly the drift that factory
 * exists to prevent. Cost telemetry is therefore not something this module implements —
 * it is something it gets by not going around the client.
 *
 * RETRIES ARE CAPPED, AND THE CAP IS THE POINT. A model call that fails is retried at
 * most MAX_TRIES times with exponential backoff, and only for failures where a retry
 * could plausibly help. An auth error or a malformed request is not transient: retrying
 * it three times spends three times the money to be told the same thing. The classifier
 * decides, not a bare catch.
 *
 * A FAILURE IS A ROW, NOT AN ABSENCE. When the attempts run out the row is written with
 * `state = 'failed'`, the error class and the try count. "Nothing happened" and "we
 * tried three times and the model kept timing out" must not look the same to the
 * student, and the second must be retryable from the UI.
 *
 * ONE GENERATION IN FLIGHT PER ASSIGNMENT, enforced by a partial unique index rather
 * than a read-then-write. Two clicks a second apart would otherwise both see "nothing
 * running" and both start a paid call.
 *
 * NOTHING HERE COMPLETES A TASK. A generated deck is work in progress; whether it
 * satisfies PREP-3 is still decided by `markTaskVerifiedComplete` from submitted
 * evidence.
 */

/** Lazy so importing this module never constructs the ORM. */
async function db() {
  const { sequelize } = await import('../../config/database');
  return sequelize;
}

/** Three is the cap: enough to ride out a blip, few enough to bound the spend. */
export const MAX_TRIES = 3;
const BASE_BACKOFF_MS = 500;
const CALL_TIMEOUT_MS = 90_000;
const MODEL = process.env.PRESENTATION_DECK_MODEL || 'gpt-4o';
const WORKFLOW_ID = 'presentation_deck';

/**
 * Which failures a retry could plausibly fix.
 *
 * An AuthError means the key is wrong and will still be wrong in 500ms. A
 * ValidationError means we sent something the API will keep rejecting. Retrying either
 * spends money to be told the same thing — so the set is an ALLOW-list, not a
 * deny-list: a class nobody has classified yet does not get retried by default.
 */
const RETRYABLE: ReadonlySet<ErrorClass> = new Set<ErrorClass>([
  'TimeoutError',
  'RateLimitError',
  'UpstreamUnavailable',
]);

export function isRetryable(err: unknown): boolean {
  return RETRYABLE.has(classifyError(err));
}

/** Exponential, and pure so the schedule is testable without waiting for it. */
export function backoffMs(attempt: number): number {
  return BASE_BACKOFF_MS * 2 ** Math.max(0, attempt - 1);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type DeckState = 'generating' | 'ready' | 'failed';

export interface DeckRow {
  id: string;
  assignmentId: string;
  attemptNo: number;
  state: DeckState;
  model: string | null;
  promptVersion: string | null;
  tries: number;
  errorClass: string | null;
  /** Present only when ready. */
  contentHtml: string | null;
  /** Figures in the deck that appear in nothing the student wrote. */
  unsupported: MetricClaim[];
}

export type GenerateResult =
  | { ok: true; deck: DeckRow }
  | { ok: false; reason: 'already_generating' | 'no_prompt' | 'exhausted'; deck?: DeckRow };

/** The prompt text a generation actually sent, frozen so "why that deck" has an answer. */
export function promptSha(prompt: string): string {
  return crypto.createHash('sha256').update(prompt, 'utf8').digest('hex');
}

function toRow(r: Record<string, any>): DeckRow {
  return {
    id: String(r.id),
    assignmentId: String(r.assignment_id),
    attemptNo: Number(r.attempt_no ?? 1),
    state: (r.state || 'generating') as DeckState,
    model: r.model ?? null,
    promptVersion: r.prompt_version ?? null,
    tries: Number(r.tries ?? 0),
    errorClass: r.error_class ?? null,
    contentHtml: r.content_html ?? null,
    unsupported: Array.isArray(r.grounding_json?.unsupported) ? r.grounding_json.unsupported : [],
  };
}

/**
 * Claim the one in-flight slot for this assignment.
 *
 * `ON CONFLICT DO NOTHING` against the partial unique index is the whole concurrency
 * control: the loser of a race gets no row back and is told something is already
 * running, rather than starting a second paid call.
 */
async function claimSlot(assignmentId: string, promptVersion: string, sha: string): Promise<DeckRow | null> {
  const sequelize = await db();
  const [rows] = await sequelize.query(
    `INSERT INTO presentation_decks
       (assignment_id, attempt_no, state, model, prompt_version, prompt_sha, tries)
     SELECT :aid,
            COALESCE((SELECT MAX(attempt_no) FROM presentation_decks WHERE assignment_id = :aid), 0) + 1,
            'generating', :model, :pv, :sha, 0
     ON CONFLICT DO NOTHING
     RETURNING *`,
    { replacements: { aid: assignmentId, model: MODEL, pv: promptVersion, sha } },
  ) as [Array<Record<string, any>>, unknown];
  const row = rows?.[0];
  return row ? toRow(row) : null;
}

async function finish(
  id: string,
  patch: { state: DeckState; tries: number; contentHtml?: string | null; errorClass?: string | null; errorDetail?: string | null; grounding?: unknown },
): Promise<DeckRow> {
  const sequelize = await db();
  const [rows] = await sequelize.query(
    `UPDATE presentation_decks
        SET state = :state,
            tries = :tries,
            content_html = :html,
            error_class = :ec,
            error_detail = :ed,
            grounding_json = :grounding,
            finished_at = NOW(),
            updated_at = NOW()
      WHERE id = :id
     RETURNING *`,
    {
      replacements: {
        id,
        state: patch.state,
        tries: patch.tries,
        html: patch.contentHtml ?? null,
        ec: patch.errorClass ?? null,
        // Capped: an upstream error body can be enormous, and this column is read by a
        // human triaging, not by a parser.
        ed: patch.errorDetail ? String(patch.errorDetail).slice(0, 2000) : null,
        grounding: patch.grounding ? JSON.stringify(patch.grounding) : null,
      },
    },
  ) as [Array<Record<string, any>>, unknown];
  return toRow(rows[0]);
}

function log(event: string, ctx: Record<string, unknown>, outcome: 'success' | 'failure' = 'success'): void {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: outcome === 'failure' ? 'warn' : 'info',
    service: 'presentation-deck', event, outcome, context: ctx,
  }));
}

export interface GenerateInput {
  assignmentId: string;
  /** The assembled prompt. Built by presentationPromptService, never by this module. */
  prompt: string;
  /** `<template>@<version>`, so a deck can be traced to the template that produced it. */
  promptVersion: string;
  /**
   * The student's OWN material - narrative, project description, task titles, submitted
   * evidence. Deliberately NOT the prompt: the template text contains example figures,
   * and grounding against the thing that asked for a number would make every
   * fabrication look supported.
   */
  sources?: string[];
}

/**
 * Generate a deck, at most MAX_TRIES attempts, recording the outcome either way.
 *
 * The caller owns ownership: this is reached only after the project tree has been
 * proved to belong to the enrollment.
 */
export async function generateDeck(input: GenerateInput): Promise<GenerateResult> {
  const prompt = (input.prompt || '').trim();
  if (!prompt) return { ok: false, reason: 'no_prompt' };

  const claimed = await claimSlot(input.assignmentId, input.promptVersion, promptSha(prompt));
  if (!claimed) return { ok: false, reason: 'already_generating' };

  const { getInstrumentedOpenAI } = await import('../openaiInstrumented');
  const client = getInstrumentedOpenAI({
    workflow_id: WORKFLOW_ID,
    // Recorded on every ai_events row, so cost can be attributed to a template version
    // rather than to "the Studio" in aggregate.
    prompt_version: input.promptVersion,
  });

  let lastError: unknown = null;
  for (let attempt = 1; attempt <= MAX_TRIES; attempt += 1) {
    try {
      const resp: any = await client.chat.completions.create(
        {
          model: MODEL,
          messages: [{ role: 'user', content: prompt }],
        },
        { timeout: CALL_TIMEOUT_MS },
      );
      const html = resp?.choices?.[0]?.message?.content;
      if (!html || typeof html !== 'string' || !html.trim()) {
        // A 200 with nothing in it is a contract violation, not a success. Treating it
        // as one would store an empty deck and call it ready.
        // `name`, not a bespoke `error_class` field: classifyError reads name/code/status
        // and falls back to the name. An `error_class` property would be ignored and this
        // would be filed as plain "Error".
        throw Object.assign(new Error('The model returned an empty deck.'), { name: 'ContractViolation' });
      }
      // Checked BEFORE the deck is stored, and stored WITH it. The prompt carries no
      // figures, so any number here came from the model unless the student wrote it.
      // Flagged rather than deleted: silently cutting numbers from someone's slides is
      // its own kind of lying, and a true figure they never typed here is a real case.
      const grounding = checkGrounding(html, input.sources ?? []);
      const deck = await finish(claimed.id, {
        state: 'ready', tries: attempt, contentHtml: html, grounding,
      });
      if (!grounding.clean) {
        log('deck_unsupported_figures', {
          assignmentId: input.assignmentId,
          unsupported: grounding.unsupported.map((c) => c.text),
          claims: grounding.claims.length,
        }, 'failure');
      }
      log('deck_generated', { assignmentId: input.assignmentId, attemptNo: deck.attemptNo, tries: attempt, promptVersion: input.promptVersion });
      return { ok: true, deck };
    } catch (err) {
      lastError = err;
      const cls = classifyError(err);
      const canRetry = isRetryable(err) && attempt < MAX_TRIES;
      log('deck_generation_attempt_failed', {
        assignmentId: input.assignmentId, attempt, error_class: cls, willRetry: canRetry,
      }, 'failure');
      if (!canRetry) {
        const deck = await finish(claimed.id, {
          state: 'failed',
          tries: attempt,
          errorClass: cls,
          errorDetail: (err as Error)?.message,
        });
        return { ok: false, reason: 'exhausted', deck };
      }
      await sleep(backoffMs(attempt));
    }
  }

  // Unreachable: the loop either returns or writes a failed row on its last attempt.
  // Kept so a future edit to the loop cannot leave the slot claimed forever.
  const deck = await finish(claimed.id, {
    state: 'failed', tries: MAX_TRIES, errorClass: classifyError(lastError), errorDetail: (lastError as Error)?.message,
  });
  return { ok: false, reason: 'exhausted', deck };
}

/** The deck to show, and whether another attempt is allowed. Read-only. */
export async function latestDeck(assignmentId: string): Promise<{ deck: DeckRow | null; retryable: boolean }> {
  const sequelize = await db();
  const [rows] = await sequelize.query(
    `SELECT * FROM presentation_decks
      WHERE assignment_id = :aid
      ORDER BY attempt_no DESC
      LIMIT 1`,
    { replacements: { aid: assignmentId } },
  ) as [Array<Record<string, any>>, unknown];
  const row = rows?.[0];
  if (!row) return { deck: null, retryable: true };
  const deck = toRow(row);
  // A failure is retryable: the cap bounds ONE generation's spend, it does not
  // permanently bar a student whose model call timed out this afternoon.
  return { deck, retryable: deck.state === 'failed' };
}

/**
 * The latest deck for a task, with ownership proved the way every other read on this
 * surface proves it. A project that is not yours is indistinguishable from one that
 * does not exist.
 *
 * This is the entry point a route uses; `latestDeck` is the inner read and assumes the
 * caller already holds the project.
 */
export async function latestDeckForOwner(
  enrollmentId: string,
  projectId: string,
  storyId: string,
): Promise<{ ok: true; deck: DeckRow | null; retryable: boolean } | { ok: false; reason: 'not_found' }> {
  const { getOwnedProjectTree } = await import('../projects/projectReadService');
  if (!(await getOwnedProjectTree(enrollmentId, projectId))) return { ok: false, reason: 'not_found' };

  const { default: PresentationAssignment } = await import('../../models/PresentationAssignment');
  const assignment = await PresentationAssignment.findOne({ where: { project_id: projectId, story_id: storyId } });
  // No assignment yet is "nothing to show", not an error: the student has simply not
  // started. Returning 404 would read as a broken page.
  if (!assignment) return { ok: true, deck: null, retryable: true };

  const r = await latestDeck(String(assignment.id));
  return { ok: true, ...r };
}
