import fs from 'fs';
import path from 'path';

// `created: true` on purpose — it skips `seedAgentRegistry`'s `if (!created)` branch, which
// reaches persona-version history and the autonomy reclassifier and needs a real row. This suite
// is about WHAT THE SEED WOULD WRITE for Maya, not about the update path.
jest.mock('../../models/AiAgent', () => ({
  findOrCreate: jest.fn(async () => [
    { id: 'agent-row', persona_version: null, tools_granted: null, update: jest.fn() },
    true,
  ]),
  update: jest.fn(),
}));
jest.mock('../reese/reeseIdentitySeed', () => ({ seedReeseIdentity: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../reese/reeseSystemPrompt', () => ({ REESE_PERSONA_BLOCK: 'MOCKED_PERSONA_BLOCK' }));

import AiAgent from '../../models/AiAgent';
import { seedAgentRegistry } from '../agentRegistrySeed';
// Safe to import for real: mayaPersona.ts is a single exported string constant with no imports
// of its own, so it pulls in neither the models barrel nor any service.
import { MAYA_PERSONA_BLOCK } from '../mayaPersona';

/**
 * Maya is a registered agent, and her grants are her REAL tools.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 *
 * Ali, 2026-10-26: "I was expecting to have one of these created for Maya - Maya should be flowing
 * through our agent system." She was not in the registry at all - `SELECT COUNT(*) FROM ai_agents
 * WHERE agent_name ILIKE '%maya%'` returned 0 in production - so the one agent the public actually
 * talks to had no dashboard, no autonomy level and no tool-grant record, while Reese and Dara did.
 *
 * ── THE DRIFT THIS GUARDS, WHICH ALREADY HAPPENED ONCE ──────────────────────
 *
 * `tools_granted` is meant to be honest: the Reese entry says it "reflects exactly what the code
 * lets Reese do". Nothing enforced that. Writing Maya's entry by hand I listed NINE tools and
 * dropped `schedule_callback`; `MAYA_TOOLS` declares TEN. Caught by counting the real array rather
 * than trusting the list I had just written - which is what this test now does permanently.
 *
 * ── TWO THINGS THIS SUITE DOES THE AWKWARD WAY, AND WHY ─────────────────────
 *
 * It DRIVES THE SEED rather than reading the array: `AGENT_REGISTRY` is not exported, and the
 * first draft of this test asserted against `AGENT_REGISTRY.find(...)` and died on
 * `Cannot read properties of undefined`. Driving `seedAgentRegistry()` and reading the
 * `findOrCreate` arguments tests what the seed would actually write, which is the better question
 * anyway.
 *
 * It READS THE TOOL NAMES AS TEXT rather than importing `MAYA_TOOLS`: `mayaActionService` imports
 * the models BARREL, which wires Sequelize associations at load (`AiAgent.hasMany(...)`), and the
 * mock above has no `hasMany`. That killed an earlier draft with
 * `AiAgent_1.default.hasMany is not a function` before a single assertion ran. A CONTROL below
 * asserts the extraction found exactly ten, so a broken regex fails loudly rather than comparing
 * two empty lists and passing. `consentTextParity.test.ts` reads a file as text for the same
 * reason.
 *
 * The autonomy classification is deliberately NOT re-derived here. The real classifier already
 * runs over this entry in the seed path exercised by `agentGroupMapIntegrity.test.ts`, which logs
 * `autonomy_level_auto_classified_on_create ... "communicate", matched_tool: "send_document"`.
 */

const MAYA_ACTION_SERVICE = path.join(__dirname, '..', 'mayaActionService.ts');
const COMMUNICATE_TOOLS = ['send_document', 'send_sms_summary', 'initiate_voice_call'];

function realToolNames(): string[] {
  const src = fs.readFileSync(MAYA_ACTION_SERVICE, 'utf8');
  return Array.from(src.matchAll(/^ {6}name: '([a-z_]+)',$/gm)).map((m) => m[1]);
}

type SeedArgs = { where: { agent_name: string }; defaults: Record<string, unknown> };

let maya: Record<string, unknown>;

beforeAll(async () => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  await seedAgentRegistry();

  const calls = (AiAgent.findOrCreate as unknown as jest.Mock).mock.calls as Array<[SeedArgs]>;
  const found = calls.find((c) => c[0].where.agent_name === 'Maya');
  maya = (found ? found[0].defaults : {}) as Record<string, unknown>;
}, 300000);

describe('the instruments themselves', () => {
  it('the seed ran and registered many agents, so a miss below means Maya specifically', () => {
    expect((AiAgent.findOrCreate as unknown as jest.Mock).mock.calls.length).toBeGreaterThan(50);
  });

  it('found the tool list, so the comparison below is not vacuous', () => {
    const names = realToolNames();
    expect(names.length).toBe(10);
    expect(names).toContain('capture_lead_details');
  });
});

describe('Maya is in the agent registry at all', () => {
  it('the seed registers her, which is the whole point of the change', () => {
    expect(maya.agent_name).toBe('Maya');
  });

  it('is an admissions agent pointing at her real source', () => {
    expect(maya).toMatchObject({
      module: 'admissions',
      category: 'admissions',
      trigger_type: 'event_driven',
    });
    expect(String(maya.source_file)).toContain('admissionsMayaService');
  });

  it('seeds DISABLED, per the rule the Dara entry records', () => {
    // build-platform-agent/SKILL.md: "new agents seed with AiAgent.enabled: false by default".
    // A human enables the row after validation. Her chat is separately gated by ENABLE_CHAT, so
    // this does not switch her off either - registering an agent changes no behaviour.
    expect(maya.enabled).toBe(false);
  });
});

describe('her grants are her real tools, not an aspiration', () => {
  it('matches MAYA_TOOLS exactly, as a set', () => {
    const granted = [...((maya.tools_granted as string[]) ?? [])].sort();

    // Fails in BOTH directions: a tool she has but is not granted, and a grant for a tool that
    // does not exist. The first understates her; the second is the lie this test exists to stop.
    expect(granted).toEqual(realToolNames().sort());
  });

  it('declares ten, which is the count I got wrong by hand', () => {
    expect(maya.tools_granted).toHaveLength(10);
  });

  it('includes schedule_callback, the one the hand-written list dropped', () => {
    expect(maya.tools_granted).toContain('schedule_callback');
  });
});

describe('what the grants mean', () => {
  it('carries the tools that put her on the communicate rung', () => {
    expect(maya.tools_granted).toEqual(expect.arrayContaining(COMMUNICATE_TOOLS));
  });

  it('does NOT grant send_email, so the email tool drafts for her', () => {
    // Ali: "she can draft for now - but eventually she will send on her own." The two dials are
    // independent: `autonomy_level` gates the CATEGORY (hers is `communicate`), `tools_granted`
    // gates the specific tool. Granting it later is a row update, not a deploy.
    //
    // The literal rather than importing `AGENT_EMAIL_TOOL`: that module imports the models barrel
    // too, which is the same import failure described in the docblock.
    expect(maya.tools_granted).not.toContain('send_email');
  });

  // ── REVISED 2026-10-27 ────────────────────────────────────────────────────
  //
  // This block used to assert `expect(maya.system_prompt).toBeUndefined()`, on the reasoning
  // that hers is composed per conversation and a static copy would drift. The concern was
  // right; the conclusion was wrong. That column has exactly ONE consumer —
  // `agentManagerConversationPrompt.ts`, the admin Talk tab — which is her MANAGER's
  // conversation, not a visitor's. Leaving it null did not prevent a drifting copy, it just
  // gave her manager the "No system prompt has been configured for you yet" fallback.
  //
  // So the assertion now pins the DISTINCTION rather than the absence, which is the thing
  // actually worth protecting: the row carries the manager block, and the visitor prompt stays
  // composed live. Dara proves the pattern — manager block on the row, student block in her
  // builder, "never mixed" (curriculum/daraPersona.ts).
  describe('her system_prompt is the MANAGER block, and only that', () => {
    it('carries one, so the Talk tab is not a blank frame', () => {
      expect(typeof maya.system_prompt).toBe('string');
      expect((maya.system_prompt as string).length).toBeGreaterThan(200);
    });

    it('is exactly MAYA_PERSONA_BLOCK — not a hand-copied paraphrase of it', () => {
      expect(maya.system_prompt).toBe(MAYA_PERSONA_BLOCK);
    });

    it('declares on its face that this conversation is with the manager, not a prospect', () => {
      // The load-bearing line. Without it an LLM handed this block in the Talk tab could
      // reasonably start selling to its own manager.
      expect(maya.system_prompt).toContain('speaking to your MANAGER');
      expect(maya.system_prompt).toContain('Report on the pipeline; do not pitch it');
    });

    it('carries the two sections the locked persona pattern requires', () => {
      expect(maya.system_prompt).toContain('VOICE PRINCIPLES (locked):');
      expect(maya.system_prompt).toContain('GUARDRAILS (never do these):');
    });

    it('carries the two guardrails that are non-negotiable for EVERY agent built this way', () => {
      // build-platform-agent/SKILL.md, Derivation rule 2: "always including 'never pretend to
      // be human or hide that you are an AI' and a neutral-pronoun ('they/them') line - these
      // two are non-negotiable across every agent built this way".
      expect(maya.system_prompt).toContain('Never pretend to be human');
      expect(maya.system_prompt).toContain('they/them');
    });

    it('carries her two domain guardrails: no price from memory, and the TWC wording rule', () => {
      // Both are standing constraints an admissions agent can violate in one sentence, so they
      // are pinned rather than trusted to survive a future reword.
      expect(maya.system_prompt).toContain('Never state a price');
      expect(maya.system_prompt).toContain('807.172(d)');
      expect(maya.system_prompt).toContain('no card needed');
    });

    it('does NOT claim the outcomes she cannot see', () => {
      expect(maya.system_prompt).toContain('Never report a send as a delivery');
      expect(maya.system_prompt).toContain('Never claim an enrollment');
    });
  });
});
