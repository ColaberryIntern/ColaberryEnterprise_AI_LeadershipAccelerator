/**
 * STORY-000 for the ten agent-domain projects.
 *
 * Owner instruction, 30 October 2026: "Everyone should be building a Command Center as Story 000
 * so they can understand what all they will be building."
 *
 * The content checks here are about HONESTY rather than wording. A Command Center is the one page
 * everybody reads first, so a figure it states that nothing produced, or a rung it draws as
 * available when the platform cannot reach it, is worse than a missing page: it is a page that is
 * trusted and wrong.
 */
import { AGENT_DOMAIN_KEYS, AGENT_DOMAINS } from '../agentDomainRegistry';
import { loadDomainMatrix } from '../capabilityRecord';
import { AUTONOMY_LEVELS } from '../autonomyLadder';
import { planForAllDomains, planForDomain } from '../agentDomainStoryTemplates';
import {
  COMMAND_CENTER_ACCEPTANCE,
  COMMAND_CENTER_STORY_ID,
  COMMAND_CENTER_TITLE,
  autonomyStagesUsedBy,
  commandCenterBrief,
  commandCenterPromptForDomain,
  domainCommandCenterStoryId,
  isDomainCommandCenterStoryId,
  releaseBehaviourCount,
} from '../agentDomainCommandCenterStory';

const domainOf = (key: string) => AGENT_DOMAINS.find((d) => d.domain_key === key)!;
const ccOf = (key: string) => planForDomain(key).stories.find((s) => s.kind === 'command_center')!;

describe('the story id convention', () => {
  it('is domain-prefixed, because story ids must be unique across all ten projects', () => {
    // The platform writes a bare `STORY-000` per project. These ten use a globally unique
    // convention instead, and a test in agentDomainStoryTemplates asserts that uniqueness --
    // the invariant that stopped a stale tab matching on story_id alone and overwriting
    // eighteen tasks that belonged to a different project.
    expect(domainCommandCenterStoryId('marketing')).toBe('marketing.STORY-000');
    const ids = AGENT_DOMAIN_KEYS.map(domainCommandCenterStoryId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("the TITLE is the platform's own, so a human reads the same thing everywhere", () => {
    expect(COMMAND_CENTER_TITLE).toContain(COMMAND_CENTER_STORY_ID);
    expect(COMMAND_CENTER_TITLE).toContain('Build your Command Center');
    for (const key of AGENT_DOMAIN_KEYS) expect(ccOf(key).title).toBe(COMMAND_CENTER_TITLE);
  });

  it('isDomainCommandCenterStoryId recognises every generated id', () => {
    for (const key of AGENT_DOMAIN_KEYS) {
      expect(isDomainCommandCenterStoryId(domainCommandCenterStoryId(key))).toBe(true);
    }
  });

  it('NEGATIVE CONTROL: it rejects a bare id and a lookalike', () => {
    // Anchored on the separator. Without it, `WEEK-STORY-000` would pass.
    expect(isDomainCommandCenterStoryId('STORY-000')).toBe(false);
    expect(isDomainCommandCenterStoryId('marketing.STORY-0001')).toBe(false);
    expect(isDomainCommandCenterStoryId('marketingSTORY-000')).toBe(false);
    expect(isDomainCommandCenterStoryId('marketing.RESEARCH-1-SYSTEM-CLASSES')).toBe(false);
  });
});

describe('every domain gets exactly one, and it fulfils no capability', () => {
  it('one per domain, all ten', () => {
    const all = planForAllDomains().flatMap((p) => p.stories).filter((s) => s.kind === 'command_center');
    expect(all).toHaveLength(10);
  });

  it('carries no capability_id and gives a shared-foundation reason instead', () => {
    for (const key of AGENT_DOMAIN_KEYS) {
      const s = ccOf(key);
      expect(s.capability_id).toBeNull();
      expect(s.shared_foundation_reason).toBeTruthy();
      expect(s.shared_foundation_reason).toMatch(/window onto it/);
    }
  });

  it('is draft, like every other story on these boards', () => {
    for (const key of AGENT_DOMAIN_KEYS) expect(ccOf(key).status).toBe('draft');
  });

  it('names a human as the thing that closes it, and refuses self-certification', () => {
    for (const key of AGENT_DOMAIN_KEYS) {
      expect(ccOf(key).validation_dependency).toMatch(/accountable human/);
      expect(ccOf(key).validation_dependency).toMatch(/not evidence/);
    }
  });
});

describe("the brief states this domain's own measured figures", () => {
  it('names the real accountable human, never a placeholder', () => {
    for (const key of AGENT_DOMAIN_KEYS) {
      const m = loadDomainMatrix(key);
      expect(commandCenterBrief(domainOf(key), m)).toContain(m.accountable_human);
    }
  });

  it('states the real capability count for that domain', () => {
    for (const key of AGENT_DOMAIN_KEYS) {
      const m = loadDomainMatrix(key);
      expect(commandCenterBrief(domainOf(key), m))
        .toContain(`${m.capabilities.length} researched capabilities`);
    }
  });

  it('no two domains get the same brief, so none of this is a template', () => {
    const briefs = AGENT_DOMAIN_KEYS.map((k) => commandCenterBrief(domainOf(k), loadDomainMatrix(k)));
    expect(new Set(briefs).size).toBe(briefs.length);
  });

  it('says plainly that nothing is validated yet', () => {
    for (const key of AGENT_DOMAIN_KEYS) {
      expect(commandCenterBrief(domainOf(key), loadDomainMatrix(key)))
        .toMatch(/Nothing here is validated yet/);
    }
  });

  it('the release-behaviour count it quotes agrees with the capability records', () => {
    // The figure that makes the migration a projection rather than an invention. If it drifts
    // from the data, the brief is advertising work that is not actually written down.
    for (const key of AGENT_DOMAIN_KEYS) {
      const m = loadDomainMatrix(key);
      const counted = m.capabilities.reduce((n, c) => n + c.release_behaviour.length, 0);
      expect(releaseBehaviourCount(m)).toBe(counted);
      expect(commandCenterBrief(domainOf(key), m)).toContain(`${counted} per-rung behaviours`);
    }
  });

  it('POSITIVE CONTROL: at least one domain actually has release behaviour recorded', () => {
    // Without this, the count check above would pass on ten zeroes.
    const total = AGENT_DOMAIN_KEYS
      .reduce((n, k) => n + releaseBehaviourCount(loadDomainMatrix(k)), 0);
    expect(total).toBeGreaterThan(0);
  });
});

describe('autonomyStagesUsedBy', () => {
  it('returns stages in ladder order, not the order they were encountered', () => {
    for (const key of AGENT_DOMAIN_KEYS) {
      const stages = autonomyStagesUsedBy(loadDomainMatrix(key));
      const order = AUTONOMY_LEVELS.map((l) => `autonomy:${l}`);
      const idx = stages.map((s) => order.indexOf(s));
      expect(idx).toEqual([...idx].sort((a, b) => a - b));
    }
  });

  it('every stage it returns is a real rung, never an invented one', () => {
    const valid = new Set(AUTONOMY_LEVELS.map((l) => `autonomy:${l}`));
    for (const key of AGENT_DOMAIN_KEYS) {
      for (const s of autonomyStagesUsedBy(loadDomainMatrix(key))) {
        expect(valid.has(s)).toBe(true);
      }
    }
  });
});

describe('the prompt is honest about what the platform cannot do', () => {
  it("renders all ten rungs with the owner's wording", () => {
    const p = commandCenterPromptForDomain(domainOf('platform'), loadDomainMatrix('platform'));
    for (const l of AUTONOMY_LEVELS) expect(p).toContain(`\`autonomy:${l}\``);
  });

  it('discloses that the handoff rung is unreachable rather than drawing it as pending', () => {
    for (const key of AGENT_DOMAIN_KEYS) {
      const p = commandCenterPromptForDomain(domainOf(key), loadDomainMatrix(key));
      expect(p).toMatch(/does not exist in this platform today/);
      expect(p).toMatch(/unreachable by fact rather than by choice/);
    }
  });

  it('tells the builder to render effective authority, not the requested level', () => {
    // The whole reason an authority figure on this page could be wrong. `effectiveAuthority()`
    // forces anything above R2 down to R2 while no tools are granted, so a page that renders the
    // capability record's own number overstates nine agents at once.
    for (const key of AGENT_DOMAIN_KEYS) {
      const p = commandCenterPromptForDomain(domainOf(key), loadDomainMatrix(key));
      expect(p).toContain('effectiveAuthority()');
      expect(p).toContain('no_tool_grants');
    }
  });

  it('names the four signals that must never promote an agent', () => {
    for (const key of AGENT_DOMAIN_KEYS) {
      const p = commandCenterPromptForDomain(domainOf(key), loadDomainMatrix(key));
      expect(p).toContain('NON_PROMOTING_SIGNALS');
      expect(p).toMatch(/marked\s+complete/);
      expect(p).toMatch(/elapsed time/);
      expect(p).toMatch(/conversation that went well/);
      expect(p).toMatch(/mocked test passing/);
    }
  });

  it('says a tool request grants nothing', () => {
    for (const key of AGENT_DOMAIN_KEYS) {
      expect(commandCenterPromptForDomain(domainOf(key), loadDomainMatrix(key)))
        .toMatch(/grants nothing by itself/);
    }
  });

  it('cites only endpoints that exist in the admin route tree', () => {
    // A prompt that sends a builder to a route nobody built is a prompt that costs them a day.
    // These are asserted against the paths registered in agentDomainRoutes/agentFactoryRoutes.
    const REAL = [
      '/api/admin/agent-domains-mine',
      '/api/admin/agent-domain-change-requests-mine',
    ];
    for (const key of AGENT_DOMAIN_KEYS) {
      const p = commandCenterPromptForDomain(domainOf(key), loadDomainMatrix(key));
      for (const r of REAL) expect(p).toContain(r);
      expect(p).toContain(`/api/admin/agent-domains/${key}`);
      expect(p).toContain(`/api/admin/agent-domains/${key}/coverage`);
    }
  });

  it('no two domains get the same prompt', () => {
    const prompts = AGENT_DOMAIN_KEYS
      .map((k) => commandCenterPromptForDomain(domainOf(k), loadDomainMatrix(k)));
    expect(new Set(prompts).size).toBe(prompts.length);
  });
});

describe('acceptance criteria -- the "Done means" block', () => {
  it('is non-empty, because an empty one hides the whole block in the portal', () => {
    // `student_tasks.acceptance` is nullable JSONB and the portal renders nothing at all when it
    // is empty. All 503 stories on these ten boards were provisioned with it NULL; this is the
    // first one that carries it, so a missing one here is a silently absent section.
    expect(COMMAND_CENTER_ACCEPTANCE.length).toBeGreaterThan(0);
    for (const c of COMMAND_CENTER_ACCEPTANCE) expect(c.trim().length).toBeGreaterThan(20);
  });

  it('every criterion is checkable by looking at the page', () => {
    for (const c of COMMAND_CENTER_ACCEPTANCE) {
      expect(c).toMatch(/^(Given|Trust)/);
    }
  });

  it('none of them can be satisfied by marking the story complete', () => {
    const joined = COMMAND_CENTER_ACCEPTANCE.join(' ').toLowerCase();
    expect(joined).not.toMatch(/story is complete|mark(ed)? (it )?complete|when complete/);
  });

  it('pins the two that carry the governance, so they cannot be edited away quietly', () => {
    const joined = COMMAND_CENTER_ACCEPTANCE.join(' ');
    expect(joined).toContain('no_tool_grants');
    expect(joined).toMatch(/nothing on the page states or implies that filing it granted anything/);
  });
});
