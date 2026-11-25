import {
  proposalReadinessTaskColumns,
  proposalChainHeadBlockedBy,
  PROPOSAL_STORY_IDS,
  GOV_PROPOSAL_EMAIL_TAG,
} from '../proposalReadinessStories';
import { COMMAND_CENTER_STORY_ID } from '../commandCenterStory';
import { CONNECTED_DEMO_STORY_ID } from '../connectedDemoStory';
import type { BuildPlan } from '../planContract';

const plan = (project_name = 'TxDOT Claims DB'): BuildPlan => ({
  project_name,
  descriptor: 'a gov build',
  requirements: [],
  releases: [],
  stories: [],
});

describe('proposalReadinessStories (M3)', () => {
  it('returns exactly the eight P-stories in ladder order', () => {
    const cols = proposalReadinessTaskColumns(plan());
    expect(cols.map((c) => c.story_id)).toEqual([
      'STORY-P1', 'STORY-P2', 'STORY-P3', 'STORY-P4',
      'STORY-P5', 'STORY-P6', 'STORY-P7', 'STORY-P8',
    ]);
    expect(PROPOSAL_STORY_IDS).toHaveLength(8);
  });

  it('every story has title, narrative, build, and acceptance, and build is grounded in the project name', () => {
    const cols = proposalReadinessTaskColumns(plan('MAPLOCA CRM'));
    for (const c of cols) {
      expect(c.title).toMatch(/^P[1-8] -/);
      expect(c.narrative.length).toBeGreaterThan(10);
      expect(c.build).toContain('MAPLOCA CRM'); // grounded, not a generic stub
      expect(c.acceptance.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('every story acceptance has exactly one Trust line (house pattern)', () => {
    for (const c of proposalReadinessTaskColumns(plan())) {
      const trust = c.acceptance.filter((a) => a.trim().startsWith('Trust'));
      expect(trust).toHaveLength(1);
    }
  });

  it('P1 orient references the already-present Command Center and connected demo (M3-T3)', () => {
    const p1 = proposalReadinessTaskColumns(plan())[0];
    const text = `${p1.narrative} ${p1.build} ${p1.acceptance.join(' ')}`;
    expect(text).toContain('Command Center');
    expect(text.toLowerCase()).toContain('connected demo');
    expect(p1.build).toContain(COMMAND_CENTER_STORY_ID); // STORY-000
    expect(p1.build).toContain(CONNECTED_DEMO_STORY_ID); // STORY-900
  });

  it('the Sharath-contact stories carry the gov-proposal subject tag so his gov replies are recognized', () => {
    const byId = Object.fromEntries(proposalReadinessTaskColumns(plan()).map((c) => [c.story_id, c]));
    // P2 rapport, P4 collect, P7 submit all email Sharath.
    for (const id of ['STORY-P2', 'STORY-P4', 'STORY-P7']) {
      expect(byId[id].build).toContain(GOV_PROPOSAL_EMAIL_TAG);
    }
    // P2 makes it an acceptance criterion.
    expect(byId['STORY-P2'].acceptance.some((a) => a.includes(GOV_PROPOSAL_EMAIL_TAG))).toBe(true);
    expect(GOV_PROPOSAL_EMAIL_TAG).toBe('[Gov Proposal]');
  });

  it('chain head gates on the connected demo when present, else the Command Center', () => {
    expect(proposalChainHeadBlockedBy(true)).toEqual([CONNECTED_DEMO_STORY_ID]);
    expect(proposalChainHeadBlockedBy(false)).toEqual([COMMAND_CENTER_STORY_ID]);
  });

  it('is deterministic (two calls produce identical columns)', () => {
    expect(JSON.stringify(proposalReadinessTaskColumns(plan()))).toBe(
      JSON.stringify(proposalReadinessTaskColumns(plan())),
    );
  });

  it('is null-safe on a plan with no project name', () => {
    const cols = proposalReadinessTaskColumns({ ...plan(), project_name: '' });
    expect(cols).toHaveLength(8);
    expect(cols[0].build).toContain('this pursuit'); // fallback
  });
});
