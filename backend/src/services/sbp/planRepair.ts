/**
 * planRepair — close the gaps the gate found, rather than failing on the first one.
 *
 * The gate is deliberately strict, so a first-pass plan usually has something
 * missing. Without repair, a student's build stops at "your plan has a gap" and
 * they have no way forward — which is a worse experience than the generic
 * template it replaced.
 *
 * Repair is targeted, not a re-roll: the model is given the violations verbatim
 * and returns edits — stories to add/replace/remove, requirements to rewrite —
 * merged by id, so the good parts survive. Re-generating the whole plan would
 * throw away work that already passed and re-roll the dice on everything.
 *
 * Capped at 3 attempts, matching CLAUDE.md's Stall Detection. An unrepairable
 * plan fails closed with its violations recorded, because shipping a plan with
 * a known gap is the thing this whole pipeline exists to prevent.
 *
 * THREE PROPERTIES LEARNED FROM A LIVE 3-WAY CONCURRENCY RUN (2026-08-10), where
 * one build in three failed the gate after burning all 3 attempts:
 *
 *  1. **Repair must be able to edit requirements, not only stories.** The failing
 *     build tripped `requirement_unfalsifiable` on REQ-008 ("a user-friendly
 *     interface"). No story that can ever be written fixes a vague requirement,
 *     so a stories-only repair loop was structurally guaranteed to fail — it
 *     spent all three attempts on a violation it had no vocabulary to address.
 *  2. **Repair must be monotone.** That run went from 3 violations to 6: asked to
 *     fix a UI requirement, the model bolted on STORY-015 and STORY-016, both
 *     near-duplicates of the existing STORY-012, and the three then mutually
 *     tripped `story_redundant_scaffold`. An attempt that does not strictly
 *     reduce the violation count is now discarded and the previous plan kept, so
 *     repair can never hand back something worse than it received.
 *  3. **Repair must be able to remove.** `story_redundant_scaffold` is only
 *     fixable by deleting or narrowing the subsuming story. With add/replace as
 *     the only verbs, the model's sole move was to add — which is exactly the
 *     move that caused the violation.
 */
import OpenAI from 'openai';
import { BuildPlan, PlanStory, PlanRequirement, BUILD_PLAN_JSON_SCHEMA } from './planContract';
import { gatePlan, GateResult } from './planGate';
import { DECOMPOSE_SYSTEM_PROMPT } from './decomposePrompt';

export const MAX_REPAIR_ATTEMPTS = 3;

/**
 * An edit, not a plan. Every field optional so the model can make the smallest
 * change that closes the violations rather than restating work that already passed.
 */
const REPAIR_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['stories', 'requirements', 'remove_story_ids'],
  properties: {
    stories: (BUILD_PLAN_JSON_SCHEMA as any).properties.stories,
    requirements: (BUILD_PLAN_JSON_SCHEMA as any).properties.requirements,
    remove_story_ids: {
      type: 'array',
      items: { type: 'string' },
      description: 'Ids of redundant stories to delete outright.',
    },
  },
} as const;

export interface RepairResult {
  plan: BuildPlan;
  gate: GateResult;
  attempts: number;
  /** Story/requirement ids touched, per accepted attempt — the audit trail of what repair did. */
  changed: string[][];
  /** Attempts thrown away for not reducing the violation count (property 2 above). */
  rejected: number;
}

/** Next free STORY-nnn, so a repair cannot collide with an existing id. */
function nextStoryId(plan: BuildPlan): string {
  const nums = plan.stories
    .map((s) => parseInt(String(s.id).replace(/\D/g, ''), 10))
    .filter(Number.isFinite);
  return `STORY-${String((nums.length ? Math.max(...nums) : 0) + 1).padStart(3, '0')}`;
}

/**
 * What to actually DO about each rule. Without this the model guesses, and its
 * guess is almost always "add another story" — the one move that made the live
 * failure worse. Keyed on rule so the guidance is only shown when relevant.
 */
const REMEDIES: Record<string, string> = {
  story_is_layer:
    'A story that fulfils only CONSTRAINT requirements is plumbing. Do NOT add a new story. ' +
    'Instead REPLACE it with the same id, widening `fulfills` to include the FUNC/SAFE requirement ' +
    'that plumbing actually serves, and retitle it as the user-visible outcome ' +
    '(not "Connect to the RSS feed" but "Director is warned two weeks before a deadline").',
  story_redundant_scaffold:
    'A story that subsumes two or more others is duplicate scope. Fix it by REMOVING it ' +
    '(put its id in remove_story_ids), or by REPLACING it with a narrowed `fulfills` that no ' +
    'longer covers the others. Never resolve this by adding a story.',
  requirement_unfalsifiable:
    'REPLACE the requirement with the SAME id and a statement a test could fail. Name the ' +
    'observable behaviour and its threshold. "Should be user-friendly" becomes ' +
    '"Every screen the director uses must complete its primary action in three clicks or fewer."',
  must_uncovered:
    'ADD a story that delivers this requirement end to end, or widen an existing story\'s `fulfills`.',
  release_unbalanced:
    'Move stories between releases by REPLACING them with the same ids and a different `release`. ' +
    'Do not add or delete stories to rebalance.',
  acceptance_too_few: 'REPLACE the story with the same id and at least 3 acceptance lines.',
  acceptance_no_trust_line:
    'REPLACE the story with the same id, adding exactly one acceptance line starting "Trust".',
  r0_no_trust_spine:
    'ADD one r0 story that proves the correctness guarantee end to end — the idempotency / ' +
    'exactly-once promise and its audit trail. That is r0\'s whole point.',
};

/** Remedies for the rules actually violated, deduped and in violation order. */
function remedyText(gate: GateResult): string {
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const v of gate.violations) {
    if (seen.has(v.rule) || !REMEDIES[v.rule]) continue;
    seen.add(v.rule);
    lines.push(`- ${v.rule}: ${REMEDIES[v.rule]}`);
  }
  return lines.length ? `\nHOW TO FIX EACH KIND OF VIOLATION:\n${lines.join('\n')}\n` : '';
}

/** Deep-ish copy so a rejected attempt cannot leave mutations behind. */
function clonePlan(plan: BuildPlan): BuildPlan {
  return { ...plan, stories: [...plan.stories], requirements: [...plan.requirements] };
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
  // `best` is what we will hand back. It only ever moves toward fewer violations.
  let best: BuildPlan = clonePlan(plan);
  let bestGate = gatePlan(best, sourceText);
  const changed: string[][] = [];
  let rejected = 0;

  for (let attempt = 1; attempt <= MAX_REPAIR_ATTEMPTS && !bestGate.ok; attempt++) {
    deps.onAttempt?.(attempt, bestGate.violations.length);

    // Give the model the requirement text behind every id it needs to cover —
    // asking it to fix "REQ-016" without saying what REQ-016 is invites a guess.
    const cited = [...new Set(bestGate.violations.flatMap((v) => v.message.match(/REQ-\d+/g) ?? []))];
    const reqContext = cited.length
      ? `\nREQUIREMENTS REFERENCED ABOVE:\n${cited.map((id) => {
          const r = best.requirements.find((x) => x.id === id);
          return r ? `${id} (${r.kind}/${r.priority}) — ${r.statement}` : `${id} — (not found)`;
        }).join('\n')}\n`
      : '';

    const storyContext = best.stories
      .map((s) => `${s.id} [${s.release}] ${s.title} → ${(s.fulfills ?? []).join(',')} (${(s.acceptance ?? []).length} acceptance)`)
      .join('\n');

    const completion = await deps.client.create({
      model: deps.model,
      temperature: 0.2,
      messages: [
        { role: 'system', content: DECOMPOSE_SYSTEM_PROMPT },
        { role: 'user', content:
            `A plan you produced failed its traceability gate. Fix EXACTLY these violations and ` +
            `introduce no new ones.\n\n` +
            `VIOLATIONS:\n${bestGate.violations.map((v) => `- [${v.rule}] ${v.message}`).join('\n')}\n` +
            `${reqContext}${remedyText(bestGate)}\n` +
            `RELEASES: ${best.releases.map((r) => `${r.key}=${r.name} (wk${r.week_start}-${r.week_end})`).join(', ')}\n\n` +
            `CURRENT STORIES:\n${storyContext}\n\n` +
            `Return the SMALLEST edit that clears the list:\n` +
            `- \`stories\`: stories to ADD or REPLACE. Same id = replace it. New id = add it, ` +
            `numbered from ${nextStoryId(best)}.\n` +
            `- \`requirements\`: requirements to REPLACE, same id, corrected statement.\n` +
            `- \`remove_story_ids\`: ids of redundant stories to delete.\n` +
            `Prefer REPLACING over ADDING. Never add a story whose title or scope overlaps one ` +
            `already listed above — that is what caused the redundancy violations in the first place. ` +
            `Return empty arrays for anything you are not changing.\n` +
            `Every story needs >=3 acceptance lines with exactly one starting "Trust".` },
      ],
      response_format: { type: 'json_schema', json_schema: { name: 'plan_repair', strict: true, schema: REPAIR_SCHEMA } },
    });

    let edit: { stories?: PlanStory[]; requirements?: PlanRequirement[]; remove_story_ids?: string[] } = {};
    try {
      edit = JSON.parse(completion.choices[0]?.message?.content ?? '{}') ?? {};
    } catch {
      // A malformed repair is not fatal — the loop re-gates and tries again, and
      // the attempt cap stops it running away.
      edit = {};
    }

    const fixStories = Array.isArray(edit.stories) ? edit.stories : [];
    const fixReqs = Array.isArray(edit.requirements) ? edit.requirements : [];
    const removeIds = Array.isArray(edit.remove_story_ids) ? edit.remove_story_ids : [];
    if (fixStories.length === 0 && fixReqs.length === 0 && removeIds.length === 0) break; // nothing offered

    // Apply to a CANDIDATE, never to `best` — an attempt that makes things worse
    // must leave no trace.
    const candidate = clonePlan(best);
    const touched: string[] = [];

    for (const fix of fixReqs) {
      const i = candidate.requirements.findIndex((r) => r.id === fix.id);
      // Requirements may only be corrected in place. Letting a repair invent new
      // requirements would let it move the goalposts it is being graded against.
      if (i >= 0) { candidate.requirements[i] = fix; touched.push(fix.id); }
    }
    for (const fix of fixStories) {
      const i = candidate.stories.findIndex((s) => s.id === fix.id);
      if (i >= 0) candidate.stories[i] = fix; else candidate.stories.push(fix);
      touched.push(fix.id);
    }
    if (removeIds.length) {
      const drop = new Set(removeIds);
      const kept = candidate.stories.filter((s) => !drop.has(s.id));
      // Refuse a removal that would empty the plan — a gate-clean plan with no
      // stories is not a fix, it is a way of gaming the gate.
      if (kept.length > 0) {
        candidate.stories = kept;
        touched.push(...removeIds.filter((id) => candidate.stories.every((s) => s.id !== id)));
      }
    }

    const candidateGate = gatePlan(candidate, sourceText);

    // Monotonicity. Strictly fewer violations, or the attempt is thrown away.
    if (candidateGate.violations.length < bestGate.violations.length) {
      best = candidate;
      bestGate = candidateGate;
      changed.push(touched);
    } else {
      rejected += 1;
    }
  }

  return { plan: best, gate: bestGate, attempts: changed.length, changed, rejected };
}
