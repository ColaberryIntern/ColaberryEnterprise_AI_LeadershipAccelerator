/**
 * STORY-000 — the Command Center.
 *
 * The whole cohort builds this first, from the same scaffold, wired to their
 * own plan. That makes one property load-bearing above all others: the prompt
 * must never state a fact the student's plan does not contain. A Command
 * Center that shows a plausible KPI nobody committed to, or a green light on
 * an integration nobody built, teaches students to trust a dashboard that is
 * lying to them — which is the opposite of the lesson.
 *
 * So these tests are mostly negative: given a thin plan, the prompt must say
 * "nothing here yet" rather than fill the gap.
 */
import {
  commandCenterPrompt, measures, guardrails, systemsOfRecord, agentRoster,
  COMMAND_CENTER_STORY_ID, COMMAND_CENTER_ACCEPTANCE,
} from '../commandCenterStory';
import { BuildPlan, PlanRequirement, PlanStory } from '../planContract';
import type { Schedule } from '../buildSchedule';

function req(id: string, over: Partial<PlanRequirement> = {}): PlanRequirement {
  return { id, statement: `The system must do ${id}.`, kind: 'FUNC', priority: 'must', cluster: 'core', ...over };
}
function story(id: string, over: Partial<PlanStory> = {}): PlanStory {
  return {
    id, release: 'r0', title: `Deliver ${id}`,
    narrative: `As an account owner, I want ${id}, so that the work lands.`,
    fulfills: [], owner_agent: 'Developer',
    acceptance: ['Given a, when b, then c.', 'Given d, when e, then f.', 'Trust — g.'],
    task_guidance: 'guidance', failure_paths: ['upstream down'],
    ...over,
  };
}

const RELEASES = [
  { key: 'r0', name: 'Walking skeleton', goal: 'g', demo: 'd', week_start: 1, week_end: 2 },
  { key: 'r1', name: 'Drafting', goal: 'g', demo: 'd', week_start: 3, week_end: 4 },
];

/** A rich plan: every section of the Command Center has something to show. */
function fullPlan(): BuildPlan {
  return {
    project_name: 'Client Onboarding Concierge',
    descriptor: 'runs a new client\'s first week',
    requirements: [
      req('REQ-001', { statement: 'The system must read the signed agreement from HelloSign.', kind: 'CONSTRAINT' }),
      req('REQ-002', { statement: 'The system must write to Basecamp to create the workspace.', kind: 'CONSTRAINT' }),
      req('REQ-003', { statement: 'Time from signature to kickoff booked must fall below 2 days.', kind: 'NFR', priority: 'should' }),
      req('REQ-004', { statement: 'Nothing is sent to a client without a named person approving it.', kind: 'SAFE' }),
      req('REQ-005', { statement: 'The system must draft the welcome pack.' }),
    ],
    releases: RELEASES,
    stories: [
      story('STORY-001', { fulfills: ['REQ-005'], owner_agent: 'Drafting Agent' }),
      story('STORY-002', { fulfills: ['REQ-004'], release: 'r1', owner_agent: 'Review Agent' }),
    ],
  };
}

/** A thin plan: no measure, no guardrail, no named system. */
function thinPlan(): BuildPlan {
  return {
    project_name: 'Something Vague', descriptor: 'does a thing',
    requirements: [req('REQ-001')],
    releases: RELEASES,
    stories: [story('STORY-001', { fulfills: ['REQ-001'] })],
  };
}

const schedule = (): Schedule => ({
  buildStart: new Date('2026-08-15T00:00:00Z'),
  buildEnd: new Date('2026-10-01T00:00:00Z'),
  demoDay: new Date('2026-10-08T00:00:00Z'),
  buildWeeks: 7, capacity: { low: 7, high: 14 }, totalTasks: 2,
  demoReleaseKey: null, roadmapReleaseKeys: [], verdict: 'comfortable',
  tasks: [
    { storyId: 'STORY-001', releaseKey: 'r0', dueOn: new Date('2026-08-20T00:00:00Z') },
    { storyId: 'STORY-002', releaseKey: 'r1', dueOn: new Date('2026-08-27T00:00:00Z') },
  ],
  prep: [],
});

// ── the load-bearing property ───────────────────────────────────────────────

describe('the prompt never invents what the plan does not contain', () => {
  it('says there is no numeric target rather than suggesting one', () => {
    const out = commandCenterPrompt(thinPlan(), schedule());

    expect(out).toMatch(/no numeric target yet/i);
    // No invented percentages, currency or day-counts anywhere in the doc.
    expect(out).not.toMatch(/\d+%/);
    expect(out).not.toMatch(/\$\d/);
  });

  it('says the guardrails tab is empty, and flags that as worth fixing', () => {
    const out = commandCenterPrompt(thinPlan(), schedule());

    expect(out).toMatch(/no requirement typed SAFE yet/i);
    expect(out).toMatch(/raise it with your instructor/i);
  });

  it('says no external system is named rather than listing a likely one', () => {
    const out = commandCenterPrompt(thinPlan(), schedule());

    expect(out).toMatch(/names no external system yet/i);
    expect(out).not.toMatch(/Slack|Salesforce|HubSpot|Stripe/);
  });

  it('insists indicators start grey, not green', () => {
    const out = commandCenterPrompt(fullPlan(), schedule());

    expect(out).toMatch(/Grey for unknown, not green/i);
    expect(out).toMatch(/must show that honestly rather than defaulting to green/i);
  });

  it('requires sample data to be labelled as sample everywhere', () => {
    const out = commandCenterPrompt(fullPlan(), schedule());

    expect(out).toMatch(/visibly labelled as sample/i);
    expect(out).toMatch(/Nobody should ever demo sample data by accident/i);
  });
});

// ── everything maps to their data ───────────────────────────────────────────

describe('every section is wired to the student\'s own plan', () => {
  it('names the project and lists every one of its requirements', () => {
    const plan = fullPlan();
    const out = commandCenterPrompt(plan, schedule());

    expect(out).toContain('Client Onboarding Concierge');
    for (const r of plan.requirements) expect(out).toContain(r.id);
  });

  it('shows the measures as KPI cards, by id', () => {
    const out = commandCenterPrompt(fullPlan(), schedule());
    expect(out).toMatch(/\*\*REQ-003\*\* — Time from signature/);
  });

  it('shows the SAFE requirement on the guardrails tab', () => {
    const out = commandCenterPrompt(fullPlan(), schedule());
    expect(out).toMatch(/\*\*REQ-004\*\* — Nothing is sent to a client/);
  });

  it('lists the systems the plan actually names', () => {
    expect(systemsOfRecord(fullPlan())).toEqual(['HelloSign', 'Basecamp']);
  });

  it('builds the agent roster from who owns each story', () => {
    expect(agentRoster(fullPlan())).toEqual([
      { name: 'Drafting Agent', stories: ['STORY-001'] },
      { name: 'Review Agent', stories: ['STORY-002'] },
    ]);
  });

  it('puts the real release dates on the Gantt, not placeholders', () => {
    const out = commandCenterPrompt(fullPlan(), schedule());

    expect(out).toContain('2026-08-20');
    expect(out).toContain('Demo day is 2026-10-08');
  });

  it('marks the demo target when the plan is larger than the window', () => {
    const s = { ...schedule(), demoReleaseKey: 'r0' };
    expect(commandCenterPrompt(fullPlan(), s)).toMatch(/Mark \*\*r0\*\* as the demo target/);
  });

  it('takes the user roles from the stories, skipping "As a system"', () => {
    const plan = fullPlan();
    plan.stories.push(story('STORY-003', { narrative: 'As a system, I want X, so that Y.' }));

    const out = commandCenterPrompt(plan, schedule());

    expect(out).toContain('account owner');
    expect(out).not.toMatch(/Roles in your plan: [^\n]*\bsystem\b/);
  });

  it('sends the student to their own requirements for the data model, and warns off vendor names', () => {
    // The first version guessed candidate tables from capitalised words and
    // returned the VENDORS (HelloSign, Basecamp) rather than the domain, because
    // domain nouns in a requirement are lowercase. Guessing was removed.
    const out = commandCenterPrompt(fullPlan(), schedule());

    expect(out).toMatch(/Derive them from your own requirements/i);
    expect(out).toMatch(/Do not name a table after a vendor/i);
    expect(out).toMatch(/starting point, not the answer/i);
  });
});

// ── shape ───────────────────────────────────────────────────────────────────

describe('shape', () => {
  it('is story zero, ahead of the student\'s own first story', () => {
    expect(COMMAND_CENTER_STORY_ID).toBe('STORY-000');
    expect(COMMAND_CENTER_STORY_ID < 'STORY-001').toBe(true);
  });

  it('carries all nine tabs', () => {
    const out = commandCenterPrompt(fullPlan(), schedule());
    for (const tab of [
      'Overview', 'Outcomes', 'Users and use case', 'Guardrails', 'Systems',
      'Project management', 'AI agents', 'Knowledge base', 'Data model',
    ]) expect(out).toContain(tab);
  });

  it('carries a trust line in its acceptance, like every other story', () => {
    expect(COMMAND_CENTER_ACCEPTANCE.filter((a) => a.startsWith('Trust'))).toHaveLength(1);
  });

  it('survives a plan with no schedule rather than throwing', () => {
    const out = commandCenterPrompt(fullPlan(), null);

    expect(out).toContain('Client Onboarding Concierge');
    expect(out).not.toContain('Demo day is');
  });

  it('is long enough to stand alone — it runs before any other context exists', () => {
    expect(commandCenterPrompt(fullPlan(), schedule()).length).toBeGreaterThan(3000);
  });

  it('measures and guardrails read only their own requirement kinds', () => {
    const plan = fullPlan();
    expect(measures(plan).map((r) => r.id)).toEqual(['REQ-003']);
    expect(guardrails(plan).map((r) => r.id)).toEqual(['REQ-004']);
  });
});
