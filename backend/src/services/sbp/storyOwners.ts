/**
 * storyOwners — every story is owned by an agent that is actually on the roster.
 *
 * WHY THIS EXISTS. ShiftFill v5 (2026-11-21, project 392b73bd) scoped six
 * agents, but none of them listed STORY-003 ("Ensure privacy of call-out
 * reasons") in `owns`. `scopeAgents` then kept the story's pre-scoping owner,
 * "AI Agent", which is not an agent at all. Two things went wrong at once:
 *
 *   - the Command Center showed a story owned by an agent that does not exist;
 *   - REQ-010 ("never share one employee's reason for calling out") was
 *     enforced by NOBODY, because guardrails are attached through `owns`.
 *
 * So a story the roster missed is HOMED, deterministically, on the roster agent
 * it fits best, before the guardrails are attached. Scoring, highest wins, ties
 * to roster order:
 *
 *   3 x requirements it shares with stories the agent already owns
 *   1 x content words it shares with the agent's name, purpose, trigger, inputs, outputs
 *   1   if the agent already owns a story in the same release
 *
 * PURE. No I/O. Inputs are never mutated; an unchanged agent comes back as the
 * same object. Idempotent: a plan with no orphans is returned as it was.
 */
import { BuildPlan, PlanAgent, PlanRequirement, PlanStory } from './planContract';
import { guardrailGate, rolesFrom } from './planPeople';

const STOP = new Set(['that', 'this', 'with', 'from', 'into', 'when', 'then', 'they', 'their', 'there',
  'have', 'must', 'should', 'will', 'want', 'what', 'which', 'each', 'every', 'only', 'never', 'system',
  'agent', 'ensure', 'make', 'sure', 'given', 'story', 'able', 'about', 'after', 'before']);

/** Content words, lower-cased, crude singular. "Call-out reasons" -> call, out?, reason. */
function words(text: string): Set<string> {
  const out = new Set<string>();
  for (const w of text.toLowerCase().split(/[^a-z0-9]+/)) {
    if (w.length < 4 || STOP.has(w)) continue;
    out.add(w.length > 4 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w);
  }
  return out;
}

function score(story: PlanStory, agent: PlanAgent, byId: Map<string, PlanStory>): number {
  const owned = agent.owns.map((id) => byId.get(id)).filter((s): s is PlanStory => !!s);
  const reqs = new Set(owned.flatMap((s) => s.fulfills));
  const shared = story.fulfills.filter((r) => reqs.has(r)).length;
  const agentWords = words([agent.name, agent.purpose, agent.trigger, ...agent.inputs, ...agent.outputs].join(' '));
  const storyWords = words([story.title, story.narrative].join(' '));
  let overlap = 0;
  for (const w of storyWords) if (agentWords.has(w)) overlap++;
  const sameRelease = owned.some((s) => s.release === story.release) ? 1 : 0;
  return shared * 3 + overlap + sameRelease;
}

export interface HomedRoster {
  agents: PlanAgent[];
  stories: PlanStory[];
  /** story id -> the agent it was homed on. Empty when nothing was missing. */
  homed: Map<string, string>;
}

/** Give every story the roster missed to the agent that fits it best. */
export function homeOrphanStories(stories: readonly PlanStory[], agents: readonly PlanAgent[]): HomedRoster {
  const homed = new Map<string, string>();
  if (!agents.length) return { agents: [...agents], stories: [...stories], homed };
  const owned = new Set(agents.flatMap((a) => a.owns));
  const byId = new Map(stories.map((s) => [s.id, s]));
  const extra = new Map<string, string[]>();
  for (const s of stories) {
    if (owned.has(s.id)) continue;
    let best = agents[0];
    let bestScore = -1;
    for (const a of agents) {
      const sc = score(s, a, byId);
      if (sc > bestScore) { best = a; bestScore = sc; }
    }
    homed.set(s.id, best.name);
    extra.set(best.name, [...(extra.get(best.name) ?? []), s.id]);
  }
  if (!homed.size) {
    // Still align owner_agent with `owns`, which is the roster's own word.
    return { agents: [...agents], stories: alignOwners(stories, agents), homed };
  }
  const out = agents.map((a) => (extra.has(a.name) ? { ...a, owns: [...a.owns, ...extra.get(a.name)!] } : a));
  return { agents: out, stories: alignOwners(stories, out), homed };
}

function alignOwners(stories: readonly PlanStory[], agents: readonly PlanAgent[]): PlanStory[] {
  const ownerOf = new Map<string, string>();
  for (const a of agents) for (const id of a.owns) if (!ownerOf.has(id)) ownerOf.set(id, a.name);
  return stories.map((s) => {
    const owner = ownerOf.get(s.id);
    return owner && owner !== s.owner_agent ? { ...s, owner_agent: owner } : s;
  });
}

const label = (r: PlanRequirement) => `${r.id} — ${r.statement}`;
const idOf = (entry: string) => entry.split(/\s/)[0];

/**
 * Attach the SAFE requirements an agent's stories touch: a rule a person can let
 * through becomes an approval gate and caps autonomy; one nobody can let through
 * becomes a hard rule. Only ever adds and only ever lowers autonomy, so running
 * it on an already-guarded agent changes nothing. Returns the agents whose
 * autonomy it lowered.
 */
export function attachGuardrails(
  agents: PlanAgent[], plan: Pick<BuildPlan, 'requirements' | 'stories'>, only?: ReadonlySet<string>,
): { agents: PlanAgent[]; gated: string[] } {
  const safes = new Map(plan.requirements.filter((r) => r.kind === 'SAFE').map((r) => [r.id, r]));
  const roles = rolesFrom(plan.stories);
  const byId = new Map(plan.stories.map((s) => [s.id, s]));
  const gated: string[] = [];
  const out = agents.map((a) => {
    if (only && !only.has(a.name)) return a;
    const touched = [...new Set(a.owns.flatMap((id) => byId.get(id)?.fulfills ?? []))]
      .map((id) => safes.get(id)).filter((r): r is PlanRequirement => !!r);
    const has = new Set([...(a.approval_gates ?? []), ...(a.hard_rules ?? [])].map(idOf));
    const fresh = touched.filter((r) => !has.has(r.id));
    if (!fresh.length) return a;
    const isApproval = (r: PlanRequirement) => guardrailGate(r.statement, roles).kind === 'approval';
    const gates = fresh.filter(isApproval).map(label);
    const rules = fresh.filter((r) => !isApproval(r)).map(label);
    const next: PlanAgent = { ...a, approval_gates: [...(a.approval_gates ?? []), ...gates] };
    if (rules.length) next.hard_rules = [...(a.hard_rules ?? []), ...rules];
    if (gates.length && next.autonomy_level === 'acts_autonomously') {
      next.autonomy_level = 'acts_with_approval';
      gated.push(a.name);
    }
    return next;
  });
  return { agents: out, gated };
}

/**
 * The roster a render should show: orphans homed, and the agents that took one
 * on given that story's guardrails. Plans scoped before this existed (ShiftFill
 * v5) are repaired on their next render.
 */
export function rosterWithEveryStoryOwned(plan: BuildPlan): BuildPlan {
  if (!plan.agents?.length) return plan;
  const { agents, stories, homed } = homeOrphanStories(plan.stories, plan.agents);
  if (!homed.size && stories.every((s, i) => s === plan.stories[i])) return plan;
  const guarded = attachGuardrails(agents, { requirements: plan.requirements, stories }, new Set(homed.values()));
  return { ...plan, agents: guarded.agents, stories };
}
