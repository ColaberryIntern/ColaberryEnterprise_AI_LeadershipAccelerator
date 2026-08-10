/**
 * planRepair — close the gaps the gate found, rather than failing on the first one.
 *
 * The gate is deliberately strict, so a first-pass plan usually has something
 * missing. Without repair, a student's build stops at "your plan has a gap" and
 * they have no way forward — which is a worse experience than the generic
 * template it replaced.
 *
 * Repair is targeted, not a re-roll: the model is given the violations verbatim
 * and returns stories to ADD or REPLACE (merged by id), so the good stories
 * survive. Re-generating the whole plan would throw away work that already
 * passed and re-roll the dice on everything.
 *
 * Capped at 3 attempts, matching CLAUDE.md's Stall Detection. An unrepairable
 * plan fails closed with its violations recorded, because shipping a plan with
 * a known gap is the thing this whole pipeline exists to prevent.
 */
import OpenAI from 'openai';
import { BuildPlan, PlanStory, BUILD_PLAN_JSON_SCHEMA } from './planContract';
import { gatePlan, GateResult } from './planGate';
import { DECOMPOSE_SYSTEM_PROMPT } from './decomposePrompt';

export const MAX_REPAIR_ATTEMPTS = 3;

/** Just the stories array — a repair returns stories, never a whole plan. */
const REPAIR_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['stories'],
  properties: { stories: (BUILD_PLAN_JSON_SCHEMA as any).properties.stories },
} as const;

export interface RepairResult {
  plan: BuildPlan;
  gate: GateResult;
  attempts: number;
  /** Story ids added or replaced, per attempt — the audit trail of what repair did. */
  changed: string[][];
}

/** Next free STORY-nnn, so a repair cannot collide with an existing id. */
function nextStoryId(plan: BuildPlan): string {
  const nums = plan.stories
    .map((s) => parseInt(String(s.id).replace(/\D/g, ''), 10))
    .filter(Number.isFinite);
  return `STORY-${String((nums.length ? Math.max(...nums) : 0) + 1).padStart(3, '0')}`;
}

/**
 * Gate, and repair until clean or out of attempts. Returns the best plan reached
 * along with its final gate result — the caller decides what to do with a plan
 * that is still failing.
 */
export async function gateAndRepair(
  plan: BuildPlan,
  sourceText: string,
  deps: {
    client: Pick<OpenAI['chat']['completions'], 'create'>;
    model: string;
    correlationId?: string;
    onAttempt?: (attempt: number, violations: number) => void;
  },
): Promise<RepairResult> {
  let working: BuildPlan = { ...plan, stories: [...plan.stories] };
  let gate = gatePlan(working, sourceText);
  const changed: string[][] = [];

  for (let attempt = 1; attempt <= MAX_REPAIR_ATTEMPTS && !gate.ok; attempt++) {
    deps.onAttempt?.(attempt, gate.violations.length);

    // Give the model the requirement text behind every id it needs to cover —
    // asking it to fix "REQ-016" without saying what REQ-016 is invites a guess.
    const cited = [...new Set(gate.violations.flatMap((v) => v.message.match(/REQ-\d+/g) ?? []))];
    const reqContext = cited.length
      ? `\nREQUIREMENTS REFERENCED ABOVE:\n${cited.map((id) => {
          const r = working.requirements.find((x) => x.id === id);
          return r ? `${id} (${r.kind}/${r.priority}) — ${r.statement}` : `${id} — (not found)`;
        }).join('\n')}\n`
      : '';

    const storyContext = working.stories
      .map((s) => `${s.id} [${s.release}] ${s.title} → ${(s.fulfills ?? []).join(',')} (${(s.acceptance ?? []).length} acceptance)`)
      .join('\n');

    const completion = await deps.client.create({
      model: deps.model,
      temperature: 0.2,
      messages: [
        { role: 'system', content: DECOMPOSE_SYSTEM_PROMPT },
        { role: 'user', content:
            `A plan you produced failed its traceability gate. Fix EXACTLY these violations.\n\n` +
            `VIOLATIONS:\n${gate.violations.map((v) => `- ${v.message}`).join('\n')}\n${reqContext}\n` +
            `RELEASES: ${working.releases.map((r) => `${r.key}=${r.name} (wk${r.week_start}-${r.week_end})`).join(', ')}\n\n` +
            `CURRENT STORIES:\n${storyContext}\n\n` +
            `Return stories to ADD or REPLACE:\n` +
            `- To FIX an existing story, return it with its SAME id and the problem corrected.\n` +
            `- To FILL a gap, return a NEW story numbered from ${nextStoryId(working)}.\n` +
            `- If r0 lacks a trust-spine story, add one that proves the correctness guarantee ` +
            `end to end (the exactly-once/idempotency promise and its audit trail). That is r0's whole point.\n` +
            `- Spread new stories across releases; do not pile them into r0.\n` +
            `Every story needs >=3 acceptance lines with exactly one starting "Trust".` },
      ],
      response_format: { type: 'json_schema', json_schema: { name: 'repair_stories', strict: true, schema: REPAIR_SCHEMA } },
    });

    let fixes: PlanStory[] = [];
    try {
      fixes = JSON.parse(completion.choices[0]?.message?.content ?? '{}').stories ?? [];
    } catch {
      // A malformed repair is not fatal — the loop re-gates and tries again, and
      // the attempt cap stops it running away.
      fixes = [];
    }
    if (fixes.length === 0) break;   // nothing offered; further attempts will not help

    const touched: string[] = [];
    for (const fix of fixes) {
      const i = working.stories.findIndex((s) => s.id === fix.id);
      if (i >= 0) working.stories[i] = fix; else working.stories.push(fix);
      touched.push(fix.id);
    }
    changed.push(touched);
    gate = gatePlan(working, sourceText);
  }

  return { plan: working, gate, attempts: changed.length, changed };
}
