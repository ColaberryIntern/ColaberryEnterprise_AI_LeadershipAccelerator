/**
 * scopeAgents — turn a gate-clean plan into the AI team that runs the system.
 *
 * WHY THIS EXISTS. `owner_agent` was declared in the plan schema as a bare
 * `{ type: 'string' }` with no description and no guidance anywhere in the
 * prompt, so the model filled it with job titles. A real plan on production
 * produced:
 *
 *   Contract Manager — owns STORY-001
 *   System           — owns STORY-003, 004, 006, 007, 009, 010
 *   Account Owner    — owns STORY-005, STORY-008
 *
 * "System" owning half the build is not an agent roster, and a student cannot
 * build anything from a job title. What they need is what the requirements
 * already imply: what fires this agent, what it reads, what it produces, how
 * much it is allowed to decide alone, and what it must stop and ask about.
 *
 * TWO RULES ARE ENFORCED IN CODE, NOT ASKED FOR IN THE PROMPT, because they
 * are the difference between a safe system and a plausible one:
 *
 *   1. An agent that touches a SAFE requirement cannot be autonomous. Whatever
 *      the model returns, its autonomy is capped at acts_with_approval and the
 *      SAFE requirement is recorded as its approval gate.
 *   2. Every story keeps an owner. If scoping returns a roster that does not
 *      cover a story, that story keeps the owner it had rather than being
 *      silently unassigned.
 *
 * FAILURE BEHAVIOUR. This runs after the plan is already gate-clean and
 * publishable. If the call fails, times out, or returns something unusable,
 * the plan is returned UNCHANGED with its original owner_agent values. A
 * student never loses a working build because the agent roster could not be
 * scoped.
 */
import { BuildPlan, PlanAgent, PlanRequirement } from './planContract';

const MODEL_DEFAULT = 'gpt-4o';
const TIMEOUT_MS = 60_000;

export interface ScopeAgentsDeps {
  client: { create: (args: any) => Promise<any> };
  model?: string;
  correlationId?: string;
}

export interface ScopeAgentsResult {
  plan: BuildPlan;
  scoped: boolean;
  /** Agents whose autonomy this module lowered because they touch a guardrail. */
  gated: string[];
  reason?: string;
}

const AUTONOMY = ['suggests', 'acts_with_approval', 'acts_autonomously'] as const;
type Autonomy = typeof AUTONOMY[number];

const AGENT_ROSTER_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['agents'],
  properties: {
    agents: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'name', 'purpose', 'trigger_type', 'trigger', 'inputs', 'outputs',
          'autonomy_level', 'escalation_rules', 'skills', 'owns'],
        properties: {
          id: { type: 'string', description: 'AGENT-001, AGENT-002, … sequential' },
          name: {
            type: 'string',
            description:
              'What this agent DOES, not a job title. "Agreement Reader", not "Contract Manager". '
              + 'Never "System", never "Developer", never a person\'s role in the company.',
          },
          purpose: { type: 'string', description: 'One sentence: the decision or work it owns.' },
          trigger_type: { type: 'string', enum: ['event', 'schedule', 'manual'] },
          trigger: {
            type: 'string',
            description: 'The concrete thing that starts it, named from the requirements — a document '
              + 'landing, a row changing, a time of day, a person clicking.',
          },
          inputs: { type: 'array', items: { type: 'string' }, description: 'Named systems, documents or records it reads.' },
          outputs: { type: 'array', items: { type: 'string' }, description: 'What it produces, named concretely.' },
          autonomy_level: {
            type: 'string',
            enum: [...AUTONOMY],
            description:
              'suggests = drafts for a person; acts_with_approval = prepares and waits for a human '
              + 'release; acts_autonomously = completes without a person. Choose the LEAST autonomy '
              + 'the requirements permit.',
          },
          escalation_rules: {
            type: 'array',
            items: { type: 'string' },
            description: 'When it must stop and hand to a person, stated as conditions.',
          },
          skills: { type: 'array', items: { type: 'string' }, description: 'Capabilities it needs, e.g. "read PDF", "match to template".' },
          owns: { type: 'array', items: { type: 'string' }, description: 'Story ids this agent owns.' },
        },
      },
    },
  },
} as const;

const SYSTEM_PROMPT = [
  'You scope the AI team for a system that has already been specified.',
  '',
  'You are given the requirements and the stories. Return the agents that actually run this',
  'system. An agent is a unit of autonomous work with its own trigger, inputs and outputs —',
  'not a person, not a department, and not a layer of the stack.',
  '',
  'Rules:',
  '- Name agents for what they do. "Agreement Reader" and "Kickoff Scheduler", never',
  '  "Contract Manager", "Developer", "Team" or "System".',
  '- Every story must be owned by exactly one agent. Do not leave any unowned.',
  '- Prefer FEWER agents that each own a coherent slice over one agent per story.',
  '- Choose the least autonomy the requirements permit. If a requirement says a human must',
  '  approve something, the agent that produces it is not autonomous.',
  '- Take triggers, inputs and outputs from the requirements. Do not invent a system that',
  '  is not named there.',
].join('\n');

function userPrompt(plan: BuildPlan): string {
  const L: string[] = [];
  L.push(`SYSTEM: ${plan.project_name} — ${plan.descriptor}`);
  L.push('');
  L.push('REQUIREMENTS');
  for (const r of plan.requirements) L.push(`${r.id} (${r.kind}) ${r.statement}`);
  L.push('');
  L.push('STORIES');
  for (const s of plan.stories) L.push(`${s.id} [${s.release}] ${s.title} — fulfils ${s.fulfills.join(', ') || 'nothing'}`);
  L.push('');
  L.push('Return the agent roster. Every story id above must appear in exactly one agent\'s `owns`.');
  return L.join('\n');
}

/** Requirement ids typed SAFE — the promises that force a human into the loop. */
function safeIds(plan: BuildPlan): Set<string> {
  return new Set(plan.requirements.filter((r) => r.kind === 'SAFE').map((r) => r.id));
}

/** The SAFE requirements an agent's own stories touch. */
function gatesFor(agent: PlanAgent, plan: BuildPlan, safes: Set<string>): PlanRequirement[] {
  const owned = new Set(agent.owns);
  const ids = new Set<string>();
  for (const s of plan.stories) {
    if (!owned.has(s.id)) continue;
    for (const f of s.fulfills) if (safes.has(f)) ids.add(f);
  }
  return plan.requirements.filter((r) => ids.has(r.id));
}

const isAutonomy = (v: unknown): v is Autonomy => AUTONOMY.includes(v as Autonomy);

/** Shape-check what came back. Anything malformed means "keep the plan as it was". */
function parseRoster(raw: unknown): PlanAgent[] | null {
  const agents = (raw as any)?.agents;
  if (!Array.isArray(agents) || agents.length === 0) return null;
  const out: PlanAgent[] = [];
  for (const a of agents) {
    if (!a || typeof a.name !== 'string' || !a.name.trim()) return null;
    if (!Array.isArray(a.owns)) return null;
    out.push({
      id: String(a.id || `AGENT-${String(out.length + 1).padStart(3, '0')}`),
      name: a.name.trim(),
      purpose: String(a.purpose || ''),
      trigger_type: ['event', 'schedule', 'manual'].includes(a.trigger_type) ? a.trigger_type : 'manual',
      trigger: String(a.trigger || ''),
      inputs: (a.inputs || []).map(String),
      outputs: (a.outputs || []).map(String),
      autonomy_level: isAutonomy(a.autonomy_level) ? a.autonomy_level : 'acts_with_approval',
      approval_gates: [],
      escalation_rules: (a.escalation_rules || []).map(String),
      skills: (a.skills || []).map(String),
      owns: a.owns.map(String),
    });
  }
  return out;
}

/**
 * Names that mean "nobody in particular". A roster containing one of these has
 * reproduced the problem this module exists to fix, so it is rejected outright
 * rather than published — the plan keeps its original owners and the log says
 * why.
 */
const NON_AGENT_NAMES = /^(system|team|developer|development team|user|admin|staff|unassigned)$/i;

export async function scopeAgents(plan: BuildPlan, deps: ScopeAgentsDeps): Promise<ScopeAgentsResult> {
  const model = deps.model || process.env.SBP_AGENT_MODEL || MODEL_DEFAULT;
  const started = Date.now();

  let raw: unknown;
  try {
    const completion = await deps.client.create({
      model,
      temperature: 0.2,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt(plan) },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'agent_roster', strict: true, schema: AGENT_ROSTER_SCHEMA },
      },
      timeout: TIMEOUT_MS,
    });
    raw = JSON.parse(completion?.choices?.[0]?.message?.content ?? 'null');
  } catch (err: any) {
    log('sbp_agents_scope_failed', deps.correlationId, {
      error_class: err?.name ?? 'Error', message: err?.message, duration_ms: Date.now() - started,
    });
    return { plan, scoped: false, gated: [], reason: 'upstream' };
  }

  const agents = parseRoster(raw);
  if (!agents) {
    log('sbp_agents_scope_unusable', deps.correlationId, { duration_ms: Date.now() - started });
    return { plan, scoped: false, gated: [], reason: 'malformed' };
  }
  if (agents.some((a) => NON_AGENT_NAMES.test(a.name))) {
    log('sbp_agents_scope_rejected_placeholder', deps.correlationId, {
      names: agents.map((a) => a.name),
    });
    return { plan, scoped: false, gated: [], reason: 'placeholder_name' };
  }

  // RULE 1 — an agent that touches a guardrail cannot act alone. Enforced here
  // rather than asked for, because a model that gets this wrong produces a
  // system that quietly breaks the one promise the student cared about.
  const safes = safeIds(plan);
  const gated: string[] = [];
  for (const a of agents) {
    const gates = gatesFor(a, plan, safes);
    if (!gates.length) continue;
    a.approval_gates = gates.map((g) => `${g.id} — ${g.statement}`);
    if (a.autonomy_level === 'acts_autonomously') {
      a.autonomy_level = 'acts_with_approval';
      gated.push(a.name);
    }
  }

  // RULE 2 — every story keeps an owner. A story the roster missed keeps the
  // owner it already had rather than becoming unassigned.
  const ownerByStory = new Map<string, string>();
  for (const a of agents) for (const id of a.owns) ownerByStory.set(id, a.name);
  const stories = plan.stories.map((s) => {
    const owner = ownerByStory.get(s.id);
    return owner ? { ...s, owner_agent: owner } : s;
  });
  const unowned = plan.stories.filter((s) => !ownerByStory.has(s.id)).map((s) => s.id);
  if (unowned.length) log('sbp_agents_stories_unowned', deps.correlationId, { unowned });

  log('sbp_agents_scoped', deps.correlationId, {
    agents: agents.length, gated: gated.length, unowned: unowned.length,
    duration_ms: Date.now() - started,
  });

  return { plan: { ...plan, agents, stories }, scoped: true, gated };
}

function log(event: string, correlationId: string | undefined, ctx: Record<string, unknown>): void {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: event.endsWith('_scoped') ? 'info' : 'warn',
    service: 'sbp-scope-agents',
    event,
    correlation_id: correlationId ?? null,
    outcome: event.endsWith('_scoped') ? 'success' : 'partial',
    context: ctx,
  }));
}
