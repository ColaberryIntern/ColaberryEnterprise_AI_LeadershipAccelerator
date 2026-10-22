/* eslint-disable */
// Unit tests for the discovery and legacy-migration Claude Code prompts.
//
// The guarantee worth pinning is a NEGATIVE one: no story in the programme may fall back to
// HUMAN_WORK_STATEMENT. `agentDomainProvisionPlan` substitutes that text whenever
// `claude_code_prompt` is empty, and it told Mihret there was nothing to run on a story that was
// in fact hers to build. Ali's rule, 2026-10-21: there are no manual tasks here, and every
// prompt is understood as something that will be run in Claude Code.
//
// So the coverage test reads the REAL prefix list from the generator rather than a copy. A sixth
// research story added later with no template would fail here instead of silently regressing an
// intern to "this story is human work".

import {
  researchPromptFor,
  RESEARCH_PROMPT_KEYS,
  RESEARCH_DELIVERABLES,
} from '../agentDomainResearchPrompts';

const ctx = {
  title: 'Compare the five system classes, and place this domain among them',
  domainTitle: 'Product Experience & UI/UX',
  manager: 'Mohammed Abdul Aleem',
  storyId: 'product_experience.RESEARCH-1-SYSTEM-CLASSES',
  release: 'Discovery and validation',
};

/** The generator's own five, plus the legacy story. Kept literal so a silent rename is caught. */
const GENERATOR_STORIES = [
  'RESEARCH-1-SYSTEM-CLASSES',
  'RESEARCH-2-AGENT-ANATOMY',
  'RESEARCH-3-ROLE-AND-DA-TRANSITION',
  'RESEARCH-4-MANAGER-INTERVIEW',
  'RESEARCH-5-THREE-PROPOSED-TASKS',
  'LEGACY-MIGRATION-PLAN',
];

describe('every story the generator makes has a prompt', () => {
  it('covers all six, so none can fall back to HUMAN_WORK_STATEMENT', () => {
    for (const key of GENERATOR_STORIES) {
      const out = researchPromptFor(`somedomain.${key}`, { ...ctx, storyId: `somedomain.${key}` });
      expect(out).not.toBeNull();
      expect((out as string).length).toBeGreaterThan(1500);
    }
  });

  it('exposes exactly those six keys and no stragglers', () => {
    expect([...RESEARCH_PROMPT_KEYS].sort()).toEqual([...GENERATOR_STORIES].sort());
  });

  it('names a deliverable file for every key', () => {
    for (const key of RESEARCH_PROMPT_KEYS) {
      expect(RESEARCH_DELIVERABLES[key]).toMatch(/^docs\/.+\.md$/);
    }
  });
});

describe('the prompt says it is Claude Code work, which is the whole point', () => {
  it('states it outright in every prompt', () => {
    for (const key of GENERATOR_STORIES) {
      const out = researchPromptFor(`d.${key}`, ctx) as string;
      expect(out).toContain('This is Claude Code work');
    }
  });

  it('NEVER says the thing that confused an intern', () => {
    for (const key of GENERATOR_STORIES) {
      const out = researchPromptFor(`d.${key}`, ctx) as string;
      expect(out).not.toMatch(/human work, not a Claude Code build/i);
      expect(out).not.toMatch(/no prompt on purpose/i);
    }
  });

  it('names the deliverable the intern commits, so nothing needs downloading', () => {
    for (const key of GENERATOR_STORIES) {
      const out = researchPromptFor(`d.${key}`, ctx) as string;
      expect(out).toContain(RESEARCH_DELIVERABLES[key]);
    }
  });
});

describe('the standing constraints survive in every prompt', () => {
  it('names the public platform repository, which is what blocked Sarbjit', () => {
    for (const key of GENERATOR_STORIES) {
      const out = researchPromptFor(`d.${key}`, ctx) as string;
      expect(out).toContain('github.com/ColaberryIntern/ColaberryEnterprise_AI_LeadershipAccelerator');
      expect(out).toMatch(/PUBLIC/);
    }
  });

  it('forbids sending anything and forbids changing an agent', () => {
    for (const key of GENERATOR_STORIES) {
      const out = researchPromptFor(`d.${key}`, ctx) as string;
      expect(out).toMatch(/authorizes an outbound message/i);
      expect(out).toMatch(/Nothing here changes an agent/i);
    }
  });

  it('tells the intern that unknown is a real answer', () => {
    for (const key of GENERATOR_STORIES) {
      const out = researchPromptFor(`d.${key}`, ctx) as string;
      expect(out).toMatch(/Unknown is a real answer/i);
    }
  });

  it('refuses the evidence a timer would give, in the story that teaches it', () => {
    const out = researchPromptFor('d.RESEARCH-5-THREE-PROPOSED-TASKS', ctx) as string;
    expect(out).toMatch(/4\.25-hour timer/);
    expect(out).toMatch(/may not be any of these/i);
  });

  it('states that the interview story sends nothing', () => {
    const out = researchPromptFor('d.RESEARCH-4-MANAGER-INTERVIEW', ctx) as string;
    expect(out).toMatch(/THIS STORY SENDS NOTHING/);
  });
});

describe('the header carries the story context', () => {
  it('includes the domain, manager, story id and release', () => {
    const out = researchPromptFor(ctx.storyId, ctx) as string;
    expect(out).toContain(ctx.domainTitle);
    expect(out).toContain(ctx.manager);
    expect(out).toContain(ctx.storyId);
    expect(out).toContain(ctx.release);
    expect(out).toContain(ctx.title);
  });

  it('points at the brief rather than repeating its numbers', () => {
    const out = researchPromptFor(ctx.storyId, ctx) as string;
    expect(out).toMatch(/The specification is the brief on this story, not this prompt/);
  });
});

describe('it returns null for a story it does not own', () => {
  it('declines a capability story, which has its own prompt', () => {
    expect(researchPromptFor('marketing.CAP.platform_app_review', ctx)).toBeNull();
  });

  it('declines STORY-000 and unknown ids', () => {
    expect(researchPromptFor('STORY-000', ctx)).toBeNull();
    expect(researchPromptFor('d.RESEARCH-9-DOES-NOT-EXIST', ctx)).toBeNull();
    expect(researchPromptFor('', ctx)).toBeNull();
    expect(researchPromptFor(null as any, ctx)).toBeNull();
  });
});

describe('determinism', () => {
  it('same input, same prompt', () => {
    expect(researchPromptFor(ctx.storyId, ctx)).toBe(researchPromptFor(ctx.storyId, ctx));
  });
});
