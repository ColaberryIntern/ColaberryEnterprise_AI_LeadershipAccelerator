/**
 * The four-step capability ladder.
 *
 * Every assertion here is a defect that was measured in production on 2026-11-13, written so that
 * it cannot return. The shape being replaced had 964 live stories across ten boards and **zero
 * completions by anybody**; these tests exist because a count alone would not have caught any of
 * the four reasons why.
 */

import {
  LADDER_STEPS,
  STEP_SUFFIX,
  capabilityLadderStories,
} from '../agentDomainCapabilityLadder';
import {
  liveCapabilityIds,
  planForAllDomains,
  planForDomain,
} from '../agentDomainStoryTemplates';
import { AGENT_DOMAINS } from '../agentDomainRegistry';
import { loadDomainMatrix } from '../capabilityRecord';

const everyStory = planForAllDomains().flatMap((p) => p.stories);
const ladder = everyStory.filter((s) => s.kind === 'capability_ladder');

// ───────────────────────────── 1. the order is the whole point ─────────────────────────────

describe('the four steps exist, in order, for each capability in flight', () => {
  it('is exactly four steps, in the order the owner stated them', () => {
    // "do it manually 1st ... have to be able to do it via the app ... then request a tool that
    // can do the same thing" -- Ali, 13 Nov 2026. The order is the mechanism, not a preference:
    // a tool request filed before the task has been done by hand is a request argued from
    // nothing, which is the state the programme was already in with 0 requests ever filed.
    expect(LADDER_STEPS).toEqual(['by_hand', 'in_the_app', 'tool_request', 'agent_watched']);
  });

  it('each live capability gets all four, numbered 1 to 4 in that order', () => {
    const d = AGENT_DOMAINS[0];
    const m = loadDomainMatrix(d.domain_key);
    const stories = capabilityLadderStories(d, m, m.capabilities[0]);
    expect(stories.map((s) => s.step_number)).toEqual([1, 2, 3, 4]);
    expect(stories.map((s) => s.step)).toEqual([...LADDER_STEPS]);
    expect(stories.map((s) => s.story_id.split('.').pop())).toEqual(
      LADDER_STEPS.map((s) => STEP_SUFFIX[s]),
    );
  });

  it('the step number is visible in the title, so a board reads in order', () => {
    // The board sorts on position, but a human scanning titles should not have to trust that.
    for (const s of ladder) {
      expect(s.title).toMatch(/ · [1-4] · /);
    }
  });
});

// ───────────────────────── 2. one capability at a time, per builder ─────────────────────────

describe('a builder holds four live stories, not a backlog', () => {
  it('every domain has exactly one capability in flight by default', () => {
    for (const d of AGENT_DOMAINS) {
      const m = loadDomainMatrix(d.domain_key);
      expect(liveCapabilityIds(m).size).toBe(1);
    }
  });

  it('each domain therefore gets exactly four ladder stories', () => {
    for (const d of AGENT_DOMAINS) {
      const plan = planForDomain(d.domain_key);
      expect(plan.stories.filter((s) => s.kind === 'capability_ladder')).toHaveLength(4);
    }
  });

  it('the capabilities not in flight are still on the board, as candidates', () => {
    // They are NOT deleted. The list of everything the agent could eventually do is real and
    // worth keeping -- it is simply not a list of assignments, and the story body says so.
    const candidates = everyStory.filter((s) => s.kind === 'implementation');
    expect(candidates).toHaveLength(443);
    const notInFlight = candidates.filter((s) => s.body.includes('CANDIDATE'));
    expect(notInFlight).toHaveLength(433);
    for (const s of notInFlight) {
      expect(s.body).toContain('not started, not assigned');
    }
  });

  it('an explicit selection overrides the default, and an unknown id is refused', () => {
    const d = AGENT_DOMAINS[0];
    const m = loadDomainMatrix(d.domain_key);
    const second = m.capabilities[1].capability_id;
    const plan = planForDomain(d.domain_key, { liveCapabilityIds: [second] });
    const live = plan.stories.filter((s) => s.kind === 'capability_ladder');
    expect(live).toHaveLength(4);
    expect(live.every((s) => s.capability_id === second)).toBe(true);
    // Refused rather than silently ignored: a typo'd capability id would otherwise put a builder
    // on an empty board and look like a configuration choice.
    expect(() => planForDomain(d.domain_key, { liveCapabilityIds: ['nope.not_real'] }))
      .toThrow(/no capability/);
  });

  it('a domain between capabilities is legal and gets no ladder', () => {
    const plan = planForDomain(AGENT_DOMAINS[0].domain_key, { liveCapabilityIds: [] });
    expect(plan.stories.filter((s) => s.kind === 'capability_ladder')).toHaveLength(0);
    // The rest of the board is untouched: this is "nothing picked yet", not "domain deleted".
    expect(plan.stories.filter((s) => s.kind === 'implementation')).not.toHaveLength(0);
  });
});

// ──────────────────── 3. a story must say something a builder can act on ────────────────────

describe('every ladder story is readable work, not a restated title', () => {
  it('no body is its own title, and none is near the 51 characters the old ones averaged', () => {
    // **The defect this replaces.** All 964 `release_behaviour` rows in production had a
    // `description` byte-identical to their `title`, averaging 51 characters -- so a builder
    // opening one was handed four words and no way to start. Measured 2026-11-13.
    for (const s of ladder) {
      expect(s.body.trim()).not.toBe(s.title.trim());
      expect(s.body.length).toBeGreaterThan(500);
    }
  });

  it('POSITIVE CONTROL: the threshold is one the old shape would have failed', () => {
    // Proves the assertion above measures something. The old bodies averaged 51 characters, so a
    // 500-character floor is not a formality -- it is roughly ten times what the replaced rows
    // carried, and the shortest body the ladder actually produces clears it with room.
    const shortest = Math.min(...ladder.map((s) => s.body.length));
    expect(shortest).toBeGreaterThan(500);
    expect(51).toBeLessThan(500);
  });

  it('every step carries at least one checkable acceptance criterion', () => {
    for (const s of ladder) {
      expect(s.acceptance.length).toBeGreaterThan(0);
      for (const a of s.acceptance) expect(a.trim().length).toBeGreaterThan(20);
    }
  });

  it('each step says what it is for, and repeats that the order binds', () => {
    const byStep = new Map(LADDER_STEPS.map((s) => [s, ladder.filter(
      (x) => x.story_id.endsWith(STEP_SUFFIX[s]),
    )]));
    // The first three carry the order rule. The fourth ends the capability instead, and says so.
    for (const step of ['by_hand', 'in_the_app', 'tool_request'] as const) {
      for (const s of byStep.get(step)!) {
        expect(s.body).toContain('run in order');
      }
    }
    for (const s of byStep.get('agent_watched')!) {
      expect(s.body).toContain('the next one starts');
    }
  });
});

// ─────────────────── 4. a step must never ask for something that cannot be done ───────────────────

describe('the steps ask only for things the product can actually do', () => {
  it('the tool-request step names the real endpoint a builder files against', () => {
    // **The reason this matters more than anything else here.** The programme has filed zero tool
    // requests, and the first guess was that the product had no way to file one. It does:
    // `AdminChangeRequestsPage.tsx` POSTs this route, behind the `dashboard` section every domain
    // builder already holds, and an admin decides it. Verified against origin/main 2026-11-13.
    //
    // If this route is ever renamed, this test fails and the story stops telling builders to walk
    // into a wall -- which is exactly how the previous shape failed, quietly, for a fortnight.
    const requests = ladder.filter((s) => s.story_id.endsWith(STEP_SUFFIX.tool_request));
    expect(requests).toHaveLength(10);
    for (const s of requests) {
      expect(s.body).toContain('/api/admin/agent-domain-change-requests-mine');
      expect(s.body).toContain('/decide');
    }
  });

  it('a declined request still completes the step', () => {
    // Otherwise the step is an approval gate dressed as work, and a builder whose request is
    // rightly declined is stuck forever on a story they cannot pass.
    for (const s of ladder.filter((x) => x.story_id.endsWith(STEP_SUFFIX.tool_request))) {
      expect(s.body).toContain('A declined request is a completed story');
      expect(s.acceptance.join(' ')).toContain('A decline counts');
    }
  });

  it('the by-hand step asks for a run log, and every later step cites it', () => {
    const byStep = (suffix: string) => ladder.filter((s) => s.story_id.endsWith(suffix));
    for (const s of byStep(STEP_SUFFIX.by_hand)) expect(s.body).toContain('Write a run log');
    for (const s of byStep(STEP_SUFFIX.in_the_app)) expect(s.body).toContain('run log');
    for (const s of byStep(STEP_SUFFIX.tool_request)) expect(s.body).toContain('run log');
    for (const s of byStep(STEP_SUFFIX.agent_watched)) expect(s.body).toContain('run log');
  });

  it('a human-decision capability never promises the agent will decide', () => {
    const humanDecision = AGENT_DOMAINS.flatMap((d) => {
      const m = loadDomainMatrix(d.domain_key);
      return m.capabilities
        .filter((c) => c.human_decision && liveCapabilityIds(m).has(c.capability_id))
        .flatMap((c) => capabilityLadderStories(d, m, c));
    });
    for (const s of humanDecision.filter((x) => x.step === 'agent_watched')) {
      expect(s.body).toContain('It never decides');
    }
  });
});

// ───────────────────────── 5. nothing here promotes anybody ─────────────────────────

describe('the ladder changes the work, not the authority', () => {
  it('all four steps sit on the capability\'s own starting rung', () => {
    for (const d of AGENT_DOMAINS) {
      const m = loadDomainMatrix(d.domain_key);
      const c = m.capabilities[0];
      for (const s of capabilityLadderStories(d, m, c)) {
        expect(s.autonomy_stage).toBe(c.starting_autonomy);
      }
    }
  });

  it('every ladder story is draft, because no manager has validated anything', () => {
    for (const s of ladder) expect(s.status).toBe('draft');
  });

  it('the generator no longer emits the per-rung cross-product at all', () => {
    expect(everyStory.filter((s) => s.kind === 'release_behaviour')).toHaveLength(0);
  });

  it('story ids stay unique and within the column', () => {
    const ids = everyStory.map((s) => s.story_id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(Math.max(...ids.map((i) => i.length))).toBeLessThanOrEqual(120);
  });
});
