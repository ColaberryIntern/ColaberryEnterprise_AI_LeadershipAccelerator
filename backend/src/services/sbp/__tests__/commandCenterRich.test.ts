/**
 * The Command Center a student builds has to be RICH, not merely honest.
 *
 * The ShiftFill end-to-end run (2026-11-20) handed the Story 000 prompt to a
 * fresh Claude Code session and got back nine tabs of text cards. Ali: "a very
 * shallow Command Center". The fixture here is that run's real plan, so these
 * tests pin the fixes against the case that exposed them:
 *
 *   - every tab says what good looks like, not only what not to fake;
 *   - plan.json carries what the student said (derived.understanding), who hands
 *     what to whom (derived.handoffs) and what moves (derived.artifacts);
 *   - STORY-000.md, plan.json and the prompt render from the same schedule and
 *     truth, so they cannot contradict each other;
 *   - `.nojekyll` ships, so a Pages-hosted Command Center can read its data;
 *   - the smaller contradictions the run found are gone.
 */
import { commandCenterPrompt, commandCenterStoryDoc } from '../commandCenterStory';
import { commandCenterTabSections } from '../commandCenterTabs';
import { understandingFor, handoffsFor, artifactsFor } from '../planDocumentInsights';
import { renderDocs, isAllowedPath, manifestPaths } from '../renderDocs';
import { buildPlanDocument, PLAN_FILE_PATH } from '../planDocument';
import { enrichmentPromptBlock } from '../enrichmentPromptBlock';
import { EVIDENCE_KINDS } from '../storyEnrichmentContract';
import { NOJEKYLL_PATH } from '../commandCenterLocation';
import { buildSchedule } from '../buildSchedule';
import type { BuildPlan } from '../planContract';
import type { UnderstandingItem } from '../../delivery/projectUnderstanding';
import raw from './fixtures/shiftfill-e2e-plan.json';

const plan = raw as unknown as BuildPlan;

const said = (dimension: UnderstandingItem['dimension'], value: string): UnderstandingItem => ({
  dimension, value, classification: 'FACT', provenance: 'source_message', source_quote: value,
});

/** What the ShiftFill student said, as the intake recorded it. */
const TRUTH: UnderstandingItem[] = [
  said('problem', 'An AI agent that fills last-minute hygienist shift gaps across our three dental offices.'),
  said('success_definition', 'Gaps filled within 30 minutes on 9 mornings out of 10, under 10 minutes of Dana\'s time.'),
  said('approval_points', 'Any offer that would put someone into overtime, and any message to a temp agency.'),
  said('actors', 'Dana, not technical, and 14 hygienists who only ever see a text message.'),
];

const schedule = buildSchedule({
  window: { cohortStart: new Date('2026-07-23T00:00:00Z'), asOf: new Date('2026-11-19T15:00:00Z') },
  releases: plan.releases,
  storiesByRelease: new Map(plan.releases.map((r) => [r.key, plan.stories.filter((s) => s.release === r.key).map((s) => s.id)])),
});

describe('every tab says what good looks like', () => {
  const tabs = commandCenterTabSections(plan, schedule).join('\n');
  const sections = tabs.split(/\n### /).slice(1);

  it('has nine tab sections, each with a "What good looks like" paragraph', () => {
    expect(sections).toHaveLength(9);
    for (const s of sections) expect(s).toContain('**What good looks like:**');
  });

  it('asks for a picture wherever the data has a shape', () => {
    for (const shape of [
      'release track', 'enforcement matrix', 'data-flow diagram', 'Gantt',
      'workflow diagram', 'traceability matrix', 'entity-relationship diagram',
    ]) {
      expect(tabs).toContain(shape);
    }
  });

  it('quotes the student on Overview and Outcomes rather than a template', () => {
    expect(sections[0]).toMatch(/student's OWN words/);
    expect(sections[0]).toContain('derived.understanding');
    expect(sections[1]).toContain('success_definition');
  });

  it('lists the agent hand-offs the plan states, by name', () => {
    expect(tabs).toContain('Gap Creator → Compliance Checker (Gap record)');
    expect(tabs).toContain('Compliance Checker → Shift Offer Sender (Eligible hygienist list)');
  });

  it('keeps every honesty rule', () => {
    expect(tabs).toContain('not checked from here');
    expect(tabs).toContain('no runs recorded');
    expect(tabs).toContain('not measured yet');
  });

  it('names skills needed and skills built apart, instead of contradicting the plan', () => {
    expect(tabs).not.toContain('On real data there are no skills yet');
    expect(tabs).toMatch(/\*\*skills it needs\*\*/);
    expect(tabs).toMatch(/\*\*skills built\*\*/);
  });

  it('makes the knowledge-base question box a local search, not a model', () => {
    expect(tabs).toMatch(/LOCAL search/);
    expect(tabs).toMatch(/cannot hold an API key/);
  });

  it('says where hand-written content lives, so it never has to be hard-coded', () => {
    expect(tabs).toContain('command-center/data-model.json');
    expect(tabs).toContain('command-center/notes.json');
    expect(tabs).toContain('.colaberry/enrichment/<story id>.json');
  });

  it('tells the agent the file wins over the dates printed in the prompt', () => {
    expect(tabs).toMatch(/the file wins/);
  });
});

describe('plan.json carries what a rich page needs', () => {
  it('quotes the student, with how settled each statement is', () => {
    const u = understandingFor(TRUTH);
    const success = u.entries.find((e) => e.dimension === 'success_definition')!;
    expect(success.statement).toContain('9 mornings out of 10');
    expect(success.standing).toBe('stated_not_confirmed');
    expect(success.heading).toBe('What good looks like');
    expect(u.unanswered.length).toBeGreaterThan(0);
  });

  it('renders an empty understanding, not a missing key, when there is no intake', () => {
    expect(understandingFor(null)).toEqual({ entries: [], unanswered: [] });
    const doc = buildPlanDocument(plan, {});
    expect(doc.derived.understanding.entries).toEqual([]);
  });

  it('joins handoffs on exact names only', () => {
    const h = handoffsFor(plan.agents);
    expect(h.length).toBeGreaterThanOrEqual(3);
    for (const edge of h) {
      const from = plan.agents!.find((a) => a.name === edge.from_agent)!;
      const to = plan.agents!.find((a) => a.name === edge.to_agent)!;
      expect(from.outputs.map((o) => o.toLowerCase())).toContain(edge.via.toLowerCase());
      expect(to.inputs.map((i) => i.toLowerCase())).toContain(edge.via.toLowerCase());
    }
  });

  it('lists every named thing the agents move, with who produces and reads it', () => {
    const a = artifactsFor(plan.agents);
    const gap = a.find((x) => x.name === 'Gap record')!;
    expect(gap.produced_by).toEqual(['Gap Creator']);
    expect(gap.read_by).toEqual(expect.arrayContaining(['Compliance Checker', 'Gap Escalator']));
  });

  it('is deterministic: shuffled agents and truth give byte-identical derived blocks', () => {
    const shuffled = { ...plan, agents: [...plan.agents!].reverse() };
    const a = JSON.stringify(buildPlanDocument(plan, { truth: TRUTH }).derived);
    const b = JSON.stringify(buildPlanDocument(shuffled, { truth: [...TRUTH].reverse() }).derived);
    expect(a).toBe(b);
  });
});

describe('STORY-000.md, plan.json and the prompt agree', () => {
  const files = renderDocs(plan, { schedule, truth: { items: TRUTH, revision: 1 }, projectId: 'p1' });
  const doc = files.find((f) => f.path === 'docs/stories/STORY-000.md')!.content;
  const planJson = JSON.parse(files.find((f) => f.path === PLAN_FILE_PATH)!.content);

  it('renders the truth section the enrichment step tells every agent to read', () => {
    expect(doc).toContain('## What the platform understands about this project');
    expect(doc).toContain('9 mornings out of 10');
  });

  it('puts the student\'s words in plan.json', () => {
    expect(planJson.derived.understanding.entries.length).toBe(TRUTH.length);
    expect(planJson.derived.handoffs.length).toBeGreaterThan(0);
  });

  it('dates the doc from the same schedule plan.json carries', () => {
    expect(planJson.schedule).not.toBeNull();
    for (const s of planJson.stories) {
      expect(s.due_on).not.toBeNull();
      expect(doc).toContain(`${s.id} — ${s.title} (due ${s.due_on})`);
    }
  });

  it('never dates a build published after its cohort window into the past', () => {
    for (const s of planJson.stories) expect(s.due_on >= '2026-11-19').toBe(true);
  });

  it('matches the portal prompt exactly for the same inputs', () => {
    expect(doc).toContain(commandCenterPrompt(plan, schedule));
  });
});

describe('the smaller contradictions the run found', () => {
  const prompt = commandCenterPrompt(plan, schedule);

  it('ships .nojekyll so a Pages-hosted Command Center can load .colaberry/', () => {
    const files = renderDocs(plan, {});
    expect(isAllowedPath(NOJEKYLL_PATH)).toBe(true);
    expect(files.map((f) => f.path)).toContain(NOJEKYLL_PATH);
    expect(manifestPaths(files)).toContain(NOJEKYLL_PATH);
    expect(prompt).toContain(NOJEKYLL_PATH);
    // Still exactly one root file: the allowlist did not open the root up.
    expect(isAllowedPath('index.html')).toBe(false);
    expect(isAllowedPath('.nojekyll.bak')).toBe(false);
  });

  it('explains that the totals include STORY-000', () => {
    expect(prompt).toMatch(/includes this one, `STORY-000`/);
  });

  it('says null verification is "not checked yet", not not_started', () => {
    expect(prompt).toMatch(/Null is not `not_started`/);
  });

  it('covers freshness between a day and a week', () => {
    expect(prompt).toMatch(/Between a day and a week old/);
  });

  it('collects questions instead of stopping the build for them', () => {
    expect(prompt).not.toContain('## Stop and ask me if');
    expect(prompt).toContain('## Questions to raise, without stopping');
  });

  it('fetches relative to the root entry point', () => {
    expect(prompt).toContain('`./.colaberry/plan.json`');
  });

  it('lists exactly the evidence kinds the contract accepts', () => {
    const block = enrichmentPromptBlock({ projectId: 'p', storyId: 'STORY-001' });
    expect(block).toContain(EVIDENCE_KINDS.join(', '));
    expect(block).toMatch(/placeholder: replace it with the number you read/);
    expect(block).toMatch(/git rev-parse HEAD/);
  });

  it('renders the doc without truth exactly as before: no promised section', () => {
    const bare = commandCenterStoryDoc(plan, null);
    expect(bare).not.toContain('## What the platform understands about this project');
  });
});
