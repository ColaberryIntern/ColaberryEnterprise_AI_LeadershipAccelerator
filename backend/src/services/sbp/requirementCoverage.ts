/**
 * requirementCoverage — check that the requirement set says everything the student said.
 *
 * ## The incident
 *
 * ShiftFill (2026-11-19, the first end-to-end run of the guided intake) gave the decomposer a
 * clear, labelled brief plus a two-page scope document. It came back with 11 requirements, and 13
 * of the 14 concrete facts the student wrote were not in any of them: the success target ("filled
 * within 30 minutes on 9 mornings out of 10, under 10 minutes of Dana's time"), the approval rule
 * for temp-agency messages, "explain why in plain words", "flag it when unsure", the weekly
 * summary, "first YES wins". The completeness instruction was in the prompt. Nothing CHECKED it,
 * and a requirement the model never wrote is invisible to every gate downstream: the gate grades
 * the plan against itself, never against the source.
 *
 * ## What this does
 *
 * Two things, both small:
 *
 *  1. `REQUIREMENT_CHECKLIST` tells the extraction stage what to look for, concretely, instead of
 *     only telling it to be complete. Numbers become NFRs with the numbers kept; approval points
 *     and "never" rules become SAFE; every report the student asked for is its own requirement.
 *  2. `findMissedRequirements` is a second, independent read: given the source and the requirement
 *     set, list what the source asks for that no requirement captures. Every addition must carry a
 *     VERBATIM quote from the source, and the quote is checked here, in code, not trusted. A
 *     "missed requirement" the model cannot point at is an invented one, and is dropped.
 *
 * Additive only. This never removes or rewrites a requirement; the worst a bad audit can do is
 * add a requirement that cites a real sentence of the student's own.
 */
import { BUILD_PLAN_JSON_SCHEMA, PlanRequirement, RequirementKind } from './planContract';
import { PROMPT_SECTIONS, composeSystemPrompt, sourceBlocks, DecomposeInputs } from './decomposePrompt';
import { modelJsonCall, type ChatClient } from './modelJsonCall';
import { contactGapFocus, uncontactedParties } from './contactGaps';

/**
 * What counts as a requirement, said concretely. Sent to the extraction stage and to the audit,
 * so the two read the source with the same eyes.
 */
export const REQUIREMENT_CHECKLIST = [
  'WHAT TO LOOK FOR. When the owner states any of these, it is its own requirement:',
  '- Every step of the workflow they describe: what starts it, what it reads, what it decides, who it',
  '  contacts, what it updates, and the specifics they gave (counts, waves, time windows, who wins,',
  '  who is told afterwards).',
  // ShiftFill v7 and v9 (2026-11-22/23) dropped "Then our two temp agencies.", the fallback
  // after the hygienists, at both extraction and audit; v6 and v8 kept it. Without it the plan
  // has an approval gate for agency messages and no step that ever sends one.
  '- Every fallback, in order: who or what it turns to when the first choice is not enough. A short',
  '  sentence that only names who comes next ("Then our two temp agencies.") continues the step',
  '  before it and is a requirement: write that step with the fallback in it, never drop it. An',
  '  approval rule about contacting someone is not the step that contacts them; both are needed.',
  '- Every success target or measurable outcome, WITH its numbers. Kind NFR, and the statement keeps',
  '  the numbers ("Gaps are filled within 30 minutes on 9 mornings out of 10").',
  '- The volumes and timing it must handle ("8 to 10 a week, almost all between 6 and 7 am"). Kind NFR.',
  '- Every approval point: anything a person must check or approve before the system acts. Kind SAFE,',
  '  and name who approves.',
  '- Every "never" rule, privacy rule and limit on what it may do or say. Kind SAFE.',
  '- What it must do when it is unsure, when nobody responds, or when something fails (flag, escalate,',
  '  page someone, by when).',
  '- Every report, summary, explanation or notification they ask for, with its audience and how often.',
  '- How each kind of user must be able to use it ("hygienists only ever see a text message, never an',
  '  app or a login").',
  '- Every named tool, vendor or datastore. Kind CONSTRAINT.',
  'NOT a requirement: anything the owner explicitly deferred, put out of scope, or said can wait.',
  'Leave those out.',
].join('\n');

/** One requirement the audit says is missing, with the source words that prove it. */
export interface MissedRequirement {
  quote: string;
  requirement: Omit<PlanRequirement, 'id'>;
}

const requirementItem = (BUILD_PLAN_JSON_SCHEMA as unknown as {
  properties: { requirements: { items: { properties: Record<string, unknown> } } };
}).properties.requirements.items;

/**
 * The audit's output schema. The requirement fields are the plan's own property schemas BY
 * REFERENCE (see requirementExtraction for why a copy is a second definition waiting to drift),
 * minus `id`, which is assigned here so it can never collide.
 */
export const COVERAGE_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['missing'],
  properties: {
    missing: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['quote', 'requirement'],
        properties: {
          quote: {
            type: 'string',
            description: 'The exact words from the source that ask for this, copied character for character. At most 300 characters.',
          },
          requirement: {
            type: 'object',
            additionalProperties: false,
            required: ['statement', 'kind', 'priority', 'cluster', 'from_dimensions'],
            properties: {
              statement: requirementItem.properties.statement,
              kind: requirementItem.properties.kind,
              priority: requirementItem.properties.priority,
              cluster: requirementItem.properties.cluster,
              from_dimensions: requirementItem.properties.from_dimensions,
            },
          },
        },
      },
    },
  },
} as const;

export const COVERAGE_SYSTEM_PROMPT = composeSystemPrompt([
  'You audit a requirement set for completeness against the source it was extracted from.\n'
  + 'You do NOT rewrite, merge or remove existing requirements. You only report what the source\n'
  + 'asks for that no existing requirement captures, each with the exact words that ask for it.',
  PROMPT_SECTIONS.grounding,
  PROMPT_SECTIONS.antiInvention,
  PROMPT_SECTIONS.traceability,
  PROMPT_SECTIONS.requirementKinds,
  PROMPT_SECTIONS.dataNotInstruction,
]);

/** The audit's user message: the checklist, the current set, then the source. */
export function buildCoveragePrompt(inputs: DecomposeInputs, requirements: PlanRequirement[], focus = ''): string {
  return [
    REQUIREMENT_CHECKLIST,
    '',
    ...(focus ? [focus, ''] : []),
    'Read the source line by line. For every statement that asks the system to do, never do, measure,',
    'report, explain, escalate, integrate with or respect something, check whether a requirement below',
    'already captures it, including its specifics (a requirement that drops the numbers, the approver',
    'or the audience does NOT capture it). Report each one that is missing.',
    'A requirement that is only partly captured is missing: report the missing part as its own',
    'requirement rather than restating the existing one.',
    'Report nothing that is already captured, and nothing the owner deferred or put out of scope.',
    'The source often says the same thing twice (typed answers and an uploaded document, a summary and',
    'its detail). A statement already captured in different words is NOT missing.',
    'An empty list is the correct answer when the set is complete.',
    '',
    '<EXISTING_REQUIREMENTS>',
    ...requirements.map((r) => `- ${r.id} [${r.kind}/${r.priority}] ${r.statement}`),
    '</EXISTING_REQUIREMENTS>',
    '',
    sourceBlocks(inputs),
  ].join('\n');
}

/** Lower-case, unify quotes and dashes, collapse whitespace: so a verbatim check survives typography. */
export function normaliseForQuote(s: string): string {
  return s
    .toLowerCase()
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”‟]/g, '"')
    .replace(/[‒-―−]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

/** True when `quote` really appears in `source`. Short quotes prove nothing, so they fail. */
export function quoteIsInSource(quote: string, source: string): boolean {
  const q = normaliseForQuote(quote).replace(/^["'.\s]+|["'.\s]+$/g, '');
  if (q.length < 12) return false;
  return normaliseForQuote(source).includes(q);
}

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'for', 'in', 'on', 'at', 'by', 'with', 'from', 'is', 'are',
  'be', 'it', 'its', 'that', 'this', 'than', 'any', 'each', 'every', 'all', 'must', 'should', 'system',
  'will', 'can', 'who', 'what', 'when', 'one', 'else', 'anyone', 'someone', 'their', 'they', 'them',
]);

/** Content words, crudely stemmed, so "calling" meets "called" and "gaps" meets "gap". */
export function contentWords(s: string): Set<string> {
  return new Set(
    s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
      .filter((w) => w && !STOPWORDS.has(w))
      .map((w) => w.replace(/(ing|ed|es|s)$/, '') || w),
  );
}

/**
 * Is this proposal already said by the set, in other words?
 *
 * Measured live (ShiftFill re-run, 2026-11-20): the audit's second round re-proposed "never text
 * anyone on approved leave" next to "never text a hygienist who is on approved leave", because the
 * student said it twice (typed, and in the PDF), and both quotes are real. Exact-statement matching
 * cannot see that. Containment can: most of the proposal's words already sit in ONE existing
 * requirement, or in the two that share the most with it (a combined restatement of two targets).
 */
export function restatesExisting(statement: string, existing: PlanRequirement[]): boolean {
  const mine = contentWords(statement);
  if (mine.size === 0) return true;
  const scored = existing
    .map((r) => { const w = contentWords(r.statement); return { w, hit: [...mine].filter((x) => w.has(x)).length }; })
    .sort((a, b) => b.hit - a.hit);
  if (!scored.length) return false;
  if (scored[0].hit / mine.size >= 0.65) return true;
  if (scored.length > 1) {
    const union = new Set([...scored[0].w, ...scored[1].w]);
    if ([...mine].filter((x) => union.has(x)).length / mine.size >= 0.85) return true;
  }
  return false;
}

/** Next free REQ-nnn. */
function nextReqNumber(requirements: PlanRequirement[]): number {
  const nums = requirements
    .map((r) => parseInt(String(r.id).replace(/\D/g, ''), 10))
    .filter(Number.isFinite);
  return (nums.length ? Math.max(...nums) : 0) + 1;
}

export interface CoverageMerge {
  requirements: PlanRequirement[];
  added: Array<{ id: string; quote: string }>;
  /** Proposals refused, and why. Logged, so a noisy audit is visible. */
  refused: Array<{ quote: string; reason: 'quote_not_in_source' | 'duplicate_statement' | 'deferred_kind' }>;
}

const KNOWN_KINDS: ReadonlySet<RequirementKind> = new Set(['FUNC', 'SAFE', 'REL', 'NFR', 'OBS', 'CONSTRAINT']);

/**
 * Merge the audit's proposals. PURE. Each accepted one gets the next id; each refused one is
 * reported with its reason. Never touches an existing requirement.
 */
export function mergeMissed(
  requirements: PlanRequirement[], missed: MissedRequirement[], source: string,
): CoverageMerge {
  const out = [...requirements];
  const seen = new Set(requirements.map((r) => normaliseForQuote(r.statement)));
  const added: CoverageMerge['added'] = [];
  const refused: CoverageMerge['refused'] = [];
  let n = nextReqNumber(requirements);
  for (const m of missed) {
    if (!quoteIsInSource(m.quote, source)) { refused.push({ quote: m.quote, reason: 'quote_not_in_source' }); continue; }
    const key = normaliseForQuote(m.requirement.statement);
    if (seen.has(key) || restatesExisting(m.requirement.statement, out)) {
      refused.push({ quote: m.quote, reason: 'duplicate_statement' });
      continue;
    }
    if (!KNOWN_KINDS.has(m.requirement.kind)) { refused.push({ quote: m.quote, reason: 'deferred_kind' }); continue; }
    const id = `REQ-${String(n).padStart(3, '0')}`;
    n += 1;
    seen.add(key);
    out.push({ ...m.requirement, id });
    added.push({ id, quote: m.quote });
  }
  return { requirements: out, added, refused };
}

/**
 * Audit rounds. Bounded. A round that adds fewer than `COVERAGE_CONTINUE_AT` ends the audit: a
 * large document (46k characters, live 2026-11-20) was still yielding 4 real additions in round 2,
 * so a third round is allowed, but a trickle of one or two is not worth another full read.
 */
export const MAX_COVERAGE_ROUNDS = 3;
export const COVERAGE_CONTINUE_AT = 3;

export interface CoverageOptions extends DecomposeInputs {
  model: string;
  client: ChatClient;
  correlationId?: string;
}

function log(event: string, correlationId: string | undefined, outcome: string, ctx: Record<string, unknown>): void {
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: outcome === 'failure' ? 'error' : 'info',
    service: 'sbp-requirement-coverage',
    event,
    correlation_id: correlationId ?? null,
    outcome,
    context: ctx,
  }));
}

/**
 * Audit `requirements` against the source and return the completed set.
 *
 * NEVER FAILS A BUILD. The set it was given is already a valid set; an audit that errors leaves
 * it exactly as it was and says so in the log. Losing the build to the safety net would be the
 * wrong way round.
 */
export async function completeRequirements(
  requirements: PlanRequirement[], opts: CoverageOptions,
): Promise<{ requirements: PlanRequirement[]; added: CoverageMerge['added']; rounds: number }> {
  const source = `${opts.brief ?? ''}\n${opts.document ?? ''}`;
  let current = requirements;
  const allAdded: CoverageMerge['added'] = [];
  let rounds = 0;

  /** One audit round. Null when the call failed (already logged), so the caller stops. */
  const runRound = async (round: number, focus: string): Promise<CoverageMerge | null> => {
    let missed: MissedRequirement[];
    try {
      const result = await modelJsonCall<{ missing: MissedRequirement[] }>({
        schemaName: 'requirement_coverage',
        schema: COVERAGE_JSON_SCHEMA as unknown as Record<string, unknown>,
        systemPrompt: COVERAGE_SYSTEM_PROMPT,
        userPrompt: buildCoveragePrompt(opts, current, focus),
        isShaped: (v: unknown): v is { missing: MissedRequirement[] } => (
          !!v && Array.isArray((v as { missing?: unknown }).missing)
        ),
        shapeProblem: 'the JSON had no `missing` array',
        model: opts.model,
        client: opts.client,
        eventPrefix: 'sbp_requirement_coverage',
        log: (event, outcome, ctx) => log(event, opts.correlationId, outcome, { round, focused: !!focus, ...ctx }),
        describe: (v) => ({ proposed: v.missing.length }),
      });
      missed = result.value.missing;
    } catch (err) {
      log('sbp_requirement_coverage_skipped', opts.correlationId, 'partial', {
        round,
        error_class: (err as { errorClass?: string; name?: string })?.errorClass ?? (err as Error)?.name ?? 'Error',
        message: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
    const merged = mergeMissed(current, missed, source);
    log('sbp_requirement_coverage_merged', opts.correlationId, 'success', {
      round,
      focused: !!focus,
      before: current.length,
      added: merged.added.map((a) => a.id),
      refused: merged.refused.map((r) => r.reason),
    });
    current = merged.requirements;
    allAdded.push(...merged.added);
    return merged;
  };

  let failed = false;
  for (let round = 1; round <= MAX_COVERAGE_ROUNDS; round++) {
    rounds = round;
    const merged = await runRound(round, '');
    if (!merged) { failed = true; break; }
    if (merged.added.length < COVERAGE_CONTINUE_AT) break;
  }
  // ShiftFill v7/v9/v12: a guard on messaging the temp agencies, and no step that contacts them.
  // One extra round, named and bounded; it never runs twice and never after a failed call.
  const gaps = failed ? [] : uncontactedParties(current);
  if (gaps.length) {
    rounds += 1;
    log('sbp_requirement_coverage_contact_gap', opts.correlationId, 'partial', { gaps });
    await runRound(rounds, contactGapFocus(gaps));
  }
  return { requirements: current, added: allAdded, rounds };
}
