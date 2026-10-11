/**
 * The four registration points for DeptCampaignPerformanceAgent.
 *
 * WHY A SEPARATE SUITE, AND WHY IT READS SOURCE. A behaviour test proves the
 * agent computes the right numbers; it cannot prove the agent ever RUNS. All
 * four of these facts live in files the agent does not import, and getting any
 * one of them wrong fails SILENTLY in production:
 *
 *   1. the agent exports a runner with the shape runAgent() calls;
 *   2. aiOrchestrator.ts wraps it in runAgent() — which is what buys the
 *      enabled/paused gate, run_count, error_count and the activity log;
 *   3. aiOpsScheduler.ts gives it a SCHEDULE_REGISTRY row, and does NOT list it
 *      in UNINSTRUMENTED_AGENTS (that set is inverted from how it reads:
 *      membership means the runner ALSO gets instrumentCronJob(), so a
 *      self-tracking runner listed there double-counts every run);
 *   4. agentRegistrySeed.ts gives it an AGENT_REGISTRY row — runAgent() does
 *      AiAgent.findOne({ agent_name }) and returns null on a miss, so without
 *      the row the cron fires on time and does nothing, forever.
 *
 * It asserts on source text rather than importing the registries because
 * importing aiOpsScheduler pulls in node-cron and the whole orchestrator import
 * graph (100+ Sequelize models), which has no database in CI. Every matcher
 * below therefore carries a POSITIVE CONTROL: a grep that has never been shown
 * to match something, and to NOT match something else, is not evidence. Source
 * is read with \r stripped — these files are CRLF in a Windows checkout and LF
 * in CI, and a byte-exact assertion that only passes on one of them is a
 * platform bug dressed as a test.
 */
jest.mock('../../../../../models', () => ({
  Campaign: { findAll: jest.fn().mockResolvedValue([]) },
  CampaignLead: { findAll: jest.fn().mockResolvedValue([]) },
  ScheduledEmail: { findAll: jest.fn().mockResolvedValue([]) },
}));

import fs from 'fs';
import path from 'path';

import { AGENT_NAME, runCampaignPerformanceAgent } from '../campaignPerformanceAgent';

const SERVICES = path.resolve(__dirname, '../../../../');
const SUPER_AGENTS = path.join(SERVICES, 'agents/departments/superAgents');

/** Read a file, newline-normalised. An empty read is a path typo and must throw. */
function read(relToServices: string): string {
  const full = path.join(SERVICES, relToServices);
  const src = fs.readFileSync(full, 'utf8').replace(/\r\n/g, '\n');
  if (src.trim().length === 0) throw new Error(`empty source: ${full}`);
  return src;
}

/**
 * Drop block comments and whole-line `//` comments.
 *
 * This runs BEFORE any slicing, not after, and that order is the whole trick.
 * sliceLiteral() skips quoted strings so a `[` in a description cannot end a
 * literal — but prose apostrophes ("Ali's decision", inside a comment in
 * SCHEDULE_REGISTRY) then open a string that never closes, and the slice walks
 * off the end of the array. Removing comments first removes the apostrophes.
 * Trailing `//` on a line of code is deliberately left alone: these registries
 * have none, and a looser rule would eat the `//` in a URL inside a string.
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
}

/**
 * The text of the array or object literal that starts at `anchor`, brackets
 * balanced and quoted strings skipped, so a bracket inside a description cannot
 * end the literal.
 *
 * Two things here were wrong on the first two runs, and the positive controls
 * below are what caught both — an unchecked slice silently reports zero rows,
 * which would have made every count in this suite a lie in the safe direction:
 *   (a) the search for the opening bracket starts past the END of the anchor,
 *       because these declarations carry a type annotation with brackets of its
 *       own (`ScheduleEntry[]`, `string[]`) and the first `[` was that;
 *   (b) depth counts `[]` and `{}` TOGETHER, because AGENT_GROUP_MAP is an
 *       object whose values are arrays — balancing one bracket type returned
 *       its first group and stopped.
 */
function sliceLiteral(src: string, anchor: string): string {
  const at = src.indexOf(anchor);
  if (at < 0) throw new Error(`anchor not found: ${anchor}`);
  const from = at + anchor.length;
  const candidates = [src.indexOf('[', from), src.indexOf('{', from)].filter((i) => i >= 0);
  if (candidates.length === 0) throw new Error(`no literal after anchor: ${anchor}`);
  const open = Math.min(...candidates);
  let depth = 0;
  let quote: string | null = null;
  for (let i = open; i < src.length; i++) {
    const ch = src[i];
    if (quote) {
      if (ch === '\\') i++;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') { quote = ch; continue; }
    if (ch === '[' || ch === '{') depth++;
    else if (ch === ']' || ch === '}') {
      depth--;
      if (depth === 0) return src.slice(open, i + 1);
    }
  }
  throw new Error(`unbalanced literal after anchor: ${anchor}`);
}

/** Every quoted occurrence of a bare name in a comment-free region. */
function quotedOccurrences(region: string, name: string): number {
  return (region.match(new RegExp(`'${name}'`, 'g')) ?? []).length;
}

const orchestrator = read('aiOrchestrator.ts');
const scheduler = read('aiOpsScheduler.ts');
const seed = read('agentRegistrySeed.ts');

const schedulerCode = stripComments(scheduler);
const seedCode = stripComments(seed);

const scheduleRegistry = sliceLiteral(schedulerCode, 'export const SCHEDULE_REGISTRY: ScheduleEntry[] =');
const uninstrumented = sliceLiteral(schedulerCode, 'const UNINSTRUMENTED_AGENTS = new Set(');
const groupMap = sliceLiteral(seedCode, 'export const AGENT_GROUP_MAP: Record<string, string[]> =');

/** The names aiOpsScheduler.ts imports from aiOrchestrator.ts. */
const orchestratorImports = (() => {
  const end = scheduler.indexOf("} from './aiOrchestrator';");
  if (end < 0) throw new Error("aiOpsScheduler.ts no longer imports from './aiOrchestrator'");
  return scheduler.slice(scheduler.lastIndexOf('import {', end), end);
})();

/** The `hardcodedSchedule` of a SCHEDULE_REGISTRY row, by agentName. */
function registrySchedule(agentName: string): string | null {
  for (const row of scheduleRegistry.split(/\{\s*agentName:\s*/)) {
    if (!row.startsWith(`'${agentName}'`)) continue;
    const m = row.match(/hardcodedSchedule:\s*'([^']+)'/);
    return m ? m[1] : null;
  }
  return null;
}

/** The trigger_type and schedule of the AGENT_REGISTRY entry named `agentName`. */
function seedSchedule(agentName: string): { trigger: string | null; schedule: string | null } {
  const at = seedCode.indexOf(`agent_name: '${agentName}'`);
  if (at < 0) return { trigger: null, schedule: null };
  // Bounded to this entry: the next `agent_name:` begins the following one.
  const next = seedCode.indexOf('agent_name: ', at + 1);
  const block = seedCode.slice(at, next < 0 ? undefined : next);
  const trigger = block.match(/trigger_type:\s*'([^']+)'/);
  const schedule = block.match(/schedule:\s*'([^']+)'/);
  return { trigger: trigger ? trigger[1] : null, schedule: schedule ? schedule[1] : null };
}

describe('1. the agent itself', () => {
  it('exports a runner under the registered name runAgent() looks up', () => {
    expect(typeof runCampaignPerformanceAgent).toBe('function');
    expect(AGENT_NAME).toBe('DeptCampaignPerformanceAgent');
  });

  it('returns the shared AgentExecutionResult shape, not an invented one', async () => {
    // Shape only — the behaviour suite covers the values.
    const result = await runCampaignPerformanceAgent('agent-id');

    expect(Object.keys(result).sort()).toEqual([
      'actions_taken',
      'agent_name',
      'campaigns_processed',
      'duration_ms',
      'entities_processed',
      'errors',
    ]);
    expect(result.agent_name).toBe(AGENT_NAME);
  });
});

describe('2. the aiOrchestrator wrapper', () => {
  it('runs the agent through runAgent(), which is what buys the gate and the counters', () => {
    expect(orchestrator).toContain('AGENT_NAME as CAMPAIGN_PERFORMANCE_AGENT_NAME');
    expect(orchestrator).toContain("from './agents/departments/marketing/campaignPerformanceAgent'");
    expect(orchestrator).toContain(
      'return runAgent(CAMPAIGN_PERFORMANCE_AGENT_NAME, runCampaignPerformanceAgent);',
    );
  });

  it('POSITIVE CONTROL: the same matcher finds a known wrapper and rejects a fabricated one', () => {
    expect(orchestrator).toContain("return runAgent('OfferRoutingAgent', runOfferRoutingAgent);");
    expect(orchestrator).not.toContain('return runAgent(FABRICATED_AGENT_NAME,');
  });
});

describe('3. the SCHEDULE_REGISTRY entry', () => {
  it('has a row whose runner is the orchestrator wrapper, not the agent function', () => {
    expect(registrySchedule(AGENT_NAME)).toBe('25 */6 * * *');
    expect(scheduleRegistry).toContain(
      `{ agentName: '${AGENT_NAME}', hardcodedSchedule: '25 */6 * * *', runner: runCampaignPerformance,`,
    );
    expect(orchestratorImports).toContain('\n  runCampaignPerformance,\n');
  });

  it('POSITIVE CONTROL: the import slice holds the other runners and not a fabricated one', () => {
    expect(orchestratorImports).toContain('\n  runOfferRouting,\n');
    expect(orchestratorImports).not.toContain('runFabricatedRunner');
  });

  it('appears exactly once, so it cannot become two timers on one counter', () => {
    expect(quotedOccurrences(scheduleRegistry, AGENT_NAME)).toBe(1);
  });

  it('is NOT in UNINSTRUMENTED_AGENTS — that set is inverted, and the runner self-tracks', () => {
    expect(quotedOccurrences(uninstrumented, AGENT_NAME)).toBe(0);
    // POSITIVE CONTROL: the same slice and matcher find the members that ARE
    // there, so the zero above is a fact about the set, not about the matcher.
    expect(quotedOccurrences(uninstrumented, 'Dara')).toBe(1);
    expect(quotedOccurrences(uninstrumented, 'ProposalCleanupService')).toBe(1);
  });

  it('POSITIVE CONTROL: registrySchedule() reads a known row and misses an absent one', () => {
    expect(registrySchedule('CampaignHealthScanner')).toBe('*/15 * * * *');
    expect(registrySchedule('FabricatedSchedulerRow')).toBeNull();
  });
});

describe('4. the AGENT_REGISTRY row and the group map', () => {
  it('has a cron AGENT_REGISTRY row — without it runAgent() finds no AiAgent and no-ops', () => {
    expect(seedSchedule(AGENT_NAME)).toEqual({ trigger: 'cron', schedule: '25 */6 * * *' });
  });

  it('the seeded schedule and the scheduler schedule are the SAME string', () => {
    // A disagreement here is what the cron-registry ratchet reports: the cron
    // fires on one schedule while every admin surface shows the other.
    expect(seedSchedule(AGENT_NAME).schedule).toBe(registrySchedule(AGENT_NAME));
  });

  it('POSITIVE CONTROL: seedSchedule() reads a known row and misses an absent one', () => {
    expect(seedSchedule('MarketingAutomationArchitect')).toEqual({
      trigger: 'cron',
      schedule: '18 */6 * * *',
    });
    expect(seedSchedule('FabricatedSeedRow')).toEqual({ trigger: null, schedule: null });
  });

  it('is claimed by exactly one group, under marketing', () => {
    // ai_agents.agent_group is a single column and assignAgentGroups() writes
    // only `where agent_group IS NULL`, so a second listing of a name is an
    // update that matches no row — the silent no-op that held content_engine at
    // zero members for seven months.
    expect(quotedOccurrences(groupMap, AGENT_NAME)).toBe(1);
    expect(groupMap).toContain(`marketing: [\n    '${AGENT_NAME}',\n  ],`);
  });

  it('POSITIVE CONTROL: the sliced map spans every group, so "exactly once" means across all of them', () => {
    // Without this the count above could be 1 because the slice only covered
    // one group. First group, a middle one, another middle one, and the group
    // immediately before the new key.
    //
    // The third anchor used to be 'content_engine: [],' - the declared-empty group. It was
    // deleted on 2026-10-07 when its super agent was repointed at `marketing`, so the anchor
    // moved to the key that followed it. A positive control pinned to a key that no longer
    // exists is a control that fails for the wrong reason.
    expect(groupMap).toContain("campaign_ops: [");
    expect(groupMap).toContain("'AdmissionsAssistantAgent'");
    expect(groupMap).toContain("analytics_engine: [");
    expect(groupMap).toContain("'FinanceIntelligenceArchitect'");
    expect(groupMap.trimEnd().endsWith('}')).toBe(true);
  });

  it('POSITIVE CONTROL: comment stripping is what makes that count a claim, not prose', () => {
    // The map carries a comment that quotes the agent name, so an unstripped
    // count would be measuring prose. Proven on this file, not just in theory.
    expect(seed).toMatch(new RegExp(`^[ \\t]*//.*'${AGENT_NAME}'`, 'm'));
    expect(seedCode).not.toMatch(new RegExp(`^[ \\t]*//.*'${AGENT_NAME}'`, 'm'));
    expect(stripComments(`  // '${AGENT_NAME}' in a comment\n`)).not.toContain(AGENT_NAME);
    // …and stripping did not eat code: the sentinel rows still read.
    expect(registrySchedule('CampaignHealthScanner')).toBe('*/15 * * * *');
  });
});

describe('the supervision gap, closed on purpose', () => {
  it('exactly one super agent reads agent_group marketing, and it is the repointed one', () => {
    // This test used to assert the OPPOSITE - that nothing read `marketing` - precisely so that
    // adding a supervisor could not happen by accident. The product owner decided it on
    // 2026-10-07 and ContentEngineSuperAgent was repointed here from `content_engine`, a group
    // that was structurally incapable of holding a member and had published 9,412 "0/0 healthy"
    // reports as a result. The assertion is inverted rather than deleted, so the invariant is now
    // "exactly one, and we know which" - and a SECOND supervisor appearing still fails here.
    const sources = fs
      .readdirSync(SUPER_AGENTS)
      .filter((f) => f.endsWith('.ts'))
      .map((f) => ({ file: f, src: fs.readFileSync(path.join(SUPER_AGENTS, f), 'utf8') }));

    expect(sources.length).toBeGreaterThan(8);
    expect(
      sources.filter((s) => s.src.includes("runSuperAgentCycle('marketing'")).map((s) => s.file),
    ).toEqual(['contentEngineSuperAgent.ts']);

    // And the group it left behind is gone, not merely emptied.
    expect(sources.some((s) => s.src.includes("runSuperAgentCycle('content_engine'"))).toBe(false);

    // POSITIVE CONTROL: the same search still finds the groups that have their own.
    for (const group of ['campaign_ops', 'analytics_engine', 'finance']) {
      expect(sources.some((s) => s.src.includes(`runSuperAgentCycle('${group}'`))).toBe(true);
    }
  });
});
